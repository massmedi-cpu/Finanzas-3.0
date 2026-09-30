import { expect, test } from "@playwright/test";
import { buildDocumentOcrResult, reconstructOcrPage, type OcrWord } from "../../src/domain/document-ocr";

function word(text: string, x: number, y: number, width = 0.08): OcrWord {
  return {
    text,
    confidence: 0.96,
    box: { x, y, width, height: 0.02 },
  };
}

function row(y: number, cells: Array<[string, number, number?]>) {
  return cells.map(([text, x, width]) => word(text, x, y, width));
}

test("CR-008 keeps a product with missing numeric cells as unresolved instead of reporting a false total mismatch", () => {
  const words: OcrWord[] = [
    ...row(0.10, [["DESCRIPCION", 0.08, 0.16], ["UDS", 0.52, 0.05], ["PRECIO", 0.68, 0.09], ["IMPORTE", 0.84, 0.10]]),
    ...row(0.16, [["PRODUCTO", 0.08, 0.12], ["UNO", 0.22, 0.06], ["1", 0.52, 0.02], ["1,80", 0.68, 0.06], ["1,80", 0.84, 0.06]]),
    ...row(0.22, [["PRODUCTO", 0.08, 0.12], ["DOS", 0.22, 0.06], ["1", 0.52, 0.02], ["2,80", 0.68, 0.06], ["2,80", 0.84, 0.06]]),
    ...row(0.28, [["PRODUCTO", 0.08, 0.12], ["TRES", 0.22, 0.07], ["2", 0.52, 0.02], ["2,80", 0.68, 0.06], ["5,60", 0.84, 0.06]]),
    ...row(0.34, [["PRODUCTO", 0.08, 0.12], ["CUATRO", 0.22, 0.09], ["E", 0.35, 0.02], ["|", 0.40, 0.01]]),
    ...row(0.40, [["PRODUCTO", 0.08, 0.12], ["CINCO", 0.22, 0.08], ["4", 0.38, 0.02], ["1", 0.52, 0.02], ["1,80", 0.68, 0.06], ["1,80", 0.84, 0.06]]),
    ...row(0.48, [["Base", 0.08, 0.06], ["15,91", 0.84, 0.07]]),
    ...row(0.53, [["IVA", 0.08, 0.05], ["1,59", 0.84, 0.06]]),
    ...row(0.58, [["Total", 0.08, 0.07], ["17,50", 0.84, 0.07]]),
  ];

  const page = reconstructOcrPage(1, words);

  expect(page.reviewText).toContain("PRODUCTO CUATRO");
  expect(page.reviewText).not.toContain("PRODUCTO CUATRO E");
  expect(page.reviewText).toContain("PRODUCTO CINCO");
  expect(page.reviewText).not.toContain("PRODUCTO CINCO 4");
  expect(page.receiptIntegrity).toEqual({
    status: "partial",
    productRows: 4,
    candidateProductRows: 5,
    unresolvedProductRows: 1,
    arithmeticRowsChecked: 4,
    arithmeticRowsMatching: 4,
    lineTotalMatchesDocumentTotal: null,
    basePlusTaxMatchesTotal: true,
  });

  const result = buildDocumentOcrResult({
    documentId: "11111111-1111-4111-8111-111111111111",
    source: "image_ocr",
    extractor: "regression-fixture",
    extractedAt: "2026-09-29T18:00:00.000Z",
    pages: [page],
  });

  expect(result.warnings).toContain("receipt_structure_incomplete");
  expect(result.warnings).not.toContain("receipt_arithmetic_mismatch");
  expect(result.principles).toMatchObject({
    bankSource: "read_only",
    financialWrites: false,
    requiresHumanReview: true,
  });
});
