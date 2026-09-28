import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDocumentOcrResult, reconstructOcrPage, type OcrPage } from "../../src/domain/document-ocr";

const documentId = "99000000-0000-4000-8000-000000000099";
const foundations = join(process.cwd(), "supabase/migrations/20260903200004_financial_app_foundations.sql");

function ocrResult(page: OcrPage) {
  return buildDocumentOcrResult({
    documentId,
    source: "image_ocr",
    extractor: "10.0.33-contract",
    extractedAt: "2026-09-28T20:00:00.000Z",
    pages: [page],
  });
}

test("10.0.33 permite documento sin movimiento y movimiento sin documento", () => {
  const sql = readFileSync(foundations, "utf8");
  const documents = sql.match(/create table financial_app\.documents \(([\s\S]*?)\n\);/i)?.[1] ?? "";
  const transactions = sql.match(/create table financial_app\.transactions \(([\s\S]*?)\n\);/i)?.[1] ?? "";
  const associations = sql.match(/create table financial_app\.document_transaction_associations \(([\s\S]*?)\n\);/i)?.[1] ?? "";

  expect(documents).toBeTruthy();
  expect(transactions).toBeTruthy();
  expect(associations).toBeTruthy();
  expect(documents).not.toMatch(/\btransaction_id\b/i);
  expect(transactions).not.toMatch(/\bdocument_id\b/i);
  expect(associations).toMatch(/document_id uuid not null references financial_app\.documents\(id\)/i);
  expect(associations).toMatch(/transaction_id uuid not null references financial_app\.transactions\(id\)/i);
});

test("10.0.33 OCR sin resultado queda vacío, revisable y sin escrituras financieras", () => {
  const result = ocrResult(reconstructOcrPage(1, []));

  expect(result.status).toBe("empty");
  expect(result.plainText).toBe("");
  expect(result.confidence).toBeNull();
  expect(result.warnings).toContain("no_text_detected");
  expect(result.principles.bankSource).toBe("read_only");
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
});

test("10.0.33 OCR erróneo fuerza revisión y no convierte contradicciones en certeza", () => {
  const page: OcrPage = {
    pageNumber: 1,
    plainText: "TOTAL 10,00",
    layoutText: "TOTAL 10,00",
    lines: [{
      id: "p1-l1",
      text: "TOTAL 10,00",
      confidence: 0.98,
      alignment: "right",
      box: { x: 0.6, y: 0.8, width: 0.3, height: 0.04 },
      words: [],
    }],
    receiptIntegrity: {
      status: "issues",
      productRows: 2,
      candidateProductRows: 2,
      unresolvedProductRows: 0,
      arithmeticRowsChecked: 2,
      arithmeticRowsMatching: 1,
      lineTotalMatchesDocumentTotal: true,
      basePlusTaxMatchesTotal: true,
    },
  };

  const result = ocrResult(page);
  expect(result.status).toBe("needs_review");
  expect(result.warnings).toContain("receipt_arithmetic_mismatch");
  expect(result.principles.financialWrites).toBe(false);
});

test("10.0.33 OCR parcialmente correcto conserva evidencia pero exige revisión", () => {
  const page: OcrPage = {
    pageNumber: 1,
    plainText: "ARTICULO A 1 2,00 2,00\nARTICULO B 1 3,00",
    layoutText: "ARTICULO A 1 2,00 2,00\nARTICULO B 1 3,00",
    lines: [{
      id: "p1-l1",
      text: "ARTICULO A 1 2,00 2,00",
      confidence: 0.94,
      alignment: "left",
      box: { x: 0.1, y: 0.3, width: 0.8, height: 0.04 },
      words: [],
    }],
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
  };

  const result = ocrResult(page);
  expect(result.status).toBe("needs_review");
  expect(result.plainText).toContain("ARTICULO A");
  expect(result.warnings).toContain("receipt_structure_incomplete");
  expect(result.principles.financialWrites).toBe(false);
});
