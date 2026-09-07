import { expect, test } from "@playwright/test";

const documentId = "93000000-0000-4000-8000-000000000093";
const driveFileId = "1AbCdEfGhIjKlMnOpQrStUvWxYz_123456";

const document = {
  id: documentId,
  type: "invoice",
  notes: "",
  status: "pending_review",
  mimeType: "application/pdf",
  createdAt: "2026-09-07T07:00:00Z",
  sizeBytes: 3210,
  updatedAt: "2026-09-07T07:00:00Z",
  issuerName: null,
  totalCents: null,
  documentDate: null,
  storageProvider: "google_drive",
  associationCount: 0,
  originalFileName: "factura-drive.pdf",
  sourceModifiedAt: "2026-09-07T06:55:00Z",
  sourceDriveFileId: driveFileId,
};

const principles = {
  bankSource: "read_only",
  ocrEnabled: false,
  getHasSideEffects: false,
  suggestionsPersisted: false,
  associationsRequireConfirmation: true,
};

test("Documentos keeps Drive OCR manual, fail-closed and write-free when reader permission is missing", async ({ page }) => {
  const ocrReads: string[] = [];
  const writes: Array<{ method: string; body: string | null }> = [];

  await page.route("**/api/documents/ocr*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    ocrReads.push(url.searchParams.get("id") ?? "");
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "ocr_failed", code: "google_drive_document_access_denied" }),
    });
  });

  await page.route("**/api/documents*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") {
      writes.push({ method: request.method(), body: request.postData() });
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "unexpected_write" }) });
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
  await expect(page.getByText("factura-drive.pdf").first()).toBeVisible();
  await page.getByRole("button", { name: /factura-drive.pdf/i }).click();

  await expect(page.getByText(/Financial App Reader con permiso de solo lectura/)).toBeVisible();
  const analyze = page.getByRole("button", { name: "Analizar con OCR" });
  await expect(analyze).toBeEnabled();
  expect(ocrReads).toHaveLength(0);
  expect(writes).toHaveLength(0);

  await analyze.click();
  await expect.poll(() => ocrReads.length).toBe(1);
  await expect(page.getByRole("alert")).toContainText("todavía no tiene acceso de lectura al archivo original");
  expect(ocrReads).toEqual([documentId]);
  expect(writes).toHaveLength(0);
});
