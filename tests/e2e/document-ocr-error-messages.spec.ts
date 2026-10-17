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
  expect(client).not.toMatch(/labels\\[code\\]/);
});
