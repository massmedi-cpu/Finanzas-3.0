import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { isDocumentsDeferred, isReleaseHrefAvailable } from "../../src/application/release-document-scope";
import { isDocumentOcrDeferred, isDocumentDriveSyncDeferred } from "../../src/application/release-ocr-scope";

async function withDocumentsDeferred(run: () => Promise<void>) {
  const previous = process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DOCUMENTS;
  process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DOCUMENTS = "deferred";
  try { await run(); }
  finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DOCUMENTS;
    else process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DOCUMENTS = previous;
  }
}

test("REC-REL-379 · complete document cut overrides enabled child flags and preserves bank destinations", async () => {
  expect(isDocumentsDeferred("deferred")).toBe(true);
  expect(isDocumentsDeferred("enabled")).toBe(false);
  await withDocumentsDeferred(async () => {
    expect(isDocumentOcrDeferred("enabled")).toBe(true);
    expect(isDocumentDriveSyncDeferred("enabled")).toBe(true);
    for (const href of ["/documents", "/documents?documentId=synthetic", "/documents/#original"]) {
      expect(isReleaseHrefAvailable(href)).toBe(false);
    }
    for (const href of ["/", "/transactions", "/configuration/source", "/configuration/data"]) {
      expect(isReleaseHrefAvailable(href)).toBe(true);
    }
  });
});

test("REC-REL-380 · disabled document HTTP handlers cannot read input or contact any provider", async () => {
  await withDocumentsDeferred(async () => {
    const documents = await import("../../app/api/documents/route");
    const deletion = await import("../../app/api/documents/delete/route");
    const download = await import("../../app/api/documents/download/route");
    const ocr = await import("../../app/api/documents/ocr/route");
    const drive = await import("../../app/api/documents/drive-sync/route");
    const originalFetch = globalThis.fetch;
    let externalReads = 0;
    globalThis.fetch = async () => { externalReads += 1; throw new Error("unexpected_external_read"); };
    try {
      const cases: Array<[string, (request: Request) => Promise<Response>]> = [
        ["GET", documents.GET], ["POST", documents.POST], ["PATCH", documents.PATCH],
        ["GET", deletion.GET], ["DELETE", deletion.DELETE], ["GET", download.GET],
        ["GET", ocr.GET], ["POST", ocr.POST], ["POST", drive.POST],
      ];
      for (const [method, handler] of cases) {
        const request = new Request("http://localhost/api/documents?id=invalid", {
          method, ...(["POST", "PATCH"].includes(method) ? { body: "deliberately invalid JSON" } : {}),
        });
        const response = await handler(request);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "feature_deferred", code: null });
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(request.bodyUsed).toBe(false);
      }
      expect(externalReads).toBe(0);
    } finally { globalThis.fetch = originalFetch; }
  });
});

test("REC-REL-381 · deep transaction document and OCR selectors are denied before gateway access", async () => {
  await withDocumentsDeferred(async () => {
    const transactions = await import("../../app/api/transactions/route");
    for (const query of ["hasDocument=true", "documentQuery=private", "ocrQuery=private"]) {
      const response = await transactions.GET(new Request("http://localhost/api/transactions?" + query));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "feature_deferred", code: null });
    }
  });
});

test("REC-REL-382 · build attests actual scope and the full cut is selected by the CI gate", async () => {
  await withDocumentsDeferred(async () => {
    const build = await import("../../app/api/build/route");
    expect((await build.GET().json()).releaseFeatures).toEqual({
      documents: false, documentOcr: false, documentDriveSync: false,
    });
  });
  const workflow = readFileSync(".github/workflows/product-recovery-ui.yml", "utf8");
  for (const path of ["release-ocr-scope.spec.ts", "release-document-scope.spec.ts", "release-document-scope-ui.spec.ts"]) {
    expect(workflow).toContain(path);
  }
  const review = readFileSync("app/api/documents/ocr-review/route.ts", "utf8");
  for (const method of ["GET", "PATCH"]) {
    const start = review.indexOf("export async function " + method + "(");
    const body = review.slice(start, start + 650);
    expect(body.indexOf("await requireVerifiedSourceWorkspace()")).toBeLessThan(body.indexOf("if (isDocumentOcrDeferred())"));
  }
});
