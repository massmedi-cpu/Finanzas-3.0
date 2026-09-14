import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import type { SweepRow } from "../../src/infrastructure/ocr/receipt-column-sweep-provider";
import {
  choosePaddedNumericConsensus,
  paddedCellDimensions,
  paddedExplicitNumericTokens,
  paddedFocusedCellRectangle,
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

test("CR008-OCR-002 v12 preserves aspect ratio and adds real white breathing room around a small cell", () => {
  const dimensions = paddedCellDimensions(72, 36);
  expect(dimensions.contentHeight).toBeGreaterThanOrEqual(280);
  expect(dimensions.contentWidth).toBeGreaterThanOrEqual(96);
  expect(dimensions.paddedHeight).toBe(dimensions.contentHeight + dimensions.verticalPadding * 2);
  expect(dimensions.paddedWidth).toBe(dimensions.contentWidth + dimensions.horizontalPadding * 2);
  expect(dimensions.horizontalPadding).toBeGreaterThanOrEqual(80);
  expect(dimensions.verticalPadding).toBeGreaterThanOrEqual(60);
});

test("CR008-OCR-002 v12 gives money punctuation breathing room without crossing into a neighbouring numeric column", () => {
  const metadata = { mimeType: "image/jpeg" as const, width: 1600, height: 1800 };
  const row: SweepRow = {
    words: [],
    box: { x: 0.12, y: 0.48, width: 0.72, height: 0.02 },
    text: "CANA GRANDE 2 2,80 560",
    summaryLike: false,
  };
  const band = { left: 0.68, right: 0.76, center: 0.72, support: 5 };
  const money = paddedFocusedCellRectangle(metadata, row, band, "money", 0);
  const integer = paddedFocusedCellRectangle(metadata, row, band, "integer", 0);
  const bandLeft = Math.floor(band.left * metadata.width);
  const bandRight = Math.ceil(band.right * metadata.width);

  expect(money.width).toBeGreaterThan(integer.width);
  expect(money.left).toBeLessThan(integer.left);
  expect(money.left).toBeGreaterThanOrEqual(bandLeft);
  expect(money.left + money.width).toBeLessThanOrEqual(bandRight);
});

test("CR008-OCR-002 v12 accepts only physically explicit decimal punctuation", () => {
  expect(paddedExplicitNumericTokens("5 , 60", "money")).toEqual(["5,60"]);
  expect(paddedExplicitNumericTokens("5.60", "money")).toEqual(["5.60"]);
  expect(paddedExplicitNumericTokens("560", "money")).toEqual([]);
  expect(paddedExplicitNumericTokens("2.800", "money")).toEqual([]);
});

test("CR008-OCR-002 v12 requires independent preprocessing agreement for normal cell recovery", () => {
  const recovered = choosePaddedNumericConsensus([
    observation("5,60", 0, "single_word", 0.72),
    observation("5,60", 1, "single_line", 0.66),
  ], "money");
  expect(recovered?.text).toBe("5,60");

  expect(choosePaddedNumericConsensus([
    observation("5,60", 0, "single_word", 0.9),
  ], "money")).toBeNull();
});

test("CR008-OCR-002 v12 may accept three independent segmentation reads only when confidence is strong", () => {
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

test("CR008-OCR-002 v12 refuses conflicting explicit-money consensus", () => {
  const recovered = choosePaddedNumericConsensus([
    observation("5,60", 0, "single_word"),
    observation("5,60", 1, "single_line"),
    observation("5,00", 0, "single_line"),
    observation("5,00", 1, "raw_line"),
  ], "money");
  expect(recovered).toBeNull();
});
