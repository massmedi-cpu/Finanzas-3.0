import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import {
  chooseRowCellConsensus,
  productRowArithmeticMismatch,
} from "../../src/infrastructure/ocr/receipt-row-cell-consensus-provider";

function word(text: string, confidence = 0.8): OcrWord {
  return { text, confidence, box: { x: 0.7, y: 0.4, width: 0.06, height: 0.02 } };
}

test("CR008-OCR-002 v6 flags a visible arithmetic mismatch only as a reason to reread", () => {
  expect(productRowArithmeticMismatch("2", "2,80", "5,00")).toBeTruthy();
  expect(productRowArithmeticMismatch("2", "2,80", "5,60")).toBeFalsy();
});

test("CR008-OCR-002 v6 never derives a decimal amount from arithmetic", () => {
  expect(productRowArithmeticMismatch("1", "1,00", "1,80")).toBeTruthy();
  expect(chooseRowCellConsensus([word("100", 0.99), word("100", 0.99)], "money")).toBeNull();
});

test("CR008-OCR-002 v6 accepts only two explicit agreeing physical rereads", () => {
  const candidate = chooseRowCellConsensus([
    word("5,60", 0.66),
    word("5.60", 0.58),
  ], "money");
  expect(candidate?.text).toMatch(/^5[,.]60$/);
});

test("CR008-OCR-002 v6 rejects a single strong reread", () => {
  expect(chooseRowCellConsensus([word("15,91", 0.97)], "money")).toBeNull();
});

test("CR008-OCR-002 v6 rejects two physical rereads when they disagree", () => {
  expect(chooseRowCellConsensus([
    word("5,60", 0.84),
    word("5,80", 0.88),
  ], "money")).toBeNull();
});
