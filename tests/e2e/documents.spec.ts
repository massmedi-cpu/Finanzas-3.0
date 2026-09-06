import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const unknownDocumentId = "91000000-0000-4000-8000-000000000091";
const unknownTransactionId = "92000000-0000-4000-8000-000000000092";

test("document API rejects invalid inputs before persistence", async ({ request }) => {
  const invalidLimit = await request.get("/api/documents?limit=101");
  expect(invalidLimit.status()).toBe(400);
  await expect(invalidLimit.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_limit" });

  const invalidId = await request.get("/api/documents?id=not-a-uuid");
  expect(invalidId.status()).toBe(400);
  await expect(invalidId.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_id" });

  const invalidMode = await request.get(`/api/documents?id=${unknownDocumentId}&mode=ocr`);
  expect(invalidMode.status()).toBe(400);
  await expect(invalidMode.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_mode" });

  const unsupportedMime = await request.post("/api/documents", {
    data: {
      action: "upload_sign",
      type: "invoice",
      originalFileName: "unsafe.exe",
      mimeType: "application/octet-stream",
      sizeBytes: 100,
    },
  });
  expect(unsupportedMime.status()).toBe(400);
  await expect(unsupportedMime.json()).resolves.toEqual({ error: "invalid_request", code: "unsupported_document_mime_type" });

  const invalidAssociation = await request.patch("/api/documents", {
    data: {
      action: "associate",
      documentId: unknownDocumentId,
      transactionId: unknownTransactionId,
      method: "automatic",
    },
  });
  expect(invalidAssociation.status()).toBe(400);
  await expect(invalidAssociation.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_association_method" });
});

test("document metadata validation accepts Spanish financial boundaries and rejects unsafe values", async ({ request }) => {
  const invalidDate = await request.patch("/api/documents", {
    data: {
      action: "metadata",
      id: unknownDocumentId,
      type: "invoice",
      documentDate: "2026-02-30",
      issuerName: "Proveedor",
      totalCents: 1234,
      notes: "",
    },
  });
  expect(invalidDate.status()).toBe(400);
  await expect(invalidDate.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_date" });

  const invalidTotal = await request.patch("/api/documents", {
    data: {
      action: "metadata",
      id: unknownDocumentId,
      type: "invoice",
      documentDate: "2026-09-06",
      issuerName: "Proveedor",
      totalCents: Number.MAX_SAFE_INTEGER + 1,
      notes: "",
    },
  });
  expect(invalidTotal.status()).toBe(400);
  await expect(invalidTotal.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_total" });
});

test("protected preview exposes exact phase 9 build and side-effect-free document contract", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const build = await request.get("/api/build");
  expect(build.status()).toBe(200);
  const buildJson = await build.json();
  expect(buildJson.phase).toBe(9);
  expect(buildJson.phaseName).toBe("Documentos sin OCR");
  expect(buildJson.phaseBlock).toBe(1);
  expect(buildJson.phaseBlockName).toBe("Gestión documental");
  if (process.env.GITHUB_SHA) expect(buildJson.commit).toBe(process.env.GITHUB_SHA);

  const snapshot = await request.get("/api/documents?limit=50&offset=0");
  expect(snapshot.status()).toBe(200);
  const body = await snapshot.json();
  expect(body.contractVersion).toBe(1);
  expect(body.principles.bankSource).toBe("read_only");
  expect(body.principles.ocrEnabled).toBe(false);
  expect(body.principles.suggestionsPersisted).toBe(false);
  expect(body.principles.associationsRequireConfirmation).toBe(true);
  expect(body.principles.getHasSideEffects).toBe(false);
  expect(Array.isArray(body.items)).toBe(true);
  expect(Number.isSafeInteger(body.total)).toBe(true);

  const missing = await request.get(`/api/documents?id=${unknownDocumentId}`);
  expect(missing.status()).toBe(404);
  const missingBody = await missing.json();
  expect(missingBody.error).toBe("not_found");
});
