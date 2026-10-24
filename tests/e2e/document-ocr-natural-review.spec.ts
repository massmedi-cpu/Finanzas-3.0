import { expect, test } from "@playwright/test";
import { buildDocumentOcrResult, reconstructOcrPage } from "../../src/domain/document-ocr";

const documentId = "94000000-0000-4000-8000-000000000094";

const document = {
  id: documentId,
  type: "invoice",
  notes: "",
  status: "pending_review",
  mimeType: "application/pdf",
  createdAt: "2026-09-17T06:00:00Z",
  sizeBytes: 4096,
  updatedAt: "2026-09-17T06:00:00Z",
  issuerName: null,
  totalCents: null,
  documentDate: null,
  storageProvider: "supabase",
  associationCount: 0,
  originalFileName: "factura-prueba.pdf",
  sourceModifiedAt: null,
  sourceDriveFileId: null,
};

const principles = {
  bankSource: "read_only",
  ocrEnabled: false,
  getHasSideEffects: false,
  suggestionsPersisted: false,
  associationsRequireConfirmation: true,
};

test("REC-OCR-326 · incomplete PDFs show doubtful aggregates and an actionable Spanish warning without automatic confirmation", async ({ page }) => {
  const text = ["Emisor: TIENDA EJEMPLO", "Fecha: 01/10/2026", "Base imponible 100,00", "IVA 21 % 21,00", "TOTAL A PAGAR 121,00"];
  const result = buildDocumentOcrResult({
    documentId, source: "pdf_text", extractor: "synthetic-page-limit", extractedAt: "2026-10-22T12:00:00Z",
    pages: [reconstructOcrPage(1, text.map((value, i) => ({
      text: value, confidence: 0.99, box: { x: 0.1, y: 0.1 + i * 0.12, width: 0.8, height: 0.04 },
    })))],
    warnings: ["pdf_page_limit_reached"],
  });
  const writes: string[] = [];
  await page.route(/\/api\/documents(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/documents/drive-sync" && request.method() === "POST") {
      await route.fulfill({ status: 409, json: { code: "preview_drive_sync_read_only" } });
      return;
    }
    if (request.method() !== "GET") {
      writes.push(request.method() + " " + url.pathname);
      await route.fulfill(url.pathname === "/api/documents/ocr" && request.method() === "POST"
        ? { status: 200, json: result }
        : { status: 409, json: { error: "unexpected_write" } });
      return;
    }
    if (url.pathname === "/api/documents/ocr-review") {
      await route.fulfill({ status: 200, json: {
        documentId, runs: [{ id: "98000000-0000-4000-8000-000000000326", extractor: result.extractor, extractedAt: result.extractedAt }], reviews: [],
      } });
      return;
    }
    await route.fulfill({ status: 200, json: url.searchParams.has("id")
      ? { contractVersion: 1, document, associations: [], principles }
      : { contractVersion: 1, items: [document], total: 1, limit: 50, offset: 0, principles } });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-prueba.pdf/i }).click();
  const panel = page.getByTestId("ocr-review-panel");
  await panel.getByRole("button", { name: "Analizar documento" }).click();
  for (const field of ["taxBaseCents", "taxesCents", "totalCents"]) {
    await expect(panel.getByTestId("ocr-field-" + field)).toContainText("Dudoso");
    await expect(panel.getByTestId("ocr-field-" + field)).not.toContainText("Fiable");
  }
  await expect(panel.getByText("Faltan páginas por leer o recuperar. La base, los impuestos y el total necesitan revisión con el original completo.", { exact: true })).toBeVisible();
  await expect(panel.getByText("Revisa primero total con el original", { exact: true }).last()).toBeVisible();
  expect(writes).toEqual(["POST /api/documents/ocr"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Documentos convierte OCR en un recorrido de revisión humana sin escrituras automáticas", async ({ page }) => {
  const writes: string[] = [];
  let ocrRuns = 0;
  let ocrMethod: string | null = null;

  await page.route(/\/api\/documents\/ocr(?:\?.*)?$/, async (route) => {
    ocrRuns += 1;
    ocrMethod = route.request().method();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        documentId,
        status: "needs_review",
        source: "pdf_text",
        extractor: "pdfjs",
        extractedAt: "2026-09-17T06:30:00.000Z",
        confidence: 0.72,
        plainText: "TIENDA PRUEBA\nTOTAL 24,50 EUR",
        pages: [{
          pageNumber: 1,
          plainText: "TIENDA PRUEBA\nTOTAL 24,50 EUR",
          layoutText: "GEOMETRIA BRUTA\nTOTAL                         24,50 EUR",
          reviewText: "TIENDA PRUEBA\nTOTAL: 24,50 EUR",
          receiptIntegrity: {
            status: "verified",
            productRows: 5,
            candidateProductRows: 5,
            unresolvedProductRows: 0,
            arithmeticRowsChecked: 5,
            arithmeticRowsMatching: 5,
            lineTotalMatchesDocumentTotal: true,
            basePlusTaxMatchesTotal: true,
          },
          lines: [
            { id: "p1-l1", text: "TIENDA PRUEBA", confidence: 0.91, alignment: "center", box: { x: 0.3, y: 0.05, width: 0.4, height: 0.04 }, words: [] },
            { id: "p1-l2", text: "TOTAL 24,50 EUR", confidence: 0.54, alignment: "left", box: { x: 0.1, y: 0.12, width: 0.5, height: 0.04 }, words: [] },
          ],
        }],
        warnings: ["low_confidence"],
        principles: {
          bankSource: "read_only",
          financialWrites: false,
          requiresHumanReview: true,
          preservesGeometry: true,
        },
      }),
    });
  });

  await page.route("**/api/documents*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") {
      writes.push(request.method());
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "unexpected_write" }) });
      return;
    }
    if (url.pathname === "/api/documents/ocr-review") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ runs: [], reviews: [] }) });
      return;
    }
    if (url.searchParams.get("id") === documentId && url.searchParams.get("mode") === "open") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "https://example.test/factura.pdf" }) });
      return;
    }
    if (url.searchParams.get("id") === documentId) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ contractVersion: 1, document, associations: [], principles }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, items: [document], total: 1, limit: 50, offset: 0, principles }),
    });
  });

  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-prueba.pdf/i }).click();

  const panel = page.getByTestId("ocr-review-panel");
  await expect(panel.getByRole("list", { name: "Proceso de revisión OCR" })).toContainText("Original");
  await expect(panel.getByRole("list", { name: "Proceso de revisión OCR" })).toContainText("Revisión");
  await expect(panel.getByRole("button", { name: /Analizar/ })).toBeEnabled();
  expect(ocrRuns).toBe(0);
  expect(ocrMethod).toBeNull();
  expect(writes).toHaveLength(0);

  await panel.getByRole("button", { name: /Analizar/ }).click();
  await expect.poll(() => ocrRuns).toBe(1);
  expect(ocrMethod).toBe("POST");
  // The unlabelled "TIENDA PRUEBA" header cannot prove the issuer, even at
  // confidence 0.91: the financial total AND issuer need original comparison.
  await expect(panel.getByText("Revisa primero comercio / emisor y total con el original", { exact: true }).last()).toBeVisible();
  await expect(panel.getByText("1 a revisar", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText(/TOTAL:\s+24,50 EUR/).last()).toBeVisible();
  await expect(panel.getByText("GEOMETRIA BRUTA", { exact: true })).toHaveCount(0);
  await expect(panel.getByText("Coherencia numérica verificada", { exact: true })).toBeVisible();
  await expect(panel.getByText(/5\/5 filas estructuradas · 5\/5 líneas cuadran · suma de líneas = total/)).toBeVisible();
  await expect(panel.getByText("Corrige y guarda solo lo comprobado en el formulario superior. La lectura OCR original permanece separada y sin sobrescribirse.", { exact: true })).toBeVisible();
  // REC-OCR-UI-015 · The description input must not remount (lose focus)
  // on each character, even after adding another product line.
  const lines = panel.getByTestId("ocr-confirmation-lines");
  await lines.getByRole("button", { name: "Añadir línea" }).click();
  const firstDescription = lines.getByRole("textbox", { name: "Descripción" }).first();
  await firstDescription.click();
  await firstDescription.pressSequentially("CAFE", { delay: 20 });
  await expect(firstDescription).toHaveValue("CAFE");
  await expect(firstDescription).toBeFocused();
  await lines.getByRole("button", { name: "Añadir línea" }).click();
  const secondDescription = lines.getByRole("textbox", { name: "Descripción" }).nth(1);
  await secondDescription.fill("AGUA");
  await lines.getByRole("button", { name: "Quitar línea" }).first().click();
  await expect(lines.getByRole("textbox", { name: "Descripción" })).toHaveCount(1);
  await expect(lines.getByRole("textbox", { name: "Descripción" })).toHaveValue("AGUA");
  expect(writes).toHaveLength(0);
});
