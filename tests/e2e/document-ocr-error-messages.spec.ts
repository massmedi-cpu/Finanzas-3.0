import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { documentOcrErrorMessage, GENERIC_OCR_FAILURE } from "../../src/application/document-ocr-error-messages";

// REC-OCR-UX-030: error type must inform the next action without quoting private contents.
test("REC-OCR-UX-030 · OCR muestra diagnósticos concretos sin exponer errores arbitrarios", () => {
  const diagnosticCodes = [
    "InvalidPDFException",
    "PasswordException",
    "invalid_ocr_file_name",
    "invalid_ocr_document_id",
    "invalid_ocr_pages",
    "invalid_ocr_box",
    "invalid_ocr_file_size",
    "ocr_provider_unsupported_mime",
    "ocr_image_signature_mismatch",
    "ocr_source_mime_mismatch",
    "ocr_queue_timeout",
    "ocr_worker_timeout",
    "ocr_recognize_timeout",
    "google_drive_document_content_mismatch",
    "google_drive_document_id_invalid",
    "google_drive_document_source_changed",
    "google_drive_document_access_denied",
    "ocr_response_invalid",
  ];
  for (const code of diagnosticCodes) {
    const message = documentOcrErrorMessage(code);
    expect(message, code).not.toBe(GENERIC_OCR_FAILURE);
    expect(message, code).toMatch(/[.¿¡]/);
    expect(message, code).not.toContain(code);
  }
  expect(documentOcrErrorMessage("PasswordException")).toMatch(/contraseña/);
  expect(documentOcrErrorMessage("InvalidPDFException")).toMatch(/PDF/);
  expect(documentOcrErrorMessage("google_drive_document_content_mismatch")).toMatch(/no coincide/);
  const privateInput = "InvalidPDFException: Authorization Bearer secret IBAN ES7620770024003102575766";
  for (const input of [privateInput, "toString", "constructor", "__proto__", "unknown_internal_sql_message", null, 14, {}]) {
    const message = documentOcrErrorMessage(input);
    expect(message).toBe(GENERIC_OCR_FAILURE);
    expect(message).not.toContain("IBAN");
    expect(message).not.toContain("Bearer");
  }
  const client = readFileSync(join(process.cwd(), "app/documents/ocr-review-panel.tsx"), "utf8");
  expect(client).toContain("documentOcrErrorMessage(code)");
  expect(client).not.toMatch(/labels\[code\]/);
});


test("REC-OCR-UX-031 · el panel aclara PDF protegido y corrupto sin guardados involuntarios", async ({ page }) => {
  const id = "94000000-0000-4000-8000-000000000094";
  const document = {
    id, type: "invoice", notes: "", status: "pending_review",
    mimeType: "application/pdf", createdAt: "2026-09-17T06:00:00Z",
    updatedAt: "2026-09-17T06:00:00Z", sizeBytes: 4096,
    issuerName: null, totalCents: null, documentDate: null,
    storageProvider: "supabase", associationCount: 0,
    originalFileName: "factura-prueba.pdf", sourceModifiedAt: null,
    sourceDriveFileId: null,
  };
  const principles = {
    bankSource: "read_only", ocrEnabled: false, getHasSideEffects: false,
    suggestionsPersisted: false, associationsRequireConfirmation: true,
  };
  const requested: string[] = [];
  let runCount = 0;
  await page.route("**/api/documents*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    requested.push(method + " " + url.pathname);
    if (url.pathname === "/api/documents/ocr" && method === "POST") {
      runCount++;
      const code = runCount === 1 ? "PasswordException" : "InvalidPDFException";
      await route.fulfill({
        status: 422, contentType: "application/json",
        body: JSON.stringify({ error: "ocr_failed", code }),
      });
      return;
    }
    if (method !== "GET") {
      await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"unexpected_write"}' });
      return;
    }
    if (url.pathname === "/api/documents" && url.searchParams.get("id") === id) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ contractVersion: 1, document, associations: [], principles }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, items: [document], total: 1, limit: 50, offset: 0, principles }),
    });
  });

  await page.goto("/documents");
  await page.getByRole("button", { name: /factura-prueba.pdf/i }).click();
  const panel = page.getByTestId("ocr-review-panel");
  const analyze = panel.getByRole("button", { name: /Analizar documento|Analizando/ });
  await expect(analyze).toBeEnabled();
  await analyze.click();
  await expect(panel.getByRole("alert")).toContainText("PDF está protegido con contraseña");
  await expect(analyze).toBeEnabled();
  await analyze.click();
  await expect(panel.getByRole("alert")).toContainText("PDF está dañado");
  await expect(analyze).toBeEnabled();
  expect(runCount).toBe(2);
  expect(requested.filter((operation) => operation.startsWith("POST ")))
    .toEqual(["POST /api/documents/ocr", "POST /api/documents/ocr"]);
  expect(requested.some((operation) => operation.startsWith("PATCH ") || operation.startsWith("DELETE "))).toBe(false);
  await expect(panel.getByTestId("ocr-confirmation-form")).toHaveCount(0);
});
