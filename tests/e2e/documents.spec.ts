import { expect, test } from "@playwright/test";
import { SUPABASE_ORIGIN } from "../../src/infrastructure/auth/supabase-auth";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const unknownDocumentId = "91000000-0000-4000-8000-000000000091";
const unknownTransactionId = "92000000-0000-4000-8000-000000000092";
const documentId = "93000000-0000-4000-8000-000000000093";
const transactionId = "94000000-0000-4000-8000-000000000094";
const signedUploadUrl = `${SUPABASE_ORIGIN}/storage/v1/object/upload/sign/financial-app-documents/test-upload`;

const principles = { bankSource: "read_only", ocrEnabled: false, getHasSideEffects: false, suggestionsPersisted: false, associationsRequireConfirmation: true };
const item = {
  id: documentId, type: "invoice", notes: "", status: "pending_review", mimeType: "application/pdf",
  createdAt: "2026-09-06T20:00:00Z", sizeBytes: 1234, updatedAt: "2026-09-06T20:00:00Z",
  issuerName: "Proveedor Demo", totalCents: 5404, documentDate: "2026-09-02", storageProvider: "supabase",
  associationCount: 0, originalFileName: "factura-demo.pdf", sourceModifiedAt: "2026-09-06T20:00:00Z", sourceDriveFileId: null,
};

async function mockDocumentApi(
  page: import("@playwright/test").Page,
  writes: Array<Record<string, unknown>>,
  ocrReads: string[] = [],
) {
  let detail = { contractVersion: 1, document: { ...item }, associations: [] as any[], principles };

  await page.route("**/api/documents/ocr-review*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        runs: [{
          id: "98000000-0000-4000-8000-000000000098",
          extractor: "pdfjs-6.2.108-native-text",
          extractedAt: "2026-09-07T07:00:00.000Z",
        }],
        reviews: [],
      }),
    });
  });

  await page.route(/\/api\/documents\/ocr(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    ocrReads.push(url.searchParams.get("id") ?? "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        documentId,
        status: "ready",
        source: "pdf_text",
        extractor: "pdfjs-6.2.108-native-text",
        extractedAt: "2026-09-07T07:00:00.000Z",
        confidence: 1,
        plainText: "FACTURA DEMO\nTOTAL 54,04 EUR",
        warnings: [],
        principles: { bankSource: "read_only", financialWrites: false, requiresHumanReview: true, preservesGeometry: true },
        pages: [{
          pageNumber: 1,
          plainText: "FACTURA DEMO\nTOTAL 54,04 EUR",
          layoutText: "FACTURA DEMO\n                                              TOTAL     54,04 EUR",
          lines: [
            { id: "p1-l1", text: "FACTURA DEMO", confidence: 1, alignment: "center", words: [] },
            { id: "p1-l2", text: "TOTAL 54,04 EUR", confidence: 1, alignment: "right", words: [] },
          ],
        }],
      }),
    });
  });

  await page.route("**/api/documents*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "GET" && url.searchParams.get("mode") === "candidates") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ contractVersion: 1, documentId, ready: true, reason: null, days: 7, amountToleranceCents: 200, principles: { bankSource: "read_only", requiresConfirmation: true, suggestionsPersisted: false }, candidates: [{ transactionId, date: "2026-09-02", concept: "COMUNIDAD BLOQUE", accountId: "95000000-0000-4000-8000-000000000095", accountName: "Cuenta corriente", amountCents: -5404, categoryId: null, merchantId: null, merchantName: null, confidence: 1, dayDifference: 0, amountDifferenceCents: 0, effectiveKind: "expense" }] }) });
      return;
    }
    if (method === "GET" && url.searchParams.get("mode") === "open") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ provider: "supabase", url: `${SUPABASE_ORIGIN}/storage/v1/object/sign/financial-app-documents/open`, expiresInSeconds: 300 }) }); return;
    }
    if (method === "GET" && url.searchParams.has("id")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); return;
    }
    if (method === "GET") {
      const filteredEmpty = url.searchParams.get("q") === "sin-coincidencias" || url.searchParams.get("status") === "confirmed";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 1,
          items: filteredEmpty ? [] : [{ ...detail.document, associationCount: detail.associations.length }],
          total: filteredEmpty ? 0 : 1,
          limit: 50,
          offset: 0,
          principles,
        }),
      }); return;
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
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bucket: "financial-app-documents", path: "uploads/97000000-0000-4000-8000-000000000097.pdf", token: "token", signedUrl: signedUploadUrl, maxFileBytes: 15728640 }) }); return;
    }
    if (method === "POST" && body.action === "upload_finalize") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); return;
    }
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "unsupported" }) });
  });
  await page.route(signedUploadUrl, async (route) => route.fulfill({ status: 200, body: "ok" }));
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

test("Documentos renders responsive F11 review semantics without automatic OCR", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  const ocrReads: string[] = [];
  await mockDocumentApi(page, writes, ocrReads);
  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "Documentos", level: 1 })).toBeVisible();
  await expect(page.getByText("factura-demo.pdf").first()).toBeVisible();
  await expect(page.getByText(/OCR revisable/).first()).toBeVisible();
  await expect(page.locator("#document-camera")).toHaveAttribute("accept", "image/*");
  await expect(page.locator("#document-camera")).toHaveAttribute("capture", "environment");
  await expect(page.locator("#document-file")).toHaveAttribute("accept", ".pdf,.jpg,.jpeg,.png,.webp");
  expect(ocrReads).toHaveLength(0);
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await expect(page.getByRole("heading", { name: "factura-demo.pdf" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revisar con OCR" })).toBeVisible();
  const download = page.getByRole("link", { name: "Descargar original" });
  await expect(download).toHaveAttribute("href", `/api/documents/download?id=${documentId}`);
  expect(await download.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(ocrReads).toHaveLength(0);
  const pendingReview = page.getByText("Pendiente de revisar", { exact: true }).first();
  await expect(pendingReview).toBeVisible();
  expect(await pendingReview.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
  await expect(page.getByRole("list", { name: "Proceso de revisión OCR" })).toContainText("Ejecuta OCR cuando quieras.");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  const undersized = await page.locator("main button, main input, main select").evaluateAll((elements) => elements.filter((el) => { const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.height < 44; }).length);
  expect(undersized).toBe(0);
});

test("QA Work · Documentos no descarta metadatos editados sin avisar", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();

  const issuer = page.getByLabel("Emisor");
  await issuer.fill("Proveedor editado");
  await expect(page.getByTestId("document-metadata-dirty")).toContainText("Cambios de metadatos sin guardar");

  await page.getByRole("complementary", { name: "Listado de documentos" }).getByLabel("Buscar", { exact: true }).fill("sin-coincidencias");
  await expect(page.getByTestId("documents-filtered-empty")).toBeVisible();
  await expect(page.getByRole("heading", { name: "factura-demo.pdf" })).toBeVisible();
  await expect(issuer).toHaveValue("Proveedor editado");

  await page.getByRole("link", { name: "← Inicio" }).click();
  const unsaved = page.getByRole("alertdialog", { name: "Cambios sin guardar" });
  await expect(unsaved).toContainText("cambios de metadatos sin guardar");
  await expect(unsaved.getByRole("button", { name: "Seguir editando" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(unsaved.getByRole("button", { name: "Descartar cambios" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(unsaved.getByRole("button", { name: "Seguir editando" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(unsaved).toHaveCount(0);
  await expect(page.getByRole("link", { name: "← Inicio" })).toBeFocused();
  await expect(issuer).toHaveValue("Proveedor editado");
  await page.getByRole("link", { name: "← Inicio" }).click();
  await unsaved.getByRole("button", { name: "Seguir editando" }).click();
  await expect(page).toHaveURL(/\/documents/);
  await expect(issuer).toHaveValue("Proveedor editado");

  await page.getByRole("button", { name: "Guardar metadatos" }).click();
  await expect(page.getByTestId("document-metadata-dirty")).toHaveCount(0);
  expect(writes.some((write) => write.action === "metadata" && write.issuerName === "Proveedor editado")).toBe(true);
});

test("QA Work · Documentos confirma antes de cambiar de documento con metadatos pendientes", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);

  const secondDocumentId = "93000000-0000-4000-8000-000000000095";
  const secondItem = {
    ...item,
    id: secondDocumentId,
    originalFileName: "recibo-segundo.pdf",
    issuerName: "Segundo proveedor",
    totalCents: 3210,
  };

  await page.route("**/api/documents*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }
    if (url.searchParams.get("mode")) {
      await route.fallback();
      return;
    }
    if (url.searchParams.get("id") === secondDocumentId) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 1,
          document: secondItem,
          associations: [],
          principles,
        }),
      });
      return;
    }
    if (!url.searchParams.has("id")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 1,
          items: [
            { ...item, associationCount: 0 },
            { ...secondItem, associationCount: 0 },
          ],
          total: 2,
          limit: 50,
          offset: 0,
          principles,
        }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  const issuer = page.getByLabel("Emisor");
  await issuer.fill("Proveedor pendiente");
  await expect(page.getByTestId("document-metadata-dirty")).toBeVisible();

  await page.getByRole("button", { name: /recibo-segundo.pdf/i }).click();
  const unsaved = page.getByRole("alertdialog", { name: "Cambios sin guardar" });
  await expect(unsaved).toBeVisible();
  await unsaved.getByRole("button", { name: "Seguir editando" }).click();
  await expect(page.getByRole("heading", { name: "factura-demo.pdf" })).toBeVisible();
  await expect(issuer).toHaveValue("Proveedor pendiente");

  await page.getByRole("button", { name: /recibo-segundo.pdf/i }).click();
  await unsaved.getByRole("button", { name: "Descartar cambios" }).click();
  await expect(page.getByRole("heading", { name: "recibo-segundo.pdf" })).toBeVisible();
  await expect(page.getByLabel("Emisor")).toHaveValue("Segundo proveedor");
  expect(writes.some((write) => write.action === "metadata")).toBe(false);

  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByLabel("Emisor").fill("Proveedor guardado antes de cambiar");
  await page.getByRole("button", { name: /recibo-segundo.pdf/i }).click();
  await unsaved.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByRole("heading", { name: "recibo-segundo.pdf" })).toBeVisible();
  expect(writes.some((write) => write.action === "metadata" && write.issuerName === "Proveedor guardado antes de cambiar")).toBe(true);
});

test("QA-09 · Documentos distingue filtros sin coincidencias de un repositorio vacío", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await expect(page.getByText("factura-demo.pdf").first()).toBeVisible();

  await page.getByRole("complementary", { name: "Listado de documentos" }).getByLabel("Buscar", { exact: true }).fill("sin-coincidencias");
  await expect(page.getByTestId("documents-filtered-empty")).toContainText("No hay coincidencias");
  await expect(page.getByTestId("documents-filtered-empty")).not.toContainText("Añade el primero");

  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.getByText("factura-demo.pdf").first()).toBeVisible();
});

test("Documentos runs OCR only after explicit action and never writes financial data", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  const ocrReads: string[] = [];
  await mockDocumentApi(page, writes, ocrReads);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  expect(ocrReads).toHaveLength(0);
  await page.getByRole("button", { name: "Analizar documento" }).click();
  await expect.poll(() => ocrReads.length).toBe(1);
  await expect(page.getByText("Texto nativo PDF")).toBeVisible();
  await expect(page.getByText("FACTURA DEMO")).toBeVisible();
  await expect(page.getByText(/Sin escrituras financieras/)).toBeVisible();
  expect(writes).toHaveLength(0);
});

test("REC-OCR-033 · rechaza una lectura OCR recibida para otro documento sin exponer su contenido", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  const otherDocumentId = "93000000-0000-4000-8000-000000000099";
  await page.route(/\/api\/documents\/ocr(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        documentId: otherDocumentId,
        status: "ready",
        source: "pdf_text",
        extractor: "pdfjs-6.2.108-native-text",
        extractedAt: "2026-09-07T07:00:00.000Z",
        confidence: 1,
        plainText: "FACTURA AJENA CON DATOS PRIVADOS",
        warnings: [],
        pages: [],
        principles: {
          bankSource: "read_only",
          financialWrites: false,
          requiresHumanReview: true,
          preservesGeometry: true,
        },
      }),
    });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar documento" }).click();
  await expect(page.getByTestId("ocr-review-panel").getByRole("alert")).toContainText("la respuesta OCR no tiene el formato esperado");
  await expect(page.getByTestId("ocr-confirmation-form")).toHaveCount(0);
  await expect(page.getByText("FACTURA AJENA CON DATOS PRIVADOS")).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("REC-OCR-034 · dos clics antes del render disparan una sola lectura", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let ocrCalls = 0;
  let releaseOcr: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { releaseOcr = resolve; });
  await page.route(/\/api\/documents\/ocr(?:\?.*)?$/, async (route) => {
    ocrCalls += 1;
    await gate;
    await route.fallback();
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const trigger = buttons.find((button) => button.textContent?.trim() === "Analizar documento");
    trigger?.click();
    trigger?.click();
  });
  await expect.poll(() => ocrCalls).toBe(1);
  await expect(page.getByRole("button", { name: "Analizando…" })).toBeDisabled();
  releaseOcr?.();
  await expect(page.getByText("Texto nativo PDF")).toBeVisible();
  expect(ocrCalls).toBe(1);
  expect(writes).toHaveLength(0);
});

test("REC-OCR-035 · doble confirmación rápida no duplica revisiones persistidas", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let confirms = 0;
  let releaseSave: (() => void) | null = null;
  const pendingSave = new Promise<void>((resolve) => { releaseSave = resolve; });
  await page.route("**/api/documents/ocr-review*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    confirms += 1;
    await pendingSave;
    const request = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 2, revision: 1,
        documentId: request.documentId,
        ocrRunId: request.ocrRunId,
        rawEvidenceImmutable: true, bankSource: "read_only",
        financialWrites: false, requiresHumanReview: true,
        reviewedValues: {
          type: request.type,
          documentDate: request.documentDate,
          taxBaseCents: request.taxBaseCents,
          taxesCents: request.taxesCents,
          totalCents: request.totalCents,
        },
      }),
    });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar documento" }).click();
  const confirm = page.getByRole("button", { name: "Confirmar revisión" });
  await expect(confirm).toBeEnabled();
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const trigger = buttons.find((button) => button.textContent?.trim() === "Confirmar revisión");
    trigger?.click();
    trigger?.click();
  });
  await expect.poll(() => confirms).toBe(1);
  await expect(page.getByRole("button", { name: "Confirmando…" })).toBeDisabled();
  releaseSave?.();
  await expect(page.getByText("Guardada como revisión 1.")).toBeVisible();
  expect(confirms).toBe(1);
  expect(writes).toHaveLength(0);
});

test("REC-OCR-039 · revisión con identificador o importes cambiados no se considera guardada", async ({ page }) => {
  const corruptions = [
    "wrong-document", "wrong-ocr-run", "wrong-total", "source-write",
  ] as const;
  let writes = 0;
  for (const corruption of corruptions) {
    await mockDocumentApi(page, []);
    await page.route("**/api/documents/ocr-review*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      writes += 1;
      const requested = route.request().postDataJSON() as Record<string, unknown>;
      const response = {
        contractVersion: 2, revision: 1,
        documentId: corruption === "wrong-document" ? "93000000-0000-4000-8000-000000000099" : requested.documentId,
        ocrRunId: corruption === "wrong-ocr-run" ? "98000000-0000-4000-8000-000000000099" : requested.ocrRunId,
        bankSource: "read_only",
        financialWrites: corruption === "source-write",
        rawEvidenceImmutable: true, requiresHumanReview: true,
        reviewedValues: {
          type: requested.type, documentDate: requested.documentDate,
          taxBaseCents: requested.taxBaseCents, taxesCents: requested.taxesCents,
          totalCents: corruption === "wrong-total" ? 0 : requested.totalCents,
        },
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });
    await page.goto("/documents");
    await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
    await page.getByRole("button", { name: "Analizar documento" }).click();
    const confirm = page.getByRole("button", { name: "Confirmar revisión" });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.locator('[data-ocr-confirmation="unverified"]')).toBeVisible();
    await expect(page.getByText(/Guardada como revisión/)).toHaveCount(0);
    await page.unroute("**/api/documents/ocr-review*");
  }
  expect(writes).toBe(corruptions.length);
});

test("REC-OCR-036 · respuesta de revisión sin número no se anuncia como guardada", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let confirmations = 0;
  await page.route("**/api/documents/ocr-review*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    confirmations += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar documento" }).click();
  await expect(page.getByRole("button", { name: "Confirmar revisión" })).toBeEnabled();
  await page.getByRole("button", { name: "Confirmar revisión" }).click();
  await expect(page.getByTestId("ocr-review-panel").getByRole("alert"))
    .toContainText("No se pudo comprobar si la revisión OCR llegó a guardarse");
  await expect(page.getByText(/Guardada como revisión/)).toHaveCount(0);
  expect(confirmations).toBe(1);
  expect(writes).toHaveLength(0);
});

test("REC-OCR-037 · un PATCH incierto se recupera únicamente leyendo la revisión guardada", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  const runId = "98000000-0000-4000-8000-000000000098";
  let patchCount = 0;
  let recovered = false;
  let lastSubmission: Record<string, unknown> | null = null;
  await page.route("**/api/documents/ocr-review*", async (route) => {
    if (route.request().method() === "PATCH") {
      patchCount += 1;
      lastSubmission = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "persistence_failed" }) });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        runs: [{ id: runId, extractor: "pdfjs-6.2.108-native-text", extractedAt: "2026-09-07T07:00:00.000Z" }],
        reviews: recovered && lastSubmission ? [{
          revision: 1, ocrRunId: runId,
          reviewedValues: {
            type: lastSubmission.type,
            documentDate: lastSubmission.documentDate,
            taxBaseCents: lastSubmission.taxBaseCents,
            taxesCents: lastSubmission.taxesCents,
            totalCents: lastSubmission.totalCents,
          },
        }] : [],
      }),
    });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar documento" }).click();
  const confirm = page.getByRole("button", { name: "Confirmar revisión" });
  await expect(confirm).toBeEnabled();
  await confirm.click();

  const verify = page.getByRole("button", { name: "Comprobar revisión sin volver a guardar" });
  await expect(verify).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar revisión" })).toBeDisabled();
  expect(patchCount).toBe(1);
  await verify.click();
  await expect(page.getByTestId("ocr-review-panel").getByRole("alert"))
    .toContainText("El historial no muestra una revisión nueva que coincida");
  await expect(page.locator('[data-ocr-confirmation="unverified"]')).toBeVisible();
  expect(patchCount).toBe(1);

  recovered = true;
  await verify.click();
  await expect(page.locator('[data-ocr-confirmation="unverified"]')).toHaveCount(0);
  await expect(page.getByText("Guardada como revisión 1.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmado ✓" })).toBeDisabled();
  expect(patchCount).toBe(1);
  expect(writes).toHaveLength(0);
});

test("REC-OCR-038 · la propuesta no puede editarse mientras una confirmación es incierta", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let attempts = 0;
  await page.route("**/api/documents/ocr-review*", async (route) => {
    if (route.request().method() === "PATCH") {
      attempts += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "persistence_failed" }) });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar documento" }).click();
  const form = page.getByTestId("ocr-confirmation-form");
  await expect(form.getByLabel("Emisor")).toBeEnabled();
  await form.getByRole("button", { name: "Confirmar revisión" }).click();
  await expect(page.locator('[data-ocr-confirmation="unverified"]')).toBeVisible();
  await expect(form.getByLabel("Emisor")).toBeDisabled();
  await expect(form.getByLabel("Total (€)", { exact: true })).toBeDisabled();
  await expect(form.getByRole("button", { name: "Añadir línea" })).toBeDisabled();
  await expect(form.getByRole("button", { name: "Confirmar revisión" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Analizar documento" })).toBeDisabled();
  expect(attempts).toBe(1);
  await page.getByRole("button", { name: "He comprobado el historial; permitir nuevo intento" }).click();
  await expect(form.getByLabel("Emisor")).toBeEnabled();
  await expect(form.getByRole("button", { name: "Confirmar revisión" })).toBeEnabled();
  expect(attempts).toBe(1);
  expect(writes).toHaveLength(0);
});

test("REC-OCR-040 · Abrir original conserva el gesto de usuario hasta obtener URL firmada", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.context().route("**/storage/v1/object/sign/financial-app-documents/open", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "Documento sintético" }));
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByTestId("ocr-review-panel").getByRole("button", { name: "Abrir", exact: true }).click(),
  ]);
  await expect.poll(() => popup.url()).toContain("/storage/v1/object/sign/financial-app-documents/open");
  await expect(page.getByTestId("ocr-review-panel").getByRole("alert")).toHaveCount(0);
  await popup.close();
  expect(writes).toHaveLength(0);
});

test("REC-OCR-041 · un bloqueador de ventanas informa cómo abrir el original", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.evaluate(() => { window.open = () => null; });
  await page.getByTestId("ocr-review-panel").getByRole("button", { name: "Abrir", exact: true }).click();
  await expect(page.getByTestId("ocr-review-panel").getByRole("alert"))
    .toContainText("ha bloqueado la ventana del original");
  expect(writes).toHaveLength(0);
});

test("REC-OCR-042 · no navega hacia esquemas de URL peligrosos devueltos por el backend", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "open") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "javascript:alert('inseguro')" }) });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByTestId("ocr-review-panel").getByRole("button", { name: "Abrir", exact: true }).click(),
  ]);
  await expect(page.getByTestId("ocr-review-panel").getByRole("alert"))
    .toContainText("No se ha podido abrir el documento original de forma segura");
  await expect.poll(() => popup.isClosed()).toBe(true);
  expect(writes).toHaveLength(0);
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

test("Documentos uploads through private signed storage and leaves OCR for explicit review", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({ name: "nueva-factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect.poll(() => writes.some((write) => write.action === "upload_sign")).toBe(true);
  await expect.poll(() => writes.some((write) => write.action === "upload_finalize")).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "sólo se ejecutará si lo solicitas" })).toBeVisible();
});

test("protected preview preserves phase 9 document persistence contract across later phases", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");
  const build = await request.get("/api/build");
  expect(build.status()).toBe(200);
  const buildJson = await build.json();
  expect(buildJson.phase).toBeGreaterThanOrEqual(9);
  if (buildJson.phase === 9) {
    expect(buildJson.phaseName).toBe("Documentos sin OCR");
    expect(buildJson.phaseBlock).toBe(1);
    expect(buildJson.phaseBlockName).toBe("Gestión documental");
  }
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

test("AUD-E2E-DOC-001 · un error de guardado mantiene el borrador y la elección abierta", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents*", async (route) => {
    if (route.request().method() === "PATCH" && route.request().postDataJSON()?.action === "metadata") {
      await route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "persistence_failed" }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByLabel("Emisor").fill("BORRADOR AUDITORÍA NO GUARDAR");
  await page.getByRole("link", { name: "← Inicio" }).click();

  const unsaved = page.getByRole("alertdialog", { name: "Cambios sin guardar" });
  await unsaved.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(unsaved).toBeVisible();
  await expect(page.getByTestId("document-metadata-dirty")).toBeVisible();
  await unsaved.getByRole("button", { name: "Seguir editando" }).click();
  await expect(page.getByLabel("Emisor")).toHaveValue("BORRADOR AUDITORÍA NO GUARDAR");
  await expect(page).toHaveURL(/\/documents/);
  expect(writes.filter((write) => write.action === "metadata")).toHaveLength(0);
});


test("AUD-E2E-DOC-001 · cambiar de documento protege y descarta únicamente el borrador", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  const otherId = "93000000-0000-4000-8000-000000000092";
  const other = { ...item, id: otherId, originalFileName: "otro-documento.pdf", issuerName: "Otro emisor" };
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    if (url.searchParams.has("mode")) return route.fallback();
    if (url.searchParams.has("id")) {
      const document = url.searchParams.get("id") === otherId ? other : item;
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ contractVersion: 1, document, associations: [], principles }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, items: [item, other], total: 2, limit: 50, offset: 0, principles }) });
  });

  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await expect(page.getByLabel("Emisor")).toHaveValue("Proveedor Demo");
  await page.getByLabel("Emisor").fill("BORRADOR AUDITORÍA NO GUARDAR");
  await page.getByRole("button", { name: /otro-documento.pdf/i }).click();
  const alert = page.getByRole("alertdialog", { name: "Cambios sin guardar" });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Seguir editando" }).click();
  await expect(page.getByLabel("Emisor")).toHaveValue("BORRADOR AUDITORÍA NO GUARDAR");
  await page.getByRole("button", { name: /otro-documento.pdf/i }).click();
  await alert.getByRole("button", { name: "Descartar cambios" }).click();
  await expect(page.getByLabel("Emisor")).toHaveValue("Otro emisor");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await expect(page.getByLabel("Emisor")).toHaveValue("Proveedor Demo");
  expect(writes).toEqual([]);
});
