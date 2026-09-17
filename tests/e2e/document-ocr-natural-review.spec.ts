import { expect, test } from "@playwright/test";

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

test("Documentos convierte OCR en un recorrido de revisión humana sin escrituras automáticas", async ({ page }) => {
  const writes: string[] = [];
  let ocrReads = 0;

  await page.route("**/api/documents/ocr*", async (route) => {
    ocrReads += 1;
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
          layoutText: "TIENDA PRUEBA\nTOTAL                         24,50 EUR",
          lines: [
            { id: "p1-l1", text: "TIENDA PRUEBA", confidence: 0.91, alignment: "center" },
            { id: "p1-l2", text: "TOTAL 24,50 EUR", confidence: 0.54, alignment: "left" },
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
  await expect(panel.getByRole("list", { name: "Proceso de revisión OCR" })).toContainText("Datos");
  await expect(panel.getByRole("button", { name: /Analizar/ })).toBeEnabled();
  expect(ocrReads).toBe(0);
  expect(writes).toHaveLength(0);

  await panel.getByRole("button", { name: /Analizar/ }).click();
  await expect.poll(() => ocrReads).toBe(1);
  await expect(panel.getByText("Compara la lectura con el original")).toBeVisible();
  await expect(panel.getByText("1 a revisar")).toBeVisible();
  await expect(panel.getByText("TOTAL                         24,50 EUR")).toBeVisible();
  await expect(panel.getByText("Los datos editables siguen arriba y requieren guardado explícito.")).toBeVisible();
  expect(writes).toHaveLength(0);
});
