import { expect, test, type Page } from "@playwright/test";

const documentId = "93000000-0000-4000-8000-000000000079";
const ocrRunId = "98000000-0000-4000-8000-000000000079";

const item = {
  id: documentId,
  type: "ticket",
  notes: "",
  status: "pending_review",
  mimeType: "image/jpeg",
  createdAt: "2026-10-05T07:00:00.000Z",
  sizeBytes: 245000,
  updatedAt: "2026-10-05T07:00:00.000Z",
  issuerName: null,
  totalCents: null,
  documentDate: null,
  storageProvider: "supabase",
  associationCount: 0,
  originalFileName: "ticket-revision.jpg",
  sourceModifiedAt: null,
  sourceDriveFileId: null,
};

const principles = {
  bankSource: "read_only",
  ocrEnabled: true,
  getHasSideEffects: false,
  suggestionsPersisted: false,
  associationsRequireConfirmation: true,
};

async function mockOcrReview(page: Page) {
  await page.route("**/api/documents/ocr-review*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        runs: [{ id: ocrRunId, extractor: "traceability-10.0.79", extractedAt: "2026-10-05T08:00:00.000Z" }],
        reviews: [],
      }),
    });
  });

  await page.route(/\/api\/documents\/ocr(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        documentId,
        status: "needs_review",
        source: "image_ocr",
        extractor: "traceability-10.0.79",
        extractedAt: "2026-10-05T08:00:00.000Z",
        confidence: 0.72,
        plainText: "BAR CENTRAL\nFecha: 03/10/2026\nTotal 17,50\n4",
        warnings: [],
        principles: {
          bankSource: "read_only",
          financialWrites: false,
          requiresHumanReview: true,
          preservesGeometry: true,
        },
        pages: [{
          pageNumber: 1,
          plainText: "BAR CENTRAL\nFecha: 03/10/2026\nTotal 17,50\n4",
          layoutText: "BAR CENTRAL\nFecha: 03/10/2026\n                              Total 17,50\n4",
          reviewText: "BAR CENTRAL\nFecha: 03/10/2026\nTotal: 17,50",
          lines: [
            { id: "p1-l1", text: "BAR CENTRAL", confidence: 0.72, box: { x: 0.1, y: 0.08, width: 0.25, height: 0.03 }, alignment: "left", words: [] },
            { id: "p1-l2", text: "Fecha: 03/10/2026", confidence: 0.72, box: { x: 0.1, y: 0.18, width: 0.32, height: 0.03 }, alignment: "left", words: [] },
            { id: "p1-l3", text: "Total 17,50", confidence: 0.72, box: { x: 0.62, y: 0.72, width: 0.25, height: 0.03 }, alignment: "right", words: [] },
            { id: "p1-l4", text: "4", confidence: 0.4, box: { x: 0.1, y: 0.82, width: 0.03, height: 0.03 }, alignment: "left", words: [] },
          ],
        }],
      }),
    });
  });

  await page.route("**/api/documents*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "not_expected" }) });
      return;
    }
    if (url.searchParams.get("mode") === "open") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ provider: "supabase", url: "https://example.test/original", expiresInSeconds: 300 }) });
      return;
    }
    if (url.searchParams.has("id")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ contractVersion: 1, document: item, associations: [], principles }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, items: [item], total: 1, limit: 50, offset: 0, principles }),
    });
  });
}

test.describe("Financial App 10.0.79 · revisión OCR trazable", () => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}: prioriza campos críticos y separa las tres capas de evidencia`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockOcrReview(page);
      await page.goto("/documents");
      await page.getByRole("button", { name: /ticket-revision.jpg/i }).click();
      const panel = page.getByTestId("ocr-review-panel");
      await panel.getByRole("button", { name: "Analizar documento" }).click();

      await expect(
        panel.getByText("Revisa primero comercio / emisor, fecha y total con el original", { exact: true }).last(),
      ).toBeVisible();
      await expect(panel.getByTestId("ocr-field-issuer")).toContainText("Dudoso");
      await expect(panel.getByTestId("ocr-field-date")).toContainText("Dudoso");
      await expect(panel.getByTestId("ocr-field-totalCents")).toContainText("Dudoso");
      await expect(panel.getByTestId("ocr-low-confidence-1")).toContainText("4");

      await panel.getByTestId("ocr-trace-1").getByText("Comparar trazabilidad OCR").click();
      await expect(panel.getByTestId("ocr-trace-structured-1")).toContainText("Texto estructurado para revisión");
      await expect(panel.getByTestId("ocr-trace-structured-1")).toContainText("Total: 17,50");
      await expect(panel.getByTestId("ocr-trace-layout-1")).toContainText("Reconstrucción geométrica");
      await expect(panel.getByTestId("ocr-trace-raw-1")).toContainText("OCR bruto");
      await expect(panel.getByTestId("ocr-trace-raw-1")).toContainText("4");

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }
});
