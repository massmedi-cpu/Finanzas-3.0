import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import {
  mergeColumnSweepCell,
  type SweepRow,
} from "../../src/infrastructure/ocr/receipt-column-sweep-provider";
import {
  choosePaddedNumericConsensus,
  mergeDescriptionObservations,
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

test("CR008-OCR-002 v22 preserves aspect ratio without magnifying a small cell into a text block", () => {
  const dimensions = paddedCellDimensions(72, 36);
  expect(dimensions.contentHeight).toBeGreaterThanOrEqual(36);
  expect(dimensions.contentHeight).toBeLessThanOrEqual(108);
  expect(dimensions.contentWidth / dimensions.contentHeight).toBeCloseTo(2, 1);
  expect(dimensions.paddedHeight).toBe(dimensions.contentHeight + dimensions.verticalPadding * 2);
  expect(dimensions.paddedWidth).toBe(dimensions.contentWidth + dimensions.horizontalPadding * 2);
  expect(dimensions.horizontalPadding).toBeGreaterThanOrEqual(4);
  expect(dimensions.verticalPadding).toBeGreaterThanOrEqual(4);
});

test("low-confidence repetition cannot outvote two clear readings of a different amount", () => {
  expect(choosePaddedNumericConsensus([
    observation("18,91", 0, "single_word", 0.3),
    observation("18,91", 1, "single_word", 0.2),
    observation("18,91", 0, "raw_line", 0.3),
    observation("18,91", 1, "raw_line", 0.2),
    observation("15,91", 0, "single_line", 0.87),
    observation("15,91", 1, "single_line", 0.92),
  ], "money")?.text).toBe("15,91");
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


test("CR008-OCR-002 removes malformed numeric and glyph noise that overlaps a recovered cell", () => {
  const row: SweepRow = {
    words: [],
    box: { x: 0.1, y: 0.5, width: 0.8, height: 0.03 },
    text: "CUBATA 1 5,50 5,508 ]",
    summaryLike: false,
  };
  const band = { left: 0.8, right: 0.86, center: 0.83, support: 5 };
  const words: OcrWord[] = [
    { text: "CUBATA", confidence: 0.85, box: { x: 0.12, y: 0.5, width: 0.1, height: 0.02 } },
    // Centre is just outside the band, but the malformed value physically overlaps it.
    { text: "5,508", confidence: 0.76, box: { x: 0.75, y: 0.5, width: 0.08, height: 0.02 } },
    { text: "]", confidence: 0.31, box: { x: 0.825, y: 0.5, width: 0.01, height: 0.02 } },
  ];
  const recovered: OcrWord = {
    text: "5,50",
    confidence: 0.88,
    box: { x: 0.81, y: 0.5, width: 0.04, height: 0.02 },
  };

  const merged = mergeColumnSweepCell(words, row, band, recovered);
  expect(merged.map((word) => word.text)).toContain("CUBATA");
  expect(merged.map((word) => word.text)).toContain("5,50");
  expect(merged.map((word) => word.text)).not.toContain("5,508");
  expect(merged.map((word) => word.text)).not.toContain("]");
});

test("CR008-OCR-002 lets two independent normalized reads fix one-character description substitutions", () => {
  const base: OcrWord[] = [
    { text: "CUEATA", confidence: 0.91, box: { x: 0.12, y: 0.5, width: 0.09, height: 0.02 } },
  ];
  const variant0: OcrWord[] = [
    { text: "CUBATA", confidence: 0.68, box: { x: 0.12, y: 0.5, width: 0.09, height: 0.02 } },
  ];
  const variant1: OcrWord[] = [
    { text: "CUBATA", confidence: 0.66, box: { x: 0.12, y: 0.5, width: 0.09, height: 0.02 } },
  ];

  const corrected = mergeDescriptionObservations(base, [variant0, variant1], 0.5);
  expect(corrected.map((word) => word.text)).toEqual(["CUBATA"]);

  const unrelated0: OcrWord[] = [
    { text: "COCA", confidence: 0.7, box: { x: 0.12, y: 0.5, width: 0.09, height: 0.02 } },
  ];
  const unrelated1: OcrWord[] = [
    { text: "COCA", confidence: 0.7, box: { x: 0.12, y: 0.5, width: 0.09, height: 0.02 } },
  ];
  const guarded = mergeDescriptionObservations(base, [unrelated0, unrelated1], 0.5);
  expect(guarded.map((word) => word.text)).toEqual(["CUEATA"]);
});
