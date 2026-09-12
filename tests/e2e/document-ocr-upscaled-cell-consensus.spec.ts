import { expect, test } from "@playwright/test";
import { cellUpscaleFactor } from "../../src/infrastructure/ocr/receipt-upscaled-cell-consensus-provider";
import { chooseRowCellConsensus } from "../../src/infrastructure/ocr/receipt-row-cell-consensus-provider";
import type { OcrWord } from "../../src/domain/document-ocr";

function word(text: string, confidence = 0.8): OcrWord {
  return { text, confidence, box: { x: 0.7, y: 0.4, width: 0.06, height: 0.02 } };
}

test("CR008-OCR-002 v7 enlarges the 36 px real-failure class before Tesseract", () => {
  expect(cellUpscaleFactor(36)).toBe(4);
  expect(36 * cellUpscaleFactor(36)).toBeGreaterThanOrEqual(144);
});

test("CR008-OCR-002 v7 clamps very small and already-large cells defensively", () => {
  expect(cellUpscaleFactor(20)).toBe(6);
  expect(cellUpscaleFactor(90)).toBe(2);
  expect(cellUpscaleFactor(180)).toBe(2);
});

test("CR008-OCR-002 v7 fails safe for invalid source heights", () => {
  expect(cellUpscaleFactor(0)).toBe(6);
  expect(cellUpscaleFactor(Number.NaN)).toBe(6);
  expect(cellUpscaleFactor(Number.POSITIVE_INFINITY)).toBe(6);
});

test("CR008-OCR-002 v7 keeps explicit-decimal consensus and never accepts bare digits", () => {
  expect(chooseRowCellConsensus([word("5,60"), word("5.60")], "money")?.text).toMatch(/^5[,.]60$/);
  expect(chooseRowCellConsensus([word("560", 0.99), word("560", 0.99)], "money")).toBeNull();
});