import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import {
  mergeColumnSweepCell,
  type SweepRow,
} from "../../src/infrastructure/ocr/receipt-column-sweep-provider";
import {
  choosePaddedNumericConsensus,
  finalizeReceiptTableWords,
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


test("CR008-OCR-002 final structural guard removes the real replay residue without inventing values", () => {
  const box = (x: number, y: number, width = 0.05, height = 0.018) => ({ x, y, width, height });
  const w = (text: string, x: number, y: number, width = 0.05, confidence = 0.82): OcrWord => ({
    text, confidence, box: box(x, y, width),
  });
  const unit = { left: 0.54, right: 0.60, center: 0.57, support: 5 };
  const price = { left: 0.65, right: 0.74, center: 0.695, support: 5 };
  const amount = { left: 0.78, right: 0.87, center: 0.825, support: 5 };
  const bands = [unit, price, amount];

  const words: OcrWord[] = [
    w("ENERGY", 0.16, 0.44, 0.09), w("1", 0.56, 0.44, 0.018), w("1,80", 0.67, 0.44), w("1,80", 0.80, 0.44),
    w("TERCIO", 0.16, 0.48, 0.08), w("GALICIA", 0.25, 0.48, 0.09), w("CERO", 0.35, 0.48, 0.06),
    w("1", 0.56, 0.48, 0.018), w("2,80", 0.67, 0.48), w("2,80", 0.80, 0.48),
    w("CANA", 0.16, 0.52, 0.06), w("GRANDE", 0.23, 0.52, 0.09), w("2", 0.56, 0.52, 0.018),
    w("2.80", 0.67, 0.52), w("5,60", 0.80, 0.52),
    w("CUBATA", 0.16, 0.56, 0.09), w("E", 0.43, 0.56, 0.015, 0.91), w("I", 0.555, 0.56, 0.012, 0.34), w("1", 0.57, 0.56, 0.018),
    w("5,50", 0.67, 0.56), w("5,508", 0.795, 0.56, 0.065, 0.72), w("5,50", 0.81, 0.56),
    w("AGUA", 0.16, 0.60, 0.06), w("CON", 0.23, 0.60, 0.05), w("GAS", 0.29, 0.60, 0.05),
    w("1", 0.56, 0.60, 0.018), w("4", 0.62, 0.60, 0.018, 0.31), w("1,80", 0.67, 0.60), w("1,80", 0.80, 0.60),
    w("eco", 0.25, 0.65, 0.04, 0.42),
    w("0", 0.56, 0.68, 0.018, 0.28),
    w("Base", 0.64, 0.73, 0.05), w("15.91", 0.80, 0.73),
    w("4", 0.30, 0.77, 0.018, 0.41), w("IVA", 0.64, 0.77, 0.04), w("1,59", 0.80, 0.77),
    w("Total", 0.64, 0.81, 0.06), w("17,50", 0.80, 0.81),
    w("4", 0.20, 0.86, 0.018, 0.25),
    w("4", 0.18, 0.90, 0.018, 0.22),
  ];

  const row = (y: number, text: string, summaryLike = false): SweepRow => ({
    words: words.filter((item) => Math.abs(item.box.y - y) < 0.0001),
    box: { x: 0.14, y, width: 0.74, height: 0.02 },
    text,
    summaryLike,
  });
  const rows: SweepRow[] = [
    row(0.44, "ENERGY 1 1,80 1,80"),
    row(0.48, "TERCIO GALICIA CERO 1 2,80 2,80"),
    row(0.52, "CANA GRANDE 2 2,80 5,60"),
    row(0.56, "CUBATA E I 1 5,50 5,508 5,50"),
    row(0.60, "AGUA CON GAS 1 4 1,80 1,80"),
    row(0.65, "eco"),
    row(0.68, "0"),
    row(0.73, "Base 15,91", true),
    row(0.77, "4 IVA 1,59", true),
    row(0.81, "Total 17,50", true),
  ];

  const cleaned = finalizeReceiptTableWords(words, rows, bands);
  const text = cleaned.map((item) => item.text);

  for (const expected of ["ENERGY", "TERCIO", "GALICIA", "CERO", "CANA", "GRANDE", "CUBATA", "AGUA", "CON", "GAS",
    "1,80", "2,80", "5,60", "5,50", "15,91", "1,59", "17,50", "Base", "IVA", "Total"]) {
    expect(text).toContain(expected);
  }
  for (const rejected of ["E", "I", "5,508", "eco", "0"]) {
    expect(text).not.toContain(rejected);
  }
  expect(cleaned.filter((item) => item.text === "4")).toHaveLength(0);
  expect(text).toContain("2,80");
  expect(text).toContain("15,91");
  expect(text).not.toContain("2.80");
  expect(text).not.toContain("15.91");
});

test("CR008-OCR-002 keeps a high-confidence first pass only until two isolated variants agree on a one-character repair", () => {
  const base: OcrWord[] = [
    { text: "CUEATA", confidence: 0.94, box: { x: 0.16, y: 0.56, width: 0.09, height: 0.018 } },
  ];
  const isolated0: OcrWord[] = [
    { text: "CUBATA", confidence: 0.71, box: { x: 0.16, y: 0.56, width: 0.09, height: 0.018 } },
  ];
  const isolated1: OcrWord[] = [
    { text: "CUBATA", confidence: 0.69, box: { x: 0.16, y: 0.56, width: 0.09, height: 0.018 } },
  ];

  expect(mergeDescriptionObservations(base, [isolated0, isolated1], 0.54).map((item) => item.text))
    .toEqual(["CUBATA"]);
});


test("CR008-OCR-002 restores Spanish diacritics only when both isolated reads agree", () => {
  const base: OcrWord[] = [
    { text: "CANA", confidence: 0.93, box: { x: 0.16, y: 0.52, width: 0.07, height: 0.018 } },
  ];
  const accented0: OcrWord[] = [
    { text: "CAÑA", confidence: 0.72, box: { x: 0.16, y: 0.52, width: 0.07, height: 0.018 } },
  ];
  const accented1: OcrWord[] = [
    { text: "CAÑA", confidence: 0.69, box: { x: 0.16, y: 0.52, width: 0.07, height: 0.018 } },
  ];
  expect(mergeDescriptionObservations(base, [accented0, accented1], 0.54).map((item) => item.text))
    .toEqual(["CAÑA"]);

  const alreadyAccented: OcrWord[] = [
    { text: "CAÑA", confidence: 0.9, box: { x: 0.16, y: 0.52, width: 0.07, height: 0.018 } },
  ];
  const plain0: OcrWord[] = [
    { text: "CANA", confidence: 0.75, box: { x: 0.16, y: 0.52, width: 0.07, height: 0.018 } },
  ];
  const plain1: OcrWord[] = [
    { text: "CANA", confidence: 0.76, box: { x: 0.16, y: 0.52, width: 0.07, height: 0.018 } },
  ];
  expect(mergeDescriptionObservations(alreadyAccented, [plain0, plain1], 0.54).map((item) => item.text))
    .toEqual(["CAÑA"]);
});


test("CR008-OCR-002 preserves an explicit VAT percentage while cleaning a summary row", () => {
  const word = (text: string, x: number, width = 0.04, confidence = 0.8): OcrWord => ({
    text,
    confidence,
    box: { x, y: 0.72, width, height: 0.018 },
  });
  const words: OcrWord[] = [
    word("IVA", 0.56, 0.04),
    word("10", 0.64, 0.025),
    word("%", 0.671, 0.012),
    word("1,59", 0.80, 0.05),
  ];
  const row: SweepRow = {
    words,
    box: { x: 0.54, y: 0.72, width: 0.33, height: 0.02 },
    text: "IVA 10 % 1,59",
    summaryLike: true,
  };
  const bands = [
    { left: 0.54, right: 0.60, center: 0.57, support: 5 },
    { left: 0.65, right: 0.74, center: 0.695, support: 5 },
    { left: 0.78, right: 0.87, center: 0.825, support: 5 },
  ];

  expect(finalizeReceiptTableWords(words, [row], bands).map((item) => item.text))
    .toEqual(["IVA", "10", "%", "1,59"]);
});
