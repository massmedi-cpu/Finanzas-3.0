import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import {
  chooseColumnSweepCandidate,
  mergeColumnSweepCell,
  selectReceiptRowsForColumnSweep,
} from "../../src/infrastructure/ocr/receipt-column-sweep-provider";

function word(
  text: string,
  x: number,
  y: number,
  width = 0.055,
  confidence = 0.8,
): OcrWord {
  return { text, confidence, box: { x, y, width, height: 0.02 } };
}

const amountBand = { left: 0.69, right: 0.80, center: 0.745, support: 4 };

test("CR008-OCR-002 v5 includes a text-only product row after the numeric header", () => {
  const words = [
    word("DESCRIPCION", 0.10, 0.30, 0.16),
    word("UDS", 0.48, 0.30, 0.05),
    word("PRECIO", 0.59, 0.30, 0.08),
    word("IMPORTE", 0.72, 0.30, 0.09),
    word("ENERGY", 0.10, 0.36, 0.10),
    word("1", 0.49, 0.36, 0.02),
    word("1,80", 0.59, 0.36, 0.06),
    word("1,80", 0.72, 0.36, 0.06),
    word("TERCIO", 0.10, 0.41, 0.08),
    word("GALICIA", 0.20, 0.41, 0.09),
    word("CERO", 0.31, 0.41, 0.06),
    word("Base:", 0.42, 0.60, 0.08),
    word("15,91", 0.72, 0.60, 0.06),
  ];

  const rows = selectReceiptRowsForColumnSweep(words);
  expect(rows.some((row) => row.text.includes("TERCIO GALICIA CERO"))).toBeTruthy();
});

test("CR008-OCR-002 v5 replaces a plausible but wrong amount only when both physical sweeps agree", () => {
  const existing = [word("5,00", 0.72, 0.42, 0.06, 0.91)];
  const observations = [
    word("5,60", 0.72, 0.42, 0.06, 0.72),
    word("5.60", 0.72, 0.42, 0.06, 0.66),
  ];

  const candidate = chooseColumnSweepCandidate(existing, observations, "money");
  expect(candidate?.text).toMatch(/^5[,.]60$/);
});

test("CR008-OCR-002 v5 keeps an existing amount when the two sweep modes disagree", () => {
  const existing = [word("5,00", 0.72, 0.42, 0.06, 0.91)];
  const observations = [
    word("5,60", 0.72, 0.42, 0.06, 0.72),
    word("5,80", 0.72, 0.42, 0.06, 0.74),
  ];

  expect(chooseColumnSweepCandidate(existing, observations, "money")).toBeNull();
});

test("CR008-OCR-002 v5 can add a missing amount from two agreeing column sweeps", () => {
  const observations = [
    word("3,60", 0.72, 0.47, 0.06, 0.52),
    word("3.60", 0.72, 0.47, 0.06, 0.48),
  ];

  const candidate = chooseColumnSweepCandidate([], observations, "money");
  expect(candidate?.text).toMatch(/^3[,.]60$/);
});

test("CR008-OCR-002 v5 refuses a weak single-pass invention", () => {
  const observations = [word("17,50", 0.72, 0.67, 0.06, 0.41)];
  expect(chooseColumnSweepCandidate([], observations, "money")).toBeNull();
});

test("CR008-OCR-002 v5 merges the consensus amount without deleting another numeric column", () => {
  const base = [
    word("CAÑA", 0.11, 0.42, 0.07, 0.75),
    word("2", 0.48, 0.42, 0.02, 0.88),
    word("2,80", 0.59, 0.42, 0.06, 0.91),
    word("5,00", 0.72, 0.42, 0.06, 0.91),
  ];
  const row = {
    words: base,
    box: { x: 0.11, y: 0.42, width: 0.67, height: 0.02 },
    text: "CAÑA 2 2,80 5,00",
    summaryLike: false,
  };
  const recovered = word("5,60", 0.72, 0.42, 0.06, 0.7);

  const merged = mergeColumnSweepCell(base, row, amountBand, recovered);
  const text = merged.map((item) => item.text).join(" ");
  expect(text).toContain("2,80");
  expect(text).toContain("5,60");
  expect(text).not.toContain("5,00");
});
