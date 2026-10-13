import { expect, test } from "@playwright/test";

const id = "93000000-0000-4000-8000-000000000117";
const ocrRunId = "94000000-0000-4000-8000-000000000117";
const extractedAt = "2026-10-13T08:10:00.000Z";
const baseDocument = {
  id, type: "invoice", status: "pending_review", notes: "",
  originalFileName: "factura-revision-sincronizacion.pdf",
  mimeType: "application/pdf", sizeBytes: 1200, issuerName: "ANTES DEL OCR",
  documentDate: "2026-10-13", totalCents: 2000,
  createdAt: "2026-10-13T08:00:00Z",
  updatedAt: "2026-10-13T08:00:00Z",
  storageProvider: "supabase", associationCount: 0,
  sourceModifiedAt: null, sourceDriveFileId: null,
};
const principles = {
  bankSource: "read_only", getHasSideEffects: false,
  suggestionsPersisted: false, associationsRequireConfirmation: true,
};
const ocr = {
  contractVersion: 1, documentId: id, status: "needs_review",
  source: "pdf_text", extractor: "pdfjs", extractedAt,
  confidence: 0.97, plainText: "FACTURA DE PRUEBA\nTOTAL 20,00",
  pages: [{
    pageNumber: 1,
    plainText: "FACTURA DE PRUEBA\nTOTAL 20,00",
    layoutText: "FACTURA DE PRUEBA\nTOTAL 20,00",
    lines: [
      { id: "p1-l1", text: "FACTURA DE PRUEBA", confidence: 0.95, alignment: "left" },
      { id: "p1-l2", text: "TOTAL 20,00", confidence: 0.95, alignment: "right" },
    ],
  }],
  warnings: [],
  principles: { bankSource: "read_only", financialWrites: false, requiresHumanReview: true, preservesGeometry: true },
};

for (const staleAfterPatch of [true, false] as const) {
test(staleAfterPatch
  ? "REC-DOC-OCR-028 · successful OCR revision cannot claim archive sync while GET list remains stale"
  : "REC-DOC-OCR-029 · consistent independent detail and archive permit synchronized success",
async ({ page }) => {
  let savedDocument = { ...baseDocument };
  let staleList = false;
  let confirmations = 0;
  const writes: Array<{ url: string; method: string }> = [];

  await page.route(/\/api\/documents\/ocr(?:\?.*)?$/, async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ocr) });
  });
  await page.route(/\/api\/documents\/ocr-review(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          runs: [{ id: ocrRunId, extractor: ocr.extractor, extractedAt }],
          reviews: [],
        }),
      });
      return;
    }
    expect(route.request().method()).toBe("PATCH");
    confirmations += 1;
    const posted = route.request().postDataJSON();
    expect(posted.documentId).toBe(id);
    expect(posted.ocrRunId).toBe(ocrRunId);
    savedDocument = {
      ...baseDocument, issuerName: posted.issuerName,
      documentDate: posted.documentDate, totalCents: posted.totalCents,
      notes: posted.notes, type: posted.type,
      updatedAt: "2026-10-13T08:11:00Z",
    };
    staleList = staleAfterPatch;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 2, documentId: id, ocrRunId, revision: 1,
        rawEvidenceImmutable: true, bankSource: "read_only",
        financialWrites: false, requiresHumanReview: true,
        reviewedValues: { ...posted },
      }),
    });
  });
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") {
      writes.push({ url: url.pathname, method: request.method() });
      await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"unexpected_write"}' });
      return;
    }
    if (url.searchParams.get("id") === id) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ contractVersion: 1, document: savedDocument, associations: [], principles }),
      });
      return;
    }
    const params = url.searchParams;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        items: [staleList ? baseDocument : savedDocument],
        total: 1, limit: Number(params.get("limit") ?? "50"),
        offset: Number(params.get("offset") ?? "0"), principles,
      }),
    });
  });

  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-revision-sincronizacion\.pdf/i }).click();
  const panel = page.getByTestId("ocr-review-panel");
  await panel.getByRole("button", { name: "Analizar documento" }).click();
  const issuer = panel.getByRole("textbox", { name: "Emisor" });
  await expect(issuer).toBeEnabled();
  await issuer.fill("PROVEEDOR CONFIRMADO");
  const button = panel.getByRole("button", { name: "Confirmar revisión" });
  await expect(button).toBeEnabled();
  await button.click();

  await expect.poll(() => confirmations).toBe(1);
  if (staleAfterPatch) {
    await expect(panel.getByText(/La revisión se ha guardado, pero no se pudo actualizar el listado/)).toBeVisible();
    await expect(page.getByText("Revisión OCR confirmada y documento sincronizado.")).toHaveCount(0);
  } else {
    await expect(page.getByText("Revisión OCR confirmada y documento sincronizado.")).toBeVisible();
    await expect(panel.getByText(/La revisión se ha guardado, pero no se pudo actualizar el listado/)).toHaveCount(0);
  }
  await expect(panel.getByRole("button", { name: /Confirmado/ })).toBeVisible();
  expect(confirmations).toBe(1);
  expect(writes).toEqual([]);
  // A genuine independent readback exists, but the two HTTP 200 responses
  // disagree. The UI must not turn this into a false all-green status.
  expect(savedDocument.issuerName).toBe("PROVEEDOR CONFIRMADO");
});
}
