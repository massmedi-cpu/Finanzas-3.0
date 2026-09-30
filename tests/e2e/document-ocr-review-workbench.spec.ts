import { expect, test } from "@playwright/test";
import { DOCUMENT_OCR_REVIEW_CONFIDENCE, summarizeDocumentOcrPageReview } from "../../src/application/document-ocr-review";
import type { DocumentOcrResult } from "../../src/domain/document-ocr";

function pageFixture(overrides: Partial<DocumentOcrResult["pages"][number]> = {}): DocumentOcrResult["pages"][number] {
  return {
    pageNumber: 1,
    plainText: "ENERGY 1 1,80 1,80\nCUBATA",
    layoutText: "ENERGY        1     1,80     1,80\nCUBATA",
    reviewText: "ENERGY        1     1,80     1,80\nCUBATA        ?        ?        ?",
    confidence: 0.79,
    lines: [
      { id: "p1-l1", text: "ENERGY 1 1,80 1,80", confidence: 0.91, alignment: "left", words: [] },
      { id: "p1-l2", text: "CUBATA", confidence: DOCUMENT_OCR_REVIEW_CONFIDENCE - 0.01, alignment: "left", words: [] },
    ],
    words: [],
    transform: { scale: 1, offsetX: 0, offsetY: 0 },
    receiptIntegrity: {
      status: "partial",
      productRows: 1,
      candidateProductRows: 2,
      unresolvedProductRows: 1,
      arithmeticRowsChecked: 1,
      arithmeticRowsMatching: 1,
      lineTotalMatchesDocumentTotal: null,
      basePlusTaxMatchesTotal: null,
    },
    ...overrides,
  };
}

test("OCR review workbench surfaces unresolved rows and low-confidence evidence without inventing values", async () => {
  const summary = summarizeDocumentOcrPageReview(pageFixture());
  expect(summary.candidateProductRows).toBe(2);
  expect(summary.structuredProductRows).toBe(1);
  expect(summary.unresolvedProductRows).toBe(1);
  expect(summary.lowConfidenceLines).toHaveLength(1);
  expect(summary.lowConfidenceLines[0]?.text).toBe("CUBATA");
  expect(summary.requiresAttention).toBe(true);
});

test("OCR review workbench preserves a clean page as reviewable evidence rather than fabricating issues", async () => {
  const summary = summarizeDocumentOcrPageReview(pageFixture({
    lines: [{ id: "p1-l1", text: "ENERGY 1 1,80 1,80", confidence: 0.95, alignment: "left", words: [] }],
    receiptIntegrity: {
      status: "verified",
      productRows: 1,
      candidateProductRows: 1,
      unresolvedProductRows: 0,
      arithmeticRowsChecked: 1,
      arithmeticRowsMatching: 1,
      lineTotalMatchesDocumentTotal: true,
      basePlusTaxMatchesTotal: true,
    },
  }));
  expect(summary.lowConfidenceLines).toHaveLength(0);
  expect(summary.unresolvedProductRows).toBe(0);
  expect(summary.lineTotalMatchesDocumentTotal).toBe(true);
  expect(summary.basePlusTaxMatchesTotal).toBe(true);
  expect(summary.requiresAttention).toBe(false);
});
