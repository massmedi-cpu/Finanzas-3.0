import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import {
  choosePaddedNumericConsensus,
  paddedCellDimensions,
  paddedExplicitNumericTokens,
  type PaddedRecognitionObservation,
} from "../../src/infrastructure/ocr/receipt-padded-cell-consensus-provider";

function observation(
  text: string,
  variant: 0 | 1,
  segmentation: "single_word" | "single_line" | "raw_line",
  confidence = 0.8,
): PaddedRecognitionObservation {
  const word: OcrWord = {
    text,
    confidence,
    box: { x: 0.7, y: 0.5, width: 0.05, height: 0.02 },
  };
  return { word, variant, segmentation };
}

test("CR008-OCR-002 v9 preserves aspect ratio and adds real white breathing room around a small cell", () => {
  const dimensions = paddedCellDimensions(72, 36);
  expect(dimensions.contentHeight).toBeGreaterThanOrEqual(240);
  expect(dimensions.contentWidth).toBeGreaterThanOrEqual(96);
  expect(dimensions.paddedHeight).toBe(dimensions.contentHeight + dimensions.verticalPadding * 2);
  expect(dimensions.paddedWidth).toBe(dimensions.contentWidth + dimensions.horizontalPadding * 2);
  expect(dimensions.horizontalPadding).toBeGreaterThanOrEqual(80);
  expect(dimensions.verticalPadding).toBeGreaterThanOrEqual(60);
});

test("CR008-OCR-002 v9 accepts only physically explicit decimal punctuation", () => {
  expect(paddedExplicitNumericTokens("5 , 60", "money")).toEqual(["5,60"]);
  expect(paddedExplicitNumericTokens("5.60", "money")).toEqual(["5.60"]);
  expect(paddedExplicitNumericTokens("560", "money")).toEqual([]);
  expect(paddedExplicitNumericTokens("2.800", "money")).toEqual([]);
});

test("CR008-OCR-002 v9 requires independent preprocessing agreement for normal cell recovery", () => {
  const recovered = choosePaddedNumericConsensus([
    observation("5,60", 0, "single_word", 0.72),
    observation("5,60", 1, "single_line", 0.66),
  ], "money");
  expect(recovered?.text).toBe("5,60");

  expect(choosePaddedNumericConsensus([
    observation("5,60", 0, "single_word", 0.9),
  ], "money")).toBeNull();
});

test("CR008-OCR-002 v9 may accept three independent segmentation reads only when confidence is strong", () => {
  const recovered = choosePaddedNumericConsensus([
    observation("17,50", 0, "single_word", 0.72),
    observation("17,50", 0, "single_line", 0.68),
    observation("17,50", 0, "raw_line", 0.7),
  ], "money");
  expect(recovered?.text).toBe("17,50");

  expect(choosePaddedNumericConsensus([
    observation("17,50", 0, "single_word", 0.25),
    observation("17,50", 0, "single_line", 0.3),
    observation("17,50", 0, "raw_line", 0.28),
  ], "money")).toBeNull();
});

test("CR008-OCR-002 v9 refuses conflicting explicit-money consensus", () => {
  const recovered = choosePaddedNumericConsensus([
    observation("5,60", 0, "single_word"),
    observation("5,60", 1, "single_line"),
    observation("5,00", 0, "single_line"),
    observation("5,00", 1, "raw_line"),
  ], "money");
  expect(recovered).toBeNull();
});
