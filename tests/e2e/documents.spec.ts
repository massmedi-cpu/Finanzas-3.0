import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { POST as postDocumentAction } from "../../app/api/documents/route";
import { SUPABASE_ORIGIN } from "../../src/infrastructure/auth/supabase-auth";
import { parseDocumentQueryInteger } from "../../src/application/document-query-integer";
import { resolvePdfOcrSource } from "../../src/infrastructure/ocr/pdf-source-provenance";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const unknownDocumentId = "91000000-0000-4000-8000-000000000091";
const unknownTransactionId = "92000000-0000-4000-8000-000000000092";
const documentId = "93000000-0000-4000-8000-000000000093";
const transactionId = "94000000-0000-4000-8000-000000000094";
const uploadedDocumentId = "98000000-0000-4000-8000-000000000097";
const signedUploadPath = "uploads/97000000-0000-4000-8000-000000000097/" + uploadedDocumentId + ".pdf";
const signedUploadUrl = `${SUPABASE_ORIGIN}/storage/v1/object/upload/sign/financial-app-documents/${signedUploadPath}?token=token`;

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
  ocrWarnings: string[] = [],
  ocrStatus: "ready" | "needs_review" | "empty" = "ready",
) {
  let detail = { contractVersion: 1, document: { ...item }, associations: [] as any[], principles };
  let signedSizeBytes = 0;

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
        status: ocrStatus,
        source: "pdf_text",
        extractor: "pdfjs-6.2.108-native-text",
        extractedAt: "2026-09-07T07:00:00.000Z",
        confidence: 1,
        plainText: ocrStatus === "empty" ? "" : "FACTURA DEMO\nTOTAL 54,04 EUR",
        warnings: ocrWarnings,
        principles: { bankSource: "read_only", financialWrites: false, requiresHumanReview: true, preservesGeometry: true },
        pages: [{
          pageNumber: 1,
          plainText: ocrStatus === "empty" ? "" : "FACTURA DEMO\nTOTAL 54,04 EUR",
          layoutText: ocrStatus === "empty" ? "" : "FACTURA DEMO\n                                              TOTAL     54,04 EUR",
          lines: ocrStatus === "empty" ? [] : [
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
      signedSizeBytes = body.sizeBytes;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bucket: "financial-app-documents", path: signedUploadPath, token: "token", signedUrl: signedUploadUrl, originalFileName: body.originalFileName, mimeType: body.mimeType, sizeBytes: body.sizeBytes, maxFileBytes: 15728640, hashVerificationVersion: 1, hashAlgorithm: "sha256" }) }); return;
    }
    if (method === "POST" && body.action === "upload_finalize") {
      detail = {
        ...detail,
        ...(body.expectedSha256 ? { uploadIntegrity: { sha256: body.expectedSha256, sizeBytes: body.expectedSizeBytes ?? signedSizeBytes, verified: true } } : {}),
        document: {
          ...detail.document, id: uploadedDocumentId, originalFileName: body.originalFileName,
          type: body.type, mimeType: body.mimeType, storageKey: body.path,
          sizeBytes: body.expectedSizeBytes ?? signedSizeBytes, status: "imported",
        },
        associations: [],
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); return;
    }
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "unsupported" }) });
  });
  await page.route(signedUploadUrl, async (route) => route.fulfill({ status: 200, body: "ok" }));
  await page.route("**/api/transactions*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [{ id: transactionId, bankDate: "2026-09-02", amountCents: -5404, account: { id: "95000000-0000-4000-8000-000000000095", name: "Cuenta corriente" }, concept: { original: "COMUNIDAD BLOQUE", processed: "COMUNIDAD BLOQUE", effective: "COMUNIDAD BLOQUE" }, merchant: { effectiveName: null }, category: { effectiveName: null }, kind: { effective: "expense" } }], totalCount: 1, hasMore: false, nextCursor: null }) }));
}

test("REC-OCR-057 · un OCR vacío informa que no se ha reconocido texto sin marcar lectura completa", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes, [], ["ocr_empty"], "empty");
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  const panel = page.getByTestId("ocr-review-panel");
  await panel.getByRole("button", { name: "Analizar documento" }).click();
  await expect(panel.getByText("Sin texto legible. Comprueba el original.")).toBeVisible();
  const stages = panel.getByRole("list", { name: "Proceso de revisión OCR" }).locator("li");
  await expect(stages.nth(1)).not.toHaveClass(/done/);
  await expect(stages.nth(2)).not.toHaveClass(/done/);
  await expect(panel.getByText("OCR completado.")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Analizar documento" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Volver a analizar" })).toBeEnabled();
  const confirm = panel.getByRole("button", { name: "Confirmar revisión" });
  if (await confirm.count()) await expect(confirm).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test("REC-OCR-056 · un PDF escaneado vacío no se etiqueta como texto nativo", () => {
  expect(resolvePdfOcrSource({ nativePageCount: 0, visualOcrPageCount: 0, visualOcrAttempted: 1 }))
    .toBe("pdf_ocr");
  expect(resolvePdfOcrSource({ nativePageCount: 0, visualOcrPageCount: 1, visualOcrAttempted: 1 }))
    .toBe("pdf_ocr");
  expect(resolvePdfOcrSource({ nativePageCount: 1, visualOcrPageCount: 1, visualOcrAttempted: 1 }))
    .toBe("hybrid");
  expect(resolvePdfOcrSource({ nativePageCount: 1, visualOcrPageCount: 0, visualOcrAttempted: 1 }))
    .toBe("pdf_text");
  expect(resolvePdfOcrSource({ nativePageCount: 1, visualOcrPageCount: 0, visualOcrAttempted: 0 }))
    .toBe("pdf_text");
});

test("REC-OCR-055 · el OCR rechaza dos identificadores antes de tocar persistencia", async ({ request }) => {
  for (const method of ["GET", "POST"] as const) {
    const url = `/api/documents/ocr?id=${documentId}&id=${unknownDocumentId}`;
    const response = method === "GET" ? await request.get(url) : await request.post(url);
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "ocr_failed", code: "invalid_ocr_document_id",
    });
  }
});

test("REC-DOC-077 · enteros canónicos permiten filtrar, paginar y buscar candidatos", () => {
  const parse = parseDocumentQueryInteger;
  // These are ordinary requests from the Documentos UI and must not be
  // rejected before the private persistence gateway can even be called.
  expect(parse("50", "invalid_document_limit", 50, 1, 100)).toBe(50);
  expect(parse("100", "invalid_document_limit", 50, 1, 100)).toBe(100);
  expect(parse("1000", "invalid_document_offset", 0, 0, 100000)).toBe(1000);
  expect(parse("7", "invalid_document_candidate_days", 7, 0, 31)).toBe(7);
  expect(parse("8", "invalid_document_candidate_limit", 8, 1, 20)).toBe(8);
  expect(parse("20", "invalid_document_candidate_limit", 8, 1, 20)).toBe(20);
  expect(parse("0", "invalid_document_offset", 0, 0, 100000)).toBe(0);
  expect(parse(null, "invalid_document_limit", 50, 1, 100)).toBe(50);
  const invalid = ["", " ", "08", "00", "01", "-1", "+1", "1.5", "1e2", "0x10", "9007199254740992"];
  for (const raw of invalid) {
    expect(() => parse(raw, "invalid_document_limit", 50, 1, 100), raw)
      .toThrow("invalid_document_limit");
  }
  expect(() => parse("0", "invalid_document_limit", 50, 1, 100))
    .toThrow("invalid_document_limit");
  expect(() => parse("32", "invalid_document_candidate_days", 7, 0, 31))
    .toThrow("invalid_document_candidate_days");
});

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

test("REC-OCR-058 · historial OCR privado rechaza IDs duplicados y parámetros ajenos", async ({ request }) => {
  const malformed = [
    `/api/documents/ocr-review?id=${documentId}&id=${unknownDocumentId}`,
    `/api/documents/ocr-review?id=${documentId}&scope=all`,
    "/api/documents/ocr-review",
  ];
  for (const url of malformed) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request",
      code: "invalid_document_review_query",
    });
  }
  const invalidId = await request.get("/api/documents/ocr-review?id=not-a-uuid");
  expect(invalidId.status()).toBe(400);
  await expect(invalidId.json()).resolves.toEqual({
    error: "invalid_request", code: "invalid_document_id",
  });
});

test("REC-DOC-055 · parámetros duplicados o vacíos se rechazan antes de consultar documentos privados", async ({ request }) => {
  const cases: Array<[string, string]> = [
    ["/api/documents?scope=ordinary&scope=tests", "invalid_document_query_duplicate"],
    ["/api/documents?limit=50&limit=100", "invalid_document_query_duplicate"],
    ["/api/documents?unassociated=false&unassociated=true", "invalid_document_query_duplicate"],
    ["/api/documents?id=" + documentId + "&id=" + unknownDocumentId, "invalid_document_query_duplicate"],
    ["/api/documents?id=", "invalid_document_id"],
    ["/api/documents?mode=", "invalid_document_mode"],
    ["/api/documents?id=" + documentId + "&mode=", "invalid_document_mode"],
    ["/api/documents?limit=", "invalid_document_limit"],
    ["/api/documents?offset=%20", "invalid_document_offset"],
    ["/api/documents?id=" + documentId + "&mode=candidates&days=", "invalid_document_candidate_days"],
    ["/api/documents?id=" + documentId + "&mode=candidates&limit=08", "invalid_document_candidate_limit"],
  ];
  for (const [url, code] of cases) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request", code });
  }
});

test("document metadata validation accepts Spanish financial boundaries and rejects unsafe values", async ({ request }) => {
  const invalidDate = await request.patch("/api/documents", { data: { action: "metadata", id: unknownDocumentId, type: "invoice", documentDate: "2026-02-30", issuerName: "Proveedor", totalCents: 1234, notes: "" } });
  expect(invalidDate.status()).toBe(400);
  await expect(invalidDate.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_date" });
  const invalidTotal = await request.patch("/api/documents", { data: { action: "metadata", id: unknownDocumentId, type: "invoice", documentDate: "2026-09-06", issuerName: "Proveedor", totalCents: Number.MAX_SAFE_INTEGER + 1, notes: "" } });
  expect(invalidTotal.status()).toBe(400);
  await expect(invalidTotal.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_document_total" });
});

test("REC-DOC-078 · los metadatos no convierten objetos ni números en notas persistidas", async ({ request }) => {
  for (const notes of [{ internal: "payload" }, ["nota"], 12345, false]) {
    const response = await request.patch("/api/documents", { data: {
      action: "metadata",
      id: documentId,
      type: "invoice",
      documentDate: "2026-09-02",
      issuerName: "Proveedor",
      totalCents: 5404,
      notes,
    } });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request", code: "invalid_document_notes",
    });
  }
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

test("REC-OCR-052 · un nuevo intento OCR fallido no muestra el resultado anterior como lectura actual", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let attempts = 0;
  await page.route(/\/api\/documents\/ocr(?:\?.*)?$/, async (route) => {
    attempts += 1;
    if (attempts === 2) {
      await route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "ocr_worker_timeout" }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  const panel = page.getByTestId("ocr-review-panel");
  await panel.getByRole("button", { name: "Analizar documento" }).click();
  await expect(panel.getByText("FACTURA DEMO")).toBeVisible();
  await expect(panel.getByText("OCR completado.")).toBeVisible();

  await panel.getByRole("button", { name: "Volver a analizar" }).click();
  await expect(panel.getByRole("alert")).toContainText("no ha podido iniciarse a tiempo");
  await expect(panel.getByText("FACTURA DEMO")).toHaveCount(0);
  await expect(panel.getByText("OCR completado.")).toHaveCount(0);
  await expect(panel.getByTestId("ocr-confirmation-form")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Analizar documento" })).toBeEnabled();
  expect(attempts).toBe(2);
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
  const ocrButton = page.getByTestId("ocr-review-panel").getByRole("button", { name: "Analizar documento" });
  await expect(ocrButton).toBeEnabled();
  // Wait for hydration and trigger twice in the same browser task, before
  // React can render its busy state. This must produce exactly one request.
  await ocrButton.evaluate((trigger: HTMLButtonElement) => {
    trigger.click();
    trigger.click();
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

test("REC-OCR-053 · guardar revisión no anuncia lista sincronizada cuando la relectura falla", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let confirmedOnServer = false;
  let listingFailures = 0;
  await page.route("**/api/documents/ocr-review*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const submitted = route.request().postDataJSON() as Record<string, unknown>;
    confirmedOnServer = true;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 2, revision: 1,
        documentId: submitted.documentId, ocrRunId: submitted.ocrRunId,
        rawEvidenceImmutable: true, bankSource: "read_only",
        financialWrites: false, requiresHumanReview: true,
        reviewedValues: {
          type: submitted.type, documentDate: submitted.documentDate,
          taxBaseCents: submitted.taxBaseCents, taxesCents: submitted.taxesCents,
          totalCents: submitted.totalCents,
        },
      }),
    });
  });
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (confirmedOnServer && route.request().method() === "GET" && !url.searchParams.has("id")) {
      listingFailures += 1;
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
  const panel = page.getByTestId("ocr-review-panel");
  await panel.getByRole("button", { name: "Analizar documento" }).click();
  const confirm = panel.getByRole("button", { name: "Confirmar revisión" });
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(panel.getByText("Guardada como revisión 1.")).toBeVisible();
  await expect(panel.getByRole("alert")).toContainText("La revisión se ha guardado, pero no se pudo actualizar el listado");
  await expect(page.getByText("Revisión OCR confirmada y documento sincronizado.")).toHaveCount(0);
  expect(confirmedOnServer).toBe(true);
  expect(listingFailures).toBeGreaterThan(0);
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
  await expect(page.getByTestId("ocr-review-panel").getByRole("button", { name: /^(Analizar documento|Volver a analizar)$/ })).toBeDisabled();
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
  await expect(page.getByRole("heading", { name: "nueva-factura.pdf" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "sólo se ejecutará" })).toBeVisible();
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
  // A 503 after a PATCH cannot establish whether the server applied it.
  // Never reassure users that no document was changed or invite a blind retry.
  const uncertainty = page.getByTestId("documents-alert");
  await expect(uncertainty).toContainText("comprueba el detalle antes de repetir");
  await expect(uncertainty).not.toContainText("No se ha modificado ningún documento");
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


test("REC-DOC-045 · un error de persistencia deja reintentar lista sin inventar documentos ni escribir", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let failFirst = true;
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && !url.searchParams.has("id") && failFirst) {
      await route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "persistence_failed" }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await expect(page.getByTestId("documents-alert")).toContainText(/problema de persistencia/i);
  await expect(page.getByText("No se ha podido cargar la lista")).toBeVisible();
  await expect(page.getByRole("button", { name: /factura-demo\.pdf/i })).toHaveCount(0);
  failFirst = false;
  await page.getByRole("button", { name: "Reintentar lista" }).click();
  await expect(page.getByRole("button", { name: /factura-demo\.pdf/i })).toBeVisible();
  await expect(page.getByTestId("documents-alert")).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("REC-DOC-046 · la carga sin sesión distingue 401 sin JSON de un archivo vacío", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    if (route.request().method() === "GET" && !new URL(route.request().url()).searchParams.has("id")) {
      await route.fulfill({ status: 401, contentType: "text/plain", body: "" });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await expect(page.getByTestId("documents-alert")).toContainText(/sesión necesita renovarse/i);
  await expect(page.getByText("No se ha podido cargar la lista")).toBeVisible();
  await expect(page.getByRole("button", { name: /factura-demo\.pdf/i })).toHaveCount(0);
  expect(writes).toEqual([]);
});


test("REC-DOC-047 · HTTP 200 incompleto no puede simular un archivo documental vacío", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let wrongBody = true;
  await page.route("**/api/documents?*", async (route) => {
    if (route.request().method() === "GET" && !new URL(route.request().url()).searchParams.has("id") && wrongBody) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ contractVersion: 3, items: [], total: 0, limit: 50, offset: 0 }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await expect(page.getByTestId("documents-alert")).toContainText(/lista documental incompleta o incompatible/i);
  await expect(page.getByText("No se ha podido cargar la lista")).toBeVisible();
  await expect(page.getByText("No hay documentos", { exact: true })).toHaveCount(0);
  wrongBody = false;
  await page.getByRole("button", { name: "Reintentar lista" }).click();
  await expect(page.getByRole("button", { name: /factura-demo\.pdf/i })).toBeVisible();
  expect(writes).toEqual([]);
});

test("REC-DOC-048 · una lista que niega origen bancario de solo lectura no se muestra", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    if (route.request().method() === "GET" && !new URL(route.request().url()).searchParams.has("id")) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 3, items: [], total: 0, limit: 50, offset: 0,
          principles: {
            bankSource: "writable", ocrEnabled: true, getHasSideEffects: false,
            suggestionsPersisted: false, associationsRequireConfirmation: true,
          },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await expect(page.getByTestId("documents-alert")).toContainText(/lista documental incompleta o incompatible/i);
  await expect(page.getByText("No se ha podido cargar la lista")).toBeVisible();
  expect(writes).toEqual([]);
});


test("REC-DOC-049 · Drive con fallos o pendientes nunca comunica que está al día", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents/drive-sync", async (route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1, source: "google_drive", mode: "automatic_incremental_read_only",
        scanned: 5, detectedChanges: 3, unchanged: 2,
        imported: 1, failed: 1, pending: 1, skippedUnsupported: 0, skippedInvalid: 0,
        truncated: true, completedAt: "2026-10-11T07:00:00.000Z",
        principles: { bankSource: "read_only", driveSource: "read_only", duplicateSafe: true, nonBlocking: true },
      }),
    });
  });
  await page.goto("/documents");
  const banner = page.getByTestId("drive-auto-sync");
  await expect(banner).toContainText(/documento no pudo validarse/i);
  await expect(banner).toContainText(/cambio pendiente/i);
  await expect(banner).toContainText(/exploración de Drive está incompleta/i);
  await expect(banner).not.toContainText("Drive al día");
  expect(writes).toEqual([]);
});

test("REC-DOC-050 · Drive rechaza un éxito incompleto y recupera sin alterar documentos", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let malformed = true;
  await page.route("**/api/documents/drive-sync", async (route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(malformed ? { imported: 0 } : {
        contractVersion: 1, source: "google_drive", mode: "automatic_incremental_read_only",
        scanned: 2, detectedChanges: 0, unchanged: 2,
        imported: 0, failed: 0, pending: 0, skippedUnsupported: 0, skippedInvalid: 0,
        truncated: false, completedAt: "2026-10-11T07:00:00.000Z",
        principles: { bankSource: "read_only", driveSource: "read_only", duplicateSafe: true, nonBlocking: true },
      }),
    });
  });
  await page.goto("/documents");
  const banner = page.getByTestId("drive-auto-sync");
  await expect(banner).toContainText(/No se ha podido verificar Drive/i);
  await expect(banner).not.toContainText(/funcionando con normalidad/i);
  malformed = false;
  await banner.getByRole("button", { name: "Comprobar ahora" }).click();
  await expect(banner).toContainText(/Carpeta comprobada. No hay documentos nuevos/i);
  expect(writes).toEqual([]);
});


test("REC-DOC-051 · Preview informa que Drive es solo lectura y no ofrece reintentos de escritura", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let attempts = 0;
  await page.route("**/api/documents/drive-sync", async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 409, contentType: "application/json",
      body: JSON.stringify({ error: "preview_drive_sync_read_only", code: "preview_drive_sync_read_only" }),
    });
  });
  await page.goto("/documents");
  const banner = page.getByTestId("drive-auto-sync");
  await expect(banner).toContainText(/Vista previa de solo lectura/i);
  await expect(banner).toContainText(/proteger producción/i);
  await expect(banner.getByRole("button", { name: "Solo en producción" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /factura-demo\.pdf/i })).toBeVisible();
  expect(attempts).toBe(1);
  expect(writes).toEqual([]);
});


test("REC-DOC-052 · un rechazo OIDC del gateway no se presenta como sesión de usuario caducada", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    if (route.request().method() === "GET" && !new URL(route.request().url()).searchParams.has("id")) {
      await route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "persistence_failed", code: "gateway_identity_unavailable" }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  const warning = page.getByTestId("documents-alert");
  await expect(warning).toContainText(/servidor no ha podido acreditar su identidad/i);
  await expect(warning).toContainText(/no es un problema de tu contraseña/i);
  await expect(warning).not.toContainText(/sesión necesita renovarse/i);
  await expect(page.getByText("No se ha podido cargar la lista")).toBeVisible();
  expect(writes).toEqual([]);
});


test("REC-DOC-053 · detalle que niega banco de solo lectura nunca abre un editor de cambios", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.searchParams.get("id") === documentId) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 1, document: { ...item }, associations: [],
          principles: { ...principles, bankSource: "writable" },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo\.pdf/i }).click();
  await expect(page.getByTestId("documents-alert")).toContainText(/servidor no ha devuelto el documento solicitado/i);
  await expect(page.getByLabel("Emisor", { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("REC-DOC-054 · una lista con identificadores no UUID no se presenta como documento válido", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && !url.searchParams.has("id")) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 1,
          items: [{ ...item, id: "93000000----------------------------" }],
          total: 1, limit: 50, offset: 0, principles,
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await expect(page.getByTestId("documents-alert")).toContainText(/lista documental incompleta o incompatible/i);
  await expect(page.getByText("No se ha podido cargar la lista")).toBeVisible();
  expect(writes).toEqual([]);
});


test("REC-DOC-056 · página vacía dentro de un total positivo no finge archivo vacío", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && !url.searchParams.has("id")) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ contractVersion: 3, items: [], total: 1, limit: 50, offset: 0, principles }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await expect(page.getByTestId("documents-alert")).toContainText(/lista documental incompleta o incompatible/i);
  await expect(page.getByText("No se ha podido cargar la lista")).toBeVisible();
  await expect(page.getByText("No hay documentos", { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("REC-DOC-057 · respuesta de otra página no sustituye el listado solicitado", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && !url.searchParams.has("id")) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 3, items: [{ ...item }], total: 2, limit: 50, offset: 1, principles,
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await expect(page.getByTestId("documents-alert")).toContainText(/lista documental incompleta o incompatible/i);
  await expect(page.getByText("No se ha podido cargar la lista")).toBeVisible();
  await expect(page.getByRole("button", { name: /factura-demo\.pdf/i })).toHaveCount(0);
  expect(writes).toEqual([]);
});


test("REC-DOC-058 · abrir desde la ficha conserva el gesto del navegador y la URL firmada", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.context().route("**/storage/v1/object/sign/financial-app-documents/open", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "Documento sintético" }));
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: /Abrir documento/i }).click(),
  ]);
  await expect.poll(() => popup.url()).toContain("/storage/v1/object/sign/financial-app-documents/open");
  await expect(page.getByTestId("documents-alert")).toHaveCount(0);
  await popup.close();
  expect(writes).toEqual([]);
});

test("REC-DOC-059 · URL de original insegura se bloquea también desde la ficha", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "open") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "javascript:alert(1)" }) });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: /Abrir documento/i }).click(),
  ]);
  await expect(page.getByTestId("documents-alert")).toContainText(/enlace de archivo no seguro/i);
  await expect.poll(() => popup.isClosed()).toBe(true);
  expect(writes).toEqual([]);
});

test("REC-DOC-060 · bloqueo de emergentes se explica sin intentar una escritura", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole("button", { name: /Abrir documento/i }).click();
  await expect(page.getByTestId("documents-alert")).toContainText(/bloqueado la ventana del documento/i);
  expect(writes).toEqual([]);
});


test("REC-DOC-061 · una sugerencia para otro documento no autoriza asociaciones bancarias", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "candidates") {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 1, documentId: unknownDocumentId, ready: true, reason: null,
          days: 7, amountToleranceCents: 200,
          candidates: [{
            transactionId, accountId: "95000000-0000-4000-8000-000000000095",
            accountName: "Cuenta corriente", date: "2026-09-02", concept: "COMUNIDAD BLOQUE",
            amountCents: -5404, confidence: 1,
          }],
          principles: { bankSource: "read_only", requiresConfirmation: true, suggestionsPersisted: false },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Buscar sugerencias" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText(/sugerencias no corresponden a este documento/i);
  await expect(page.getByRole("button", { name: "Confirmar sugerencia" })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("REC-DOC-062 · asociaciones malformadas no se muestran ni permiten desasociar", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.searchParams.get("id") === documentId) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 3, document: { ...item },
          associations: [{ id: "asociacion-falsa", transactionId, accountId: item.id, method: "manual",
            date: "2026-09-02", concept: "No verificado", accountName: "Cuenta", amountCents: -5404, confirmed: true }],
          principles,
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await expect(page.getByTestId("documents-alert")).toContainText(/servidor no ha devuelto el documento solicitado/i);
  await expect(page.getByRole("button", { name: "Desasociar" })).toHaveCount(0);
  expect(writes).toEqual([]);
});


test("REC-DOC-063 · búsqueda bancaria malformada no presenta cuentas ni asociar", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/transactions*", async (route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        rows: [{ id: transactionId, bankDate: "2026-09-02", amountCents: -5404,
          concept: { effective: "Movimento sin cuenta" }, category: { effectiveId: null },
          kind: { effective: "expense" } }],
        totalCount: 1,
      }),
    });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByLabel("Buscar movimiento").fill("comunidad");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByTestId("documents-alert")).toContainText(/búsqueda de movimientos ha devuelto datos incompletos/i);
  await expect(page.getByRole("button", { name: "Asociar", exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("REC-DOC-064 · editar búsqueda oculta los resultados anteriores hasta consultar el nuevo concepto", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  const field = page.getByLabel("Buscar movimiento");
  await field.fill("comunidad");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Asociar", exact: true })).toBeVisible();
  await field.fill("seguro");
  await expect(page.getByRole("button", { name: "Asociar", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Asociar", exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test("REC-DOC-065 · dos clics rápidos sobre una asociación generan un solo PATCH", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let attempts = 0;
  await page.route("**/api/documents", async (route) => {
    if (route.request().method() === "PATCH" && route.request().postDataJSON()?.action === "associate") {
      attempts += 1;
      // Keep the first request in flight through another click in the same task.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Buscar sugerencias" }).click();
  await expect(page.getByRole("button", { name: "Confirmar sugerencia" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar sugerencia" }).evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await expect.poll(() => writes.filter((write) => write.action === "associate").length).toBe(1);
  expect(attempts).toBe(1);
});

test("REC-DOC-066 · una sugerencia anterior no se confirma con metadatos pendientes", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Buscar sugerencias" }).click();
  const confirm = page.getByRole("button", { name: "Confirmar sugerencia" });
  await expect(confirm).toBeEnabled();
  await page.getByLabel("Importe (€)").fill("99,99");
  await expect(confirm).toBeDisabled();
  await expect(page.getByText(/Guarda los cambios del documento antes de confirmar una sugerencia/)).toBeVisible();
  expect(writes).toEqual([]);
});


test("REC-DOC-067 · diferencias de importe inválidas no generan sugerencias confirmables", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "candidates") return route.fallback();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1, documentId, ready: true, reason: null,
        days: 7, amountToleranceCents: 200,
        candidates: [{
          transactionId, accountId: "95000000-0000-4000-8000-000000000095",
          accountName: "Cuenta corriente", date: "2026-09-02", concept: "GASTO SIN RESPALDO",
          amountCents: -5404, amountDifferenceCents: "0", dayDifference: 0,
          confidence: 1, effectiveKind: "expense", categoryId: null, merchantId: null,
        }],
        principles: { bankSource: "read_only", requiresConfirmation: true, suggestionsPersisted: false },
      }),
    });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo.pdf/i }).click();
  await page.getByRole("button", { name: "Buscar sugerencias" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText(/sugerencias no corresponden a este documento/i);
  await expect(page.getByRole("button", { name: "Confirmar sugerencia" })).toHaveCount(0);
  expect(writes).toEqual([]);
});


test("REC-OCR-043 · PDF con varias clases de advertencia se explica en español y no muestra códigos internos", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes, [], [
    "pdf_page_sparse_native_unverified:1",
    "pdf_page_visual_ocr_empty:2",
    "pdf_page_3:low_confidence",
    "pdf_page_4:receipt_structure_incomplete",
    "pdf_page_5:future_unrecognized_code",
    "future_internal_ocr_code",
  ]);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo\.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar documento" }).click();
  const panel = page.getByTestId("ocr-review-panel");
  const warnings = panel.getByText("Revisar antes de usar").locator("..");
  await expect(warnings).toContainText("La página 1 tenía texto digital parcial");
  await expect(warnings).toContainText("La página 2 no ha proporcionado texto legible");
  await expect(warnings).toContainText("Página 3: La confianza global es baja");
  await expect(warnings).toContainText("Página 4: Hay filas de producto");
  await expect(warnings).toContainText("Página 5: La lectura de esta página necesita comprobación manual");
  await expect(warnings).toContainText("El lector ha comunicado un aviso no reconocido");
  await expect(warnings).not.toContainText("pdf_page_");
  await expect(warnings).not.toContainText("future_internal_ocr_code");
  expect(writes).toEqual([]);
});


test("REC-OCR-044 · lectura pendiente de revisión no muestra una confirmación de éxito engañosa", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes, [], [], "needs_review");
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo\.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar documento" }).click();
  const panel = page.getByTestId("ocr-review-panel");
  await expect(panel.getByTestId("ocr-review-pending-notice")).toContainText(
    "La lectura requiere revisión",
  );
  await expect(panel.getByText(/Lectura completada sin avisos técnicos/)).toHaveCount(0);
  await expect(panel.getByText(/La lectura requiere revisión/)).toContainText(/original/);
  expect(writes).toEqual([]);
});


test("REC-DOC-068 · página documental no final recortada no permite saltar documentos", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && !url.searchParams.has("id")) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 3, items: [{ ...item }], total: 53,
          limit: 50, offset: 0, principles,
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents");
  await expect(page.getByTestId("documents-alert")).toContainText(/lista documental incompleta o incompatible/i);
  await expect(page.getByText("No se ha podido cargar la lista")).toBeVisible();
  await expect(page.getByRole("button", { name: /factura-demo\.pdf/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Paginación documental" })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("REC-DOC-069 · última página parcial válida muestra el total exacto", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && !url.searchParams.has("id")) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 3, items: [{ ...item }], total: 51,
          limit: 50, offset: 50, principles,
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/documents?offset=50");
  await expect(page.getByRole("button", { name: /factura-demo\.pdf/i })).toBeVisible();
  const pagination = page.getByRole("navigation", { name: "Paginación documental" });
  await expect(pagination).toContainText("Mostrando 51–51 de 51");
  await expect(pagination.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
  await expect(pagination.getByRole("button", { name: "Página anterior" })).toBeEnabled();
  expect(writes).toEqual([]);
});


test("REC-OCR-047 · el fallo de una página PDF indica incompletitud sin código técnico", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes, [], ["pdf_page_visual_ocr_failed:2"], "needs_review");
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo\.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar documento" }).click();
  const panel = page.getByTestId("ocr-review-panel");
  const warnings = panel.getByText("Revisar antes de usar").locator("..");
  await expect(warnings).toContainText("No se ha podido leer la página escaneada 2");
  await expect(warnings).toContainText("Se conservan las demás páginas");
  await expect(warnings).not.toContainText("pdf_page_visual_ocr_failed");
  await expect(panel.getByText("Revisión necesaria", { exact: true })).toBeVisible();
  await expect(panel.getByText("Lectura completada sin avisos técnicos")).toHaveCount(0);
  expect(writes).toEqual([]);
});



test("REC-OCR-050 · la extracción digital fallida explica la recuperación visual en español", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes, [], ["pdf_page_native_text_failed:2"], "needs_review");
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo\.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar documento" }).click();
  const panel = page.getByTestId("ocr-review-panel");
  const warnings = panel.getByText("Revisar antes de usar").locator("..");
  await expect(warnings).toContainText("No se pudo extraer el texto digital de la página 2");
  await expect(warnings).toContainText("OCR visual");
  await expect(warnings).not.toContainText("pdf_page_native_text_failed");
  await expect(panel.getByText("Revisión necesaria", { exact: true })).toBeVisible();
  await expect(panel.getByText("Lectura completada sin avisos técnicos")).toHaveCount(0);
  expect(writes).toEqual([]);
});


test("REC-DOC-070 · una firma de subida hacia un dominio ajeno bloquea el envío del original", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://collector.example.invalid/")) externalRequests.push(request.url());
  });
  await page.route("**/api/documents", async (route) => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if (body?.action !== "upload_sign") return route.fallback();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        bucket: "financial-app-documents", path: signedUploadPath,
        token: "token", signedUrl: "https://collector.example.invalid/storage/v1/object/upload/sign/financial-app-documents/" + signedUploadPath + "?token=token",
        originalFileName: body.originalFileName, mimeType: body.mimeType,
        sizeBytes: body.sizeBytes, maxFileBytes: 15728640,
      }),
    });
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "factura-privada.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("no pertenece al almacenamiento privado autorizado");
  expect(externalRequests).toHaveLength(0);
  expect(writes.some((write) => write.action === "upload_finalize")).toBe(false);
});

test("REC-DOC-071 · dos envíos rápidos crean una sola subida privada", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let signAttempts = 0;
  await page.route("**/api/documents", async (route) => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if (body?.action === "upload_sign") {
      signAttempts += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "unica-factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test"),
  });
  await page.getByRole("button", { name: "Guardar original" }).evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await expect(page.getByRole("heading", { name: "unica-factura.pdf" })).toBeVisible();
  expect(signAttempts).toBe(1);
  expect(writes.filter((write) => write.action === "upload_finalize")).toHaveLength(1);
});

test("REC-DOC-080 · finalize incierto reintenta la MISMA ruta firmada sin crear otra subida", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let signCalls = 0;
  let finalizeCalls = 0;
  let finalizedPath = "";
  let privateUploads = 0;
  page.on("request", request => {
    if (request.url().includes("/storage/v1/object/upload/sign/") && request.method() === "PUT") {
      privateUploads += 1;
    }
  });
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    if (body.action === "upload_sign") signCalls += 1;
    if (body.action === "upload_finalize") {
      finalizeCalls += 1;
      if (finalizeCalls === 1) {
        finalizedPath = body.path;
        // The first result is uncertain: do not infer absence of a DB row.
        await route.fulfill({
          status: 503, contentType: "application/json",
          body: JSON.stringify({ error: "persistence_failed" }),
        });
        return;
      }
      expect(body.path).toBe(finalizedPath);
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "pago-sin-confirmar.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 original privado"),
  });
  const submit = page.getByRole("button", { name: "Guardar original" });
  await submit.click();
  await expect(page.getByTestId("document-upload-unverified")).toContainText("Subida sin confirmar");
  await expect(submit).toBeDisabled();
  expect(signCalls).toBe(1);
  expect(finalizeCalls).toBe(1);
  expect(privateUploads).toBe(1);
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "pago-sin-confirmar.pdf" })).toBeVisible();
  await expect(page.getByTestId("document-upload-unverified")).toHaveCount(0);
  expect(signCalls).toBe(1);
  expect(finalizeCalls).toBe(2);
  expect(privateUploads).toBe(1);
  expect(writes.filter(row => row.action === "upload_finalize")).toHaveLength(1);
});

test("REC-DOC-081 · un error repetido al reintentar registro mantiene el bloqueo seguro", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let finalizeCalls = 0;
  let signCalls = 0;
  let failFinalize = true;
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    if (body.action === "upload_sign") signCalls += 1;
    if (body.action !== "upload_finalize") return route.fallback();
    finalizeCalls += 1;
    if (failFinalize) {
      await route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "persistence_failed" }),
      });
      return;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "original-sin-confirmar.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 original privado de muestra"),
  });
  const submit = page.getByRole("button", { name: "Guardar original" });
  await submit.click();
  const retry = page.getByRole("button", { name: "Recuperar el mismo original" });
  await expect(retry).toBeVisible();
  await expect(submit).toBeDisabled();
  await retry.click();
  await expect(page.getByTestId("documents-alert")).toContainText("Sigue bloqueada para evitar copias duplicadas");
  await expect(submit).toBeDisabled();
  expect(signCalls).toBe(1);
  expect(finalizeCalls).toBe(2);
  failFinalize = false;
  await retry.click();
  await expect(page.getByTestId("document-upload-unverified")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "original-sin-confirmar.pdf" })).toBeVisible();
  expect(signCalls).toBe(1);
  expect(finalizeCalls).toBe(3);
  expect(writes.filter(row => row.action === "upload_finalize")).toHaveLength(1);
});

test("REC-DOC-082 · un finalize de otro objeto no elimina el bloqueo por un HTTP 200", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let finalizeCalls = 0;
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST"
      || route.request().postDataJSON()?.action !== "upload_finalize") {
      return route.fallback();
    }
    finalizeCalls += 1;
    if (finalizeCalls === 1) {
      await route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "persistence_failed" }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1, principles,
        document: { ...item, id: uploadedDocumentId, storageKey: "uploads/other-workspace/another.pdf" },
        associations: [],
      }),
    });
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "original-privado.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 otro objeto"),
  });
  const submit = page.getByRole("button", { name: "Guardar original" });
  await submit.click();
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("Sigue bloqueada para evitar copias duplicadas");
  await expect(submit).toBeDisabled();
  expect(finalizeCalls).toBe(2);
  expect(writes.filter(row => row.action === "upload_finalize")).toHaveLength(0);
});

test("REC-DOC-083 · un PUT privado 503 se recupera en la misma ruta sin solicitar otra firma", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let signed = 0;
  let privatePutCount = 0;
  let privatePath: string | null = null;
  await page.route("**/api/documents", async route => {
    if (route.request().method() === "POST"
      && route.request().postDataJSON()?.action === "upload_sign") signed += 1;
    return route.fallback();
  });
  await page.route(signedUploadUrl, async route => {
    privatePutCount += 1;
    const path = new URL(route.request().url()).pathname;
    if (!privatePath) privatePath = path;
    expect(path).toBe(privatePath);
    await route.fulfill({
      status: privatePutCount === 1 ? 503 : 200, body: privatePutCount === 1 ? "inconclusive" : "ok",
    });
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "envio-red-interrumpida.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 seguro"),
  });
  const save = page.getByRole("button", { name: "Guardar original" });
  await save.click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await expect(save).toBeDisabled();
  expect(signed).toBe(1);
  expect(privatePutCount).toBe(1);
  expect(writes.filter(w => w.action === "upload_finalize")).toHaveLength(0);
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "envio-red-interrumpida.pdf" })).toBeVisible();
  expect(signed).toBe(1);
  expect(privatePutCount).toBe(2);
  expect(writes.filter(w => w.action === "upload_finalize")).toHaveLength(1);
});

test("REC-DOC-084 · un conflicto PUT de objeto ya presente se resuelve mediante finalize de la misma ruta", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let privatePutCount = 0;
  let signed = 0;
  await page.route("**/api/documents", async route => {
    if (route.request().method() === "POST"
      && route.request().postDataJSON()?.action === "upload_sign") signed += 1;
    return route.fallback();
  });
  await page.route(signedUploadUrl, async route => {
    privatePutCount += 1;
    await route.fulfill({
      status: privatePutCount === 1 ? 503 : 409,
      json: { error: privatePutCount === 1 ? "storage_response_lost" : "object_already_exists" },
    });
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "original-ya-presente.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 existe en storage"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "original-ya-presente.pdf" })).toBeVisible();
  expect(signed).toBe(1);
  expect(privatePutCount).toBe(2);
  expect(writes.filter(w => w.action === "upload_finalize")).toHaveLength(1);
});

test("REC-DOC-085 · ni PUT ni finalize comprobables mantienen bloqueada la copia", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let signed = 0;
  let putCalls = 0;
  let finalizeCalls = 0;
  await page.route(signedUploadUrl, async route => {
    putCalls += 1;
    await route.fulfill({ status: 503, body: "unknown" });
  });
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const action = route.request().postDataJSON()?.action;
    if (action === "upload_sign") signed += 1;
    if (action === "upload_finalize") {
      finalizeCalls += 1;
      await route.fulfill({ status: 404, json: { error: "document_upload_not_found" } });
      return;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "incertidumbre-persistente.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 pendiente"),
  });
  const save = page.getByRole("button", { name: "Guardar original" });
  await save.click();
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("Sigue bloqueada");
  await expect(save).toBeDisabled();
  expect(signed).toBe(1);
  expect(putCalls).toBe(2);
  expect(finalizeCalls).toBe(1);
  expect(writes.filter(w => w.action === "upload_finalize")).toHaveLength(0);
});

const pendingPrivateUploadKey = "financial-app:documents:pending-private-upload:v1";

test("REC-DOC-086 · recargar tras finalize 503 conserva la ruta sin guardar tokens ni originales", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let signatures = 0;
  let finalizes = 0;
  let puts = 0;
  await page.route(signedUploadUrl, async route => {
    puts += 1;
    await route.fulfill({ status: 200, body: "ok" });
  });
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    if (body.action === "upload_sign") signatures += 1;
    if (body.action === "upload_finalize" && ++finalizes === 1) {
      await route.fulfill({ status: 503, json: { error: "persistence_failed" } });
      return;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "contrato-solo-en-memoria.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 BYTES-ORIGINALES-SENSIBLES"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  const journal = await page.evaluate(key => localStorage.getItem(key), pendingPrivateUploadKey);
  expect(journal).toBeTruthy();
  expect(JSON.parse(journal!)).toMatchObject({
    version: 1, action: "upload_finalize",
    originalFileName: "contrato-solo-en-memoria.pdf",
    path: signedUploadPath, storagePutConfirmed: true,
  });
  expect(journal).not.toContain("BYTES-ORIGINALES-SENSIBLES");
  expect(journal).not.toContain("signedUrl");
  expect(journal).not.toContain("token");
  await page.reload();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar original" })).toBeDisabled();
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "contrato-solo-en-memoria.pdf" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), pendingPrivateUploadKey)).toBeNull();
  expect(signatures).toBe(1);
  expect(finalizes).toBe(2);
  expect(puts).toBe(1);
});

test("REC-DOC-087 · PUT incierto tras recarga consulta solo la ruta existente sin nueva firma ni PUT", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let signs = 0;
  let puts = 0;
  let finalize = 0;
  await page.route(signedUploadUrl, async route => {
    puts += 1;
    await route.fulfill({ status: 503, body: "conexión interrumpida" });
  });
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const action = route.request().postDataJSON()?.action;
    if (action === "upload_sign") signs += 1;
    if (action === "upload_finalize") finalize += 1;
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "archivo-almacenado-sin-respuesta.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 almacenado"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), pendingPrivateUploadKey)).storagePutConfirmed).toBe(false);
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "archivo-almacenado-sin-respuesta.pdf" })).toBeVisible();
  expect(signs).toBe(1);
  expect(puts).toBe(1);
  expect(finalize).toBe(1);
  expect(await page.evaluate(key => localStorage.getItem(key), pendingPrivateUploadKey)).toBeNull();
});

test("REC-DOC-088 · PUT no encontrado tras recarga mantiene bloqueo hasta constatar el mismo objeto", async ({ page }) => {
  await mockDocumentApi(page, []);
  let missing = true;
  let signs = 0;
  let puts = 0;
  let finalizes = 0;
  await page.route(signedUploadUrl, async route => {
    puts += 1;
    await route.fulfill({ status: 503, body: "sin certeza" });
  });
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    if (body.action === "upload_sign") signs += 1;
    if (body.action === "upload_finalize") {
      finalizes += 1;
      if (missing) {
        await route.fulfill({ status: 404, json: { error: "document_upload_not_found" } });
        return;
      }
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "factura-pendiente-servidor.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 pendiente"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("aún no ha confirmado");
  await expect(page.getByRole("button", { name: "Guardar original" })).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), pendingPrivateUploadKey)).not.toBeNull();
  missing = false;
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "factura-pendiente-servidor.pdf" })).toBeVisible();
  expect(signs).toBe(1);
  expect(puts).toBe(1);
  expect(finalizes).toBe(2);
});

test("REC-DOC-089 · una referencia malformada bloquea cargas nuevas tras recarga", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.addInitScript(key => sessionStorage.setItem(key, '{"version":1,"path":"invalido"}'), pendingPrivateUploadKey);
  await page.goto("/documents");
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar original" })).toBeDisabled();
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("ilegible");
  expect(writes.filter(w => w.action === "upload_sign")).toHaveLength(0);
});

test("REC-DOC-090 · sin almacenamiento de sesión se rechaza el PUT antes de enviar bytes", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let puts = 0;
  await page.route(signedUploadUrl, async route => {
    puts += 1;
    await route.fulfill({ status: 200, body: "ok" });
  });
  await page.addInitScript(key => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException("Access denied", "SecurityError");
      return originalSet.call(this, name, value);
    };
  }, pendingPrivateUploadKey);
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "privado-no-journal.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 no-envio"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("no permite guardar de forma segura");
  expect(writes.filter(w => w.action === "upload_sign")).toHaveLength(1);
  expect(writes.filter(w => w.action === "upload_finalize")).toHaveLength(0);
  expect(puts).toBe(0);
});

test("REC-DOC-091 · una subida confirmada elimina el journal antes de recargar", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "original-validado.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 valido"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByRole("heading", { name: "original-validado.pdf" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), pendingPrivateUploadKey)).toBeNull();
  await page.reload();
  await expect(page.getByTestId("document-upload-unverified")).toHaveCount(0);
  expect(writes.filter(w => w.action === "upload_sign")).toHaveLength(1);
});

test("REC-DOC-092 · un finalize con tamaño distinto no confirma el original ni permite otro envío", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let mismatched = true;
  let signs = 0;
  let finalizes = 0;
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    if (body.action === "upload_sign") signs += 1;
    if (body.action === "upload_finalize") {
      finalizes += 1;
      if (mismatched) {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            contractVersion: 1, principles, associations: [],
            document: {
              ...item, id: uploadedDocumentId, storageKey: body.path,
              originalFileName: body.originalFileName,
              type: body.type, mimeType: body.mimeType,
              sizeBytes: 1,
            },
          }),
        });
        return;
      }
    }
    return route.fallback();
  });
  await page.goto("/documents");
  const content = Buffer.from("%PDF-1.4 DOCUMENTO-REAL");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "factura-corrupta.pdf", mimeType: "application/pdf", buffer: content,
  });
  const save = page.getByRole("button", { name: "Guardar original" });
  await save.click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await expect(save).toBeDisabled();
  expect(signs).toBe(1);
  expect(finalizes).toBe(1);
  const journal = await page.evaluate(() =>
    localStorage.getItem("financial-app:documents:pending-private-upload:v1"));
  expect(JSON.parse(journal!)).toMatchObject({
    originalFileName: "factura-corrupta.pdf", sizeBytes: content.length,
  });
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("Sigue bloqueada");
  expect(signs).toBe(1);
  expect(finalizes).toBe(2);
  mismatched = false;
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "factura-corrupta.pdf" })).toBeVisible();
  await expect(page.getByTestId("document-upload-unverified")).toHaveCount(0);
  expect(signs).toBe(1);
  expect(finalizes).toBe(3);
});

test("REC-DOC-093 · el tamaño del original sigue verificándose tras recargar con PUT incierto", async ({ page }) => {
  await mockDocumentApi(page, []);
  let wrongSize = true;
  let puts = 0;
  let signCalls = 0;
  let finalizes = 0;
  await page.route(signedUploadUrl, async route => {
    puts += 1;
    await route.fulfill({ status: 503, body: "fallo intermitente" });
  });
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    if (body.action === "upload_sign") signCalls += 1;
    if (body.action === "upload_finalize") {
      finalizes += 1;
      if (wrongSize) {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            contractVersion: 1, principles, associations: [],
            document: {
              ...item, id: uploadedDocumentId, storageKey: body.path,
              originalFileName: body.originalFileName,
              type: body.type, mimeType: body.mimeType,
              sizeBytes: 2,
            },
          }),
        });
        return;
      }
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "original-interrumpido.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 RESTAURADO"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("no ha confirmado");
  expect(signCalls).toBe(1);
  expect(puts).toBe(1);
  expect(finalizes).toBe(1);
  wrongSize = false;
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "original-interrumpido.pdf" })).toBeVisible();
  expect(finalizes).toBe(2);
  expect(puts).toBe(1);
  expect(signCalls).toBe(1);
});

test("REC-DOC-094 · impide abandonar Documentos durante una subida privada todavía activa", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let signed = 0;
  let resolveSigning: (() => void) | undefined;
  const signingGate = new Promise<void>(resolve => { resolveSigning = resolve; });
  await page.route("**/api/documents", async route => {
    if (route.request().method() === "POST"
      && route.request().postDataJSON()?.action === "upload_sign") {
      signed += 1;
      await signingGate;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "no-perder-archivo.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 documento protegido"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect.poll(() => signed).toBe(1);
  await page.getByRole("link", { name: "← Inicio", exact: true }).click();
  await expect(page).toHaveURL(/\/documents/);
  await expect(page.getByTestId("documents-alert")).toContainText("Hay un envío de documento en curso");
  await expect(page.getByRole("alertdialog", { name: "Cambios sin guardar" })).toHaveCount(0);
  resolveSigning?.();
  await expect(page.getByRole("heading", { name: "no-perder-archivo.pdf" })).toBeVisible();
  expect(writes.filter(w => w.action === "upload_sign")).toHaveLength(1);
});

test("REC-DOC-095 · aviso antes de salir existe durante un registro incierto, pero desaparece tras verificar", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let finalizes = 0;
  await page.route("**/api/documents", async route => {
    if (route.request().method() === "POST"
      && route.request().postDataJSON()?.action === "upload_finalize"
      && ++finalizes === 1) {
      await route.fulfill({ status: 503, json: { error: "persistence_failed" } });
      return;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "registro-por-verificar.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 original"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  const before = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(before).toBe(true);
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "registro-por-verificar.pdf" })).toBeVisible();
  const after = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(after).toBe(false);
  expect(finalizes).toBe(2);
});


const durableUploadKey = "financial-app:documents:pending-private-upload:v1";

test("REC-DOC-096 · SHA-256 de bytes reales viaja hasta finalize y la constancia excluye secretos", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  const original = Buffer.from("%PDF-1.4 ORIGINAL-CHECKSUM-CONTROLADO");
  const expectedHash = createHash("sha256").update(original).digest("hex");
  let finalizes = 0;
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    if (route.request().postDataJSON()?.action === "upload_finalize" && ++finalizes === 1) {
      await route.fulfill({ status: 503, json: { error: "persistence_failed" } });
      return;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "factura-huella-real.pdf", mimeType: "application/pdf", buffer: original,
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  const journal = await page.evaluate(key => localStorage.getItem(key), durableUploadKey);
  expect(journal).toBeTruthy();
  expect(JSON.parse(journal!)).toMatchObject({
    expectedSha256: expectedHash, sizeBytes: original.length,
    originalFileName: "factura-huella-real.pdf",
  });
  expect(journal).not.toContain("signedUrl");
  expect(journal).not.toContain("token");
  expect(journal).not.toContain("ORIGINAL-CHECKSUM-CONTROLADO");
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "factura-huella-real.pdf" })).toBeVisible();
  expect(writes.filter(w => w.action === "upload_finalize")).toMatchObject([{
    expectedSha256: expectedHash, expectedSizeBytes: original.length,
    path: signedUploadPath,
  }]);
  expect(await page.evaluate(key => localStorage.getItem(key), durableUploadKey)).toBeNull();
  expect(finalizes).toBe(2);
});

test("REC-DOC-097 · HTTP 200 con atestación criptográfica de otro original no desbloquea la subida", async ({ page }) => {
  await mockDocumentApi(page, []);
  let forged = true;
  let signed = 0;
  let finalizes = 0;
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    if (body.action === "upload_sign") signed += 1;
    if (body.action === "upload_finalize") {
      finalizes += 1;
      if (forged) {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            contractVersion: 1, principles, associations: [],
            document: { ...item, id: uploadedDocumentId, storageKey: body.path,
              originalFileName: body.originalFileName, type: body.type, mimeType: body.mimeType,
              sizeBytes: body.expectedSizeBytes },
            uploadIntegrity: { sha256: "0".repeat(64), sizeBytes: body.expectedSizeBytes, verified: true },
          }),
        });
        return;
      }
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "otro-original.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 evidencia"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar original" })).toBeDisabled();
  expect(signed).toBe(1);
  expect(finalizes).toBe(1);
  forged = false;
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "otro-original.pdf" })).toBeVisible();
  expect(signed).toBe(1);
  expect(finalizes).toBe(2);
});

test("REC-DOC-098 · cerrar pestaña conserva ruta/huella recuperables en otra pestaña del navegador", async ({ page }) => {
  await mockDocumentApi(page, []);
  let finalizes = 0;
  let puts = 0;
  await page.route(signedUploadUrl, async route => {
    puts += 1;
    await route.fulfill({ status: 200, body: "ok" });
  });
  await page.route("**/api/documents", async route => {
    if (route.request().method() === "POST"
      && route.request().postDataJSON()?.action === "upload_finalize"
      && ++finalizes === 1) {
      await route.fulfill({ status: 503, json: { error: "persistence_failed" } });
      return;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "documento-tras-cierre.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 CONTINUIDAD-DURADERA"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), durableUploadKey)).toBeTruthy();
  await page.close();
  const reopened = await page.context().newPage();
  const newWrites: Array<Record<string, unknown>> = [];
  await mockDocumentApi(reopened, newWrites);
  await reopened.goto("/documents");
  await expect(reopened.getByTestId("document-upload-unverified")).toBeVisible();
  await expect(reopened.getByRole("button", { name: "Guardar original" })).toBeDisabled();
  await reopened.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(reopened.getByRole("heading", { name: "documento-tras-cierre.pdf" })).toBeVisible();
  expect(newWrites.filter(w => w.action === "upload_sign")).toHaveLength(0);
  expect(newWrites.filter(w => w.action === "upload_finalize")).toHaveLength(1);
  expect(puts).toBe(1);
  expect(await reopened.evaluate(key => localStorage.getItem(key), durableUploadKey)).toBeNull();
  await reopened.close();
});

test("REC-DOC-099 · otra pestaña detecta la subida pendiente sin firmar un segundo objeto", async ({ page }) => {
  await mockDocumentApi(page, []);
  await page.route("**/api/documents", async route => {
    if (route.request().method() === "POST"
      && route.request().postDataJSON()?.action === "upload_finalize") {
      await route.fulfill({ status: 503, json: { error: "persistence_failed" } });
      return;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "copia-en-otra-pestana.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 no duplicar"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  const second = await page.context().newPage();
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(second, writes);
  await second.goto("/documents");
  await expect(second.getByTestId("document-upload-unverified")).toBeVisible();
  await expect(second.getByLabel("Galería o archivo")).toBeDisabled();
  await expect(second.getByRole("button", { name: "Guardar original" })).toBeDisabled();
  expect(writes.filter(w => w.action === "upload_sign")).toHaveLength(0);
  await second.close();
});

test("REC-DOC-100 · si localStorage rechaza persistencia no se inicia un PUT privado", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let puts = 0;
  await page.route(signedUploadUrl, async route => {
    puts += 1; await route.fulfill({ status: 200, body: "ok" });
  });
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key && this === localStorage) throw new DOMException("No persistence", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, durableUploadKey);
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "sin-recuperacion-duradera.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 prueba"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("no permite guardar de forma segura");
  expect(puts).toBe(0);
  expect(writes.filter(w => w.action === "upload_finalize")).toHaveLength(0);
});

test("REC-DOC-101 · journal antiguo de sesión migra sin token y recupera exactamente la ruta previa", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.addInitScript(({key,path}) => sessionStorage.setItem(key, JSON.stringify({
    version: 1, action: "upload_finalize", type: "invoice",
    originalFileName: "documento-version-antigua.pdf",
    mimeType: "application/pdf", path, storagePutConfirmed: true,
  })), {key: durableUploadKey, path: signedUploadPath});
  await page.goto("/documents");
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), durableUploadKey)).toBeTruthy();
  await page.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(page.getByRole("heading", { name: "documento-version-antigua.pdf" })).toBeVisible();
  expect(writes.filter(w => w.action === "upload_sign")).toHaveLength(0);
  expect(writes.filter(w => w.action === "upload_finalize")).toHaveLength(1);
  expect(await page.evaluate(key => localStorage.getItem(key), durableUploadKey)).toBeNull();
});

test("REC-DOC-102 · API rechaza tamaños y huellas incorrectas antes de contactar el gateway", async () => {
  const base = {
    action: "upload_finalize", type: "invoice",
    originalFileName: "archivo.pdf", mimeType: "application/pdf",
    path: signedUploadPath,
  };
  const invalid = [
    { expectedSha256: "bad" },
    { expectedSha256: "A".repeat(64) },
    { expectedSizeBytes: 0 },
    { expectedSizeBytes: 16 * 1024 * 1024 },
  ];
  for (const fields of invalid) {
    const response = await postDocumentAction(new Request("https://test.local/api/documents", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, ...fields }),
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(payload.error).toBe("invalid_request");
  }
});

test("REC-DOC-103 · gateway antiguo sin SHA-256 se bloquea ANTES de enviar un solo byte", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let signCalls = 0;
  let puts = 0;
  await page.route(signedUploadUrl, async route => {
    puts += 1;
    await route.fulfill({ status: 200, body: "ok" });
  });
  await page.route("**/api/documents", async route => {
    if (route.request().method() === "POST"
      && route.request().postDataJSON()?.action === "upload_sign") {
      const body = route.request().postDataJSON();
      signCalls += 1;
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          bucket: "financial-app-documents", path: signedUploadPath,
          token: "token", signedUrl: signedUploadUrl,
          originalFileName: body.originalFileName, mimeType: body.mimeType,
          sizeBytes: body.sizeBytes, maxFileBytes: 15728640,
          // Legacy gateway omits hashVerificationVersion/hashAlgorithm.
        }),
      });
      return;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "no-enviar-a-servidor-antiguo.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 protegido"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("aún no admite la verificación segura SHA-256");
  expect(signCalls).toBe(1);
  expect(puts).toBe(0);
  expect(writes.filter(w => w.action === "upload_finalize")).toHaveLength(0);
  expect(await page.evaluate(key => localStorage.getItem(key), durableUploadKey)).toBeNull();
});

test("REC-DOC-104 · otra pestaña que confirmó el original no deja revivir un journal antiguo", async ({ page }) => {
  await mockDocumentApi(page, []);
  let finalizesInFirst = 0;
  await page.route("**/api/documents", async route => {
    if (route.request().method() === "POST"
      && route.request().postDataJSON()?.action === "upload_finalize"
      && ++finalizesInFirst === 1) {
      await route.fulfill({ status: 503, json: { error: "persistence_failed" } });
      return;
    }
    return route.fallback();
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "confirmado-desde-otra-pestana.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 entre-pestanas"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("document-upload-unverified")).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), durableUploadKey)).toBeNull();
  const second = await page.context().newPage();
  await mockDocumentApi(second, []);
  await second.goto("/documents");
  await expect(second.getByTestId("document-upload-unverified")).toBeVisible();
  await second.getByRole("button", { name: "Recuperar el mismo original" }).click();
  await expect(second.getByRole("heading", { name: "confirmado-desde-otra-pestana.pdf" })).toBeVisible();
  expect(await second.evaluate(key => localStorage.getItem(key), durableUploadKey)).toBeNull();
  await second.close();
  await page.reload();
  await expect(page.getByTestId("document-upload-unverified")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar original" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), durableUploadKey)).toBeNull();
});

test("REC-DOC-075 · subir tras filtrar no reconstruye el archivo legacy con filtros antiguos", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let finalized = false;
  let legacyReadsAfterUpload = 0;
  await page.route("**/api/documents?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || url.searchParams.get("limit") !== "100") {
      return route.fallback();
    }
    if (finalized) legacyReadsAfterUpload += 1;
    // A version-1 gateway needs an explicit 100-item inventory only when
    // the actual requested URL still includes unassociated=true.
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1, items: [item], total: 1,
        limit: 100, offset: 0, principles,
      }),
    });
  });
  await page.route("**/api/documents", async (route) => {
    if (route.request().method() === "POST"
      && route.request().postDataJSON()?.action === "upload_finalize") {
      finalized = true;
    }
    return route.fallback();
  });

  await page.goto("/documents?unassociated=true&status=archived");
  await expect(page.getByRole("button", { name: /factura-demo.pdf/i })).toBeVisible();
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "nuevo-original.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 new safe sample"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByRole("heading", { name: "nuevo-original.pdf" })).toBeVisible();
  await expect(page).not.toHaveURL(/unassociated=true|status=archived/);
  expect(finalized).toBe(true);
  expect(legacyReadsAfterUpload).toBe(0);
  expect(writes.filter((write) => write.action === "upload_finalize")).toHaveLength(1);
});

test("REC-DOC-072 · una nueva subida no descarta los metadatos pendientes de otro documento", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-demo\.pdf/i }).click();
  await page.getByLabel("Emisor", { exact: true }).fill("Nombre pendiente de guardar");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "segunda-factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Cambios sin guardar" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Emisor", { exact: true })).toHaveValue("Nombre pendiente de guardar");
  expect(writes.some((write) => write.action === "metadata")).toBe(false);
  await dialog.getByRole("button", { name: "Descartar cambios" }).click();
  await expect(page.getByRole("heading", { name: "segunda-factura.pdf" })).toBeVisible();
  expect(writes.filter((write) => write.action === "upload_finalize")).toHaveLength(1);
});


test("REC-DOC-073 · token firmado alterado bloquea el envío antes de tocar Storage", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  const uploaded: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/storage/v1/object/upload/sign/")) uploaded.push(request.url());
  });
  await page.route("**/api/documents", async (route) => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if (body?.action !== "upload_sign") return route.fallback();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        bucket: "financial-app-documents", path: signedUploadPath,
        token: "expected-token", signedUrl: signedUploadUrl,
        originalFileName: body.originalFileName, mimeType: body.mimeType,
        sizeBytes: body.sizeBytes, maxFileBytes: 15728640,
      }),
    });
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "privada.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("no pertenece al almacenamiento privado autorizado");
  expect(uploaded).toHaveLength(0);
  expect(writes.some((write) => write.action === "upload_finalize")).toBe(false);
});

test("REC-DOC-074 · firma válida para otro archivo no puede reemplazar el original elegido", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockDocumentApi(page, writes);
  let signedUploads = 0;
  await page.route("**/api/documents", async (route) => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if (body?.action !== "upload_sign") return route.fallback();
    signedUploads += 1;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        bucket: "financial-app-documents", path: signedUploadPath,
        token: "token", signedUrl: signedUploadUrl,
        originalFileName: "otro-documento.pdf", mimeType: body.mimeType,
        sizeBytes: body.sizeBytes, maxFileBytes: 15728640,
      }),
    });
  });
  await page.goto("/documents");
  await page.getByLabel("Galería o archivo").setInputFiles({
    name: "factura-correcta.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test"),
  });
  await page.getByRole("button", { name: "Guardar original" }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("no pertenece al almacenamiento privado autorizado");
  expect(signedUploads).toBe(1);
  expect(writes.some((write) => write.action === "upload_finalize")).toBe(false);
});
