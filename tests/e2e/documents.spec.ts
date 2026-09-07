import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const unknownDocumentId = "91000000-0000-4000-8000-000000000091";
const unknownTransactionId = "92000000-0000-4000-8000-000000000092";
const documentId = "93000000-0000-4000-8000-000000000093";
const transactionId = "94000000-0000-4000-8000-000000000094";

const principles = { bankSource: "read_only", ocrEnabled: false, getHasSideEffects: false, suggestionsPersisted: false, associationsRequireConfirmation: true };
const item = {
  id: documentId, type: "invoice", notes: "", status: "pending_review", mimeType: "application/pdf",
  createdAt: "2026-09-06T20:00:00Z", sizeBytes: 1234, updatedAt: "2026-09-06T20:00:00Z",
  issuerName: "Proveedor Demo", totalCents: 5404, documentDate: "2026-09-02", storageProvider: "supabase",
  associationCount: 0, originalFileName: "factura-demo.pdf", sourceModifiedAt: "2026-09-06T20:00:00Z", sourceDriveFileId: null,
};

async function mockDocumentApi(page: import("@playwright/test").Page, writes: Array<Record<string, unknown>>) {
  let detail = { contractVersion: 1, document: { ...item }, associations: [] as any[], principles };
  await page.route("**/api/documents*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "GET" && url.searchParams.get("mode") === "candidates") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ contractVersion: 1, documentId, ready: true, reason: null, days: 7, amountToleranceCents: 200, principles: { bankSource: "read_only", requiresConfirmation: true, suggestionsPersisted: false }, candidates: [{ transactionId, date: "2026-09-02", concept: "COMUNIDAD BLOQUE", accountId: "95000000-0000-4000-8000-000000000095", accountName: "Cuenta corriente", amountCents: -5404, categoryId: null, merchantId: null, merchantName: null, confidence: 1, dayDifference: 0, amountDifferenceCents: 0, effectiveKind: "expense" }] }) });
      return;
    }
    if (method === "GET" && url.searchParams.get("mode") === "open") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ provider: "supabase", url: "https://storage.mock/open", expiresInSeconds: 300 }) }); return;
    }
    if (method === "GET" && url.searchParams.has("id")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); return;
    }
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ contractVersion: 1, items: [{ ...detail.document, associationCount: detail.associations.length }], total: 1, limit: 50, offset: 0, principles }) }); return;
    }
    const body = request.postDataJSON() as Record<string, any>;
    writes.push({ method, ...body });
    if (method === "PATCH" && body.action === "metadata") {
      detail = { ...detail, document: { ...detail.document, type: body.type, documentDate: body.documentDate, issuerName: body.issuerName, totalCents: body.totalCents, notes: body.notes } };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); return;
    }
    if (method === "PATCH" && body.action === "associate") {
      detail = { ...detail, associations: [{ id: "96000000-0000-4000-8000-000000000096", date: "2026-09-02", method: body.method, concept: "COMUNIDAD BLOQUE", accountId: "95000000-0000-4000-8000-000000000095", accountName: "Cuenta corriente", confirmed: true, amountCents: -5404, transactionId: body.transactionId, categoryId: null, merchantId: null, merchantName: null, effectiveKind: "expense", confidence: 1 }] };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); return;
    }
    if (method === "PATCH" && body.action === "unassociate") {
      detail = { ...detail, associations: [] };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); return;
    }
    if (method === "PATCH" && body.action === "status") {
      detail = { ...detail, document: { ...detail.document, status: body.status } };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); return;
    }
    if (method === "POST" && body.action === "upload_sign") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bucket: "financial-app-documents", path: "uploads/97000000-0000-4000-8000-000000000097.pdf", token: "token", signedUrl: "https://storage.mock/upload", maxFileBytes: 15728640 }) }); return;
    }
    if (method === "POST" && body.action === "upload_finalize") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); return;
    }
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "unsupported" }) });
  });
  await page.route("https://storage.mock/upload", async (route) => route.fulfill({ status: 200, body: "ok" }));
  await page.route("**/api/transactions*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [{ id: transactionId, bankDate: "2026-09-02", amountCents: -5404, account: { id: "95000000-0000-4000-8000-000000000095", name: "Cuenta corriente" }, concept: { original: "COMUNIDAD BLOQUE", processed: "COMUNIDAD BLOQUE", effective: "COMUNIDAD BLOQUE" }, merchant: { effectiveName: null }, category: { effectiveName: null }, kind: { effective: "expense" } }], totalCount: 1, hasMore: false, nextCursor: null }) }));
}

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
  const unsupportedMime = await request.post("/api/documents", { data: { action: "upload_sign", type: "invoice", originalFileName: "unsafe.exe", mimeType: "application/octet-stream", sizeBytes: 100 } });
  expect(unsupportedMime.status()).toBe(400);
  await expect(unsupportedMime.json()).resolves.toEqual({ error: "invalid_request", code: "unsupported_document_mime_type" });
  const invalidAssociation = await request.patch("/api/documents", { data: { action: "associate", documentId: unknownDocumentId, transactionId: unknownTransactionId, method: "automatic" } });
  expect(invalidAssociation.status()).toBe(400);
  await expect(invalidAssociation.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_association_method" });
});

test("document metadata validation accepts Spanish financial boundaries and rejects unsafe values", async ({ request }) => {
  const invalidDate = await request.patch("/api/documents", { data: { action: "metadata", id: unknownDocumentId, type: "invoice", documentDate: "2026-02-30", issuerName: "Proveedor", totalCents: 1234, notes: "" } });
  expect(invalidDate.status()).toBe(400);
  await expect(invalidDate.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_date" });
  const invalidTotal = await request.patch("/api/documents", { data: { action: "metadata", id: unknownDocumentId, type: "invoice", documentDate: "2026-09-06", issuerName: "Proveedor", totalCents: Number.MAX_SAFE_INTEGER + 1, notes: "" } });
  expect(invalidTotal.status()).toBe(400);
  await expect(invalidTotal.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_total" });
});

test("Documentos renders responsive contract and explicit no-OCR semantics", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "Documentos", level: 1 })).toBeVisible();
  await expect(page.getByText("factura-demo.pdf").first()).toBeVisible();
  await expect(page.getByText(/OCR desactivado/).first()).toBeVisible();
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await expect(page.getByRole("heading", { name: "factura-demo.pdf" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  const undersized = await page.locator("main button, main input, main select").evaluateAll((elements) => elements.filter((el) => { const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.height < 44; }).length);
  expect(undersized).toBe(0);
});

test("Documentos confirms suggestions explicitly and allows reversible associations", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Buscar sugerencias" }).click();
  await expect(page.getByText("COMUNIDAD BLOQUE").first()).toBeVisible();
  expect(writes.some((write) => write.action === "associate")).toBe(false);
  await page.getByRole("button", { name: "Confirmar sugerencia" }).click();
  await expect.poll(() => writes.some((write) => write.action === "associate" && write.method === "suggested")).toBe(true);
  await expect(page.getByText("Sugerencia confirmada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Desasociar" }).click();
  await expect.poll(() => writes.some((write) => write.action === "unassociate")).toBe(true);
});

test("Documentos searches real movements for manual association instead of asking for UUID", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByLabel("Buscar movimiento").fill("comunidad");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByText("COMUNIDAD BLOQUE").first()).toBeVisible();
  await page.getByRole("button", { name: "Asociar", exact: true }).click();
  await expect.poll(() => writes.some((write) => write.action === "associate" && write.method === "manual")).toBe(true);
});

test("Documentos uploads through private signed storage and finalizes without OCR", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByLabel("Archivo").setInputFiles({ name: "nueva-factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await page.getByRole("button", { name: "Guardar documento" }).click();
  await expect.poll(() => writes.some((write) => write.action === "upload_sign")).toBe(true);
  await expect.poll(() => writes.some((write) => write.action === "upload_finalize")).toBe(true);
  await expect(page.getByRole("status")).toContainText("OCR no se ha ejecutado");
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
  expect((await missing.json()).error).toBe("not_found");
});
