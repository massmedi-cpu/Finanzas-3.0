import { expect, test } from "@playwright/test";
import { runDocumentOcr, type DocumentOcrProvider } from "../../src/application/document-ocr-service";

const documentId = "93000000-0000-4000-8000-000000000093";

function provider(overrides: Partial<DocumentOcrProvider> = {}): DocumentOcrProvider {
  return {
    supports: () => true,
    extract: async () => ({
      source: "image_ocr",
      extractor: "fake-provider-v1",
      pages: [{
        pageNumber: 1,
        words: [
          { text: "TICKET", confidence: 0.96, box: { x: 0.08, y: 0.08, width: 0.2, height: 0.04 } },
          { text: "TOTAL", confidence: 0.98, box: { x: 0.58, y: 0.8, width: 0.13, height: 0.04 } },
          { text: "12,30", confidence: 0.99, box: { x: 0.82, y: 0.8, width: 0.12, height: 0.04 } },
        ],
      }],
    }),
    ...overrides,
  };
}

test("F11 application service keeps the OCR provider behind an isolated contract", async () => {
  let calls = 0;
  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/jpeg",
    originalFileName: "ticket.jpg",
    provider: provider({
      extract: async (input) => {
        calls += 1;
        expect(input.mimeType).toBe("image/jpeg");
        expect(input.originalFileName).toBe("ticket.jpg");
        return {
          source: "image_ocr",
          extractor: "fake-provider-v1",
          pages: [{ pageNumber: 1, words: [{ text: "TOTAL 12,30", confidence: 0.95, box: { x: 0.1, y: 0.8, width: 0.7, height: 0.05 } }] }],
        };
      },
    }),
    now: () => new Date("2026-09-07T06:30:00Z"),
  });

  expect(calls).toBe(1);
  expect(result.extractor).toBe("fake-provider-v1");
  expect(result.extractedAt).toBe("2026-09-07T06:30:00.000Z");
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
});

test("F11 application service rejects formats before invoking the provider", async () => {
  let called = false;
  await expect(runDocumentOcr({
    documentId,
    bytes: new Uint8Array([1]),
    mimeType: "application/octet-stream",
    originalFileName: "unsafe.bin",
    provider: provider({ extract: async () => { called = true; throw new Error("must_not_run"); } }),
  })).rejects.toThrow("unsupported_ocr_mime_type");
  expect(called).toBe(false);
});

test("F11 application service marks incomplete multi-page coverage for review", async () => {
  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array([1]),
    mimeType: "application/pdf",
    originalFileName: "factura.pdf",
    provider: provider({
      extract: async () => ({
        source: "pdf_text",
        extractor: "fake-pdf-v1",
        pages: [{ pageNumber: 2, words: [{ text: "PÁGINA DOS", confidence: 0.99, box: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 } }] }],
      }),
    }),
    now: () => new Date("2026-09-07T06:30:00Z"),
  });

  expect(result.status).toBe("needs_review");
  expect(result.warnings).toContain("incomplete_page_coverage");
});

test("F11 application service enforces the document size ceiling before extraction", async () => {
  await expect(runDocumentOcr({
    documentId,
    bytes: new Uint8Array(15 * 1024 * 1024 + 1),
    mimeType: "image/png",
    originalFileName: "too-large.png",
    provider: provider(),
  })).rejects.toThrow("invalid_ocr_file_size");
});
