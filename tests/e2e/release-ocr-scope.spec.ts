import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDocumentOcrDeferred, isDocumentDriveSyncDeferred } from "../../src/application/release-ocr-scope";

test("REC-REL-371 · only explicit launch deferral disables advanced OCR", () => {
  expect(isDocumentOcrDeferred("deferred")).toBe(true);
  for (const value of ["enabled", "false", "", undefined]) {
    // Explicitly preserve the stable feature surface unless the release
    // configuration opts into a full, audited OCR cut.
    expect(isDocumentOcrDeferred(value ?? "enabled")).toBe(false);
  }
});

test("REC-REL-372 · cut has both UI and server enforcement, never CSS-only", () => {
  const root = process.cwd();
  const panel = readFileSync(join(root, "app/documents/documents-client.tsx"), "utf8");
  const ocr = readFileSync(join(root, "app/api/documents/ocr/route.ts"), "utf8");
  const review = readFileSync(join(root, "app/api/documents/ocr-review/route.ts"), "utf8");
  expect(panel).toContain("{!isDocumentOcrDeferred() && (");
  expect(panel).toContain("{!isDocumentOcrDeferred() && <span>OCR revisable");
  for (const handler of [ocr, review]) {
    expect(handler).toContain('import { isDocumentOcrDeferred }');
    for (const method of handler === ocr ? ["GET", "POST"] : ["GET", "PATCH"]) {
      expect(handler).toMatch(new RegExp(
        "export async function " + method +
        "\\([^)]*\\) \\{\\s*if \\(isDocumentOcrDeferred\\(\\)\\)",
      ));
    }
    expect(handler).toContain('error: "feature_deferred", code: null');
    expect(handler).toContain("status: 404, headers: HEADERS");
  }
});

test("REC-REL-373 · deferred OCR endpoints reject direct requests before any data access", async () => {
  const original = process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_OCR;
  process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_OCR = "deferred";
  try {
    const ocr = await import("../../app/api/documents/ocr/route");
    const review = await import("../../app/api/documents/ocr-review/route");
    const id = "93000000-0000-4000-8000-000000000117";
    const cases = [
      ocr.GET(new Request("http://localhost/api/documents/ocr?id=" + id)),
      ocr.POST(new Request("http://localhost/api/documents/ocr?id=" + id, {method: "POST"})),
      review.GET(new Request("http://localhost/api/documents/ocr-review?id=" + id)),
      review.PATCH(new Request("http://localhost/api/documents/ocr-review", {method: "PATCH"})),
    ];
    for (const pending of cases) {
      const response = await pending;
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({error: "feature_deferred", code: null});
    }
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_OCR;
    else process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_OCR = original;
  }
});

test("REC-REL-374 · only explicit launch deferral disables automatic Drive document imports", () => {
  expect(isDocumentDriveSyncDeferred("deferred")).toBe(true);
  for (const value of ["enabled", "false", "", "1"]) {
    expect(isDocumentDriveSyncDeferred(value)).toBe(false);
  }
});

test("REC-REL-375 · Drive auto-import is cut in both UI and direct HTTP", async () => {
  const root = process.cwd();
  const page = readFileSync(join(root, "app/documents/page.tsx"), "utf8");
  const route = readFileSync(join(root, "app/api/documents/drive-sync/route.ts"), "utf8");
  expect(page).toContain("{!isDocumentDriveSyncDeferred() && <DriveAutoSync />}");
  expect(route).toContain("if (isDocumentDriveSyncDeferred()) {");
  const original = process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DRIVE_SYNC;
  process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DRIVE_SYNC = "deferred";
  try {
    const { POST } = await import("../../app/api/documents/drive-sync/route");
    const response = await POST();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({error: "feature_deferred", code: null});
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DRIVE_SYNC;
    else process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DRIVE_SYNC = original;
  }
});
