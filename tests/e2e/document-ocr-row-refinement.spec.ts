import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import {
  deriveNumericColumnBands,
  mergeRefinedNumericRow,
  mergeRefinedTextRow,
  selectRowsForRefinement,
} from "../../src/infrastructure/ocr/receipt-row-refining-provider";

function word(text: string, x: number, y: number, width = 0.055, confidence = 0.62): OcrWord {
  return { text, confidence, box: { x, y, width, height: 0.025 } };
}

function row(words: OcrWord[], summaryLike = false): Parameters<typeof mergeRefinedNumericRow>[1] {
  const left = Math.min(...words.map((item) => item.box.x));
  const top = Math.min(...words.map((item) => item.box.y));
  const right = Math.max(...words.map((item) => item.box.x + item.box.width));
  const bottom = Math.max(...words.map((item) => item.box.y + item.box.height));
  return {
    words,
    box: { x: left, y: top, width: right - left, height: bottom - top },
    text: words.map((item) => item.text).join(" "),
    shouldRefine: true,
    summaryLike,
  };
}

test("CR008-OCR-002 row refinement replaces malformed receipt amounts only with visible two-decimal OCR", () => {
  const base = [
    word("CAÑA", 0.12, 0.42, 0.07, 0.7),
    word("GRANDE", 0.20, 0.42, 0.09, 0.72),
    word("2", 0.48, 0.42, 0.02, 0.82),
    word("2.800", 0.59, 0.42, 0.07, 0.34),
    word("560", 0.73, 0.42, 0.05, 0.28),
  ];
  const targetRow = row(base);
  const refined = [
    word("2", 0.48, 0.42, 0.02, 0.93),
    word("2,80", 0.59, 0.42, 0.06, 0.91),
    word("5,60", 0.73, 0.42, 0.06, 0.92),
  ];

  const merged = mergeRefinedNumericRow(base, targetRow, refined, 0.45);
  const text = merged.map((item) => item.text).join(" ");
  expect(text).toContain("CAÑA");
  expect(text).toContain("GRANDE");
  expect(text).toContain("2,80");
  expect(text).toContain("5,60");
  expect(text).not.toContain("2.800");
  expect(text).not.toMatch(/\b560\b/);
});

test("CR008-OCR-002 row refinement recovers explicitly split decimal tokens without inventing punctuation", () => {
  const base = [
    word("CAÑA", 0.12, 0.42, 0.07, 0.7),
    word("GRANDE", 0.20, 0.42, 0.09, 0.72),
    word("2", 0.48, 0.42, 0.02, 0.82),
    word("2.800", 0.59, 0.42, 0.07, 0.34),
    word("560", 0.73, 0.42, 0.05, 0.28),
  ];
  const targetRow = row(base);
  const refined = [
    word("2", 0.48, 0.42, 0.02, 0.93),
    word(",", 0.501, 0.42, 0.009, 0.9),
    word("80", 0.511, 0.42, 0.03, 0.92),
    word("5,", 0.69, 0.42, 0.035, 0.91),
    word("60", 0.727, 0.42, 0.03, 0.92),
  ];

  const merged = mergeRefinedNumericRow(base, targetRow, refined, 0.45);
  const text = merged.map((item) => item.text).join(" ");
  expect(text).toContain("2,80");
  expect(text).toContain("5,60");
  expect(text).not.toContain("2.800");
  expect(text).not.toMatch(/\b560\b/);
});

test("CR008-OCR-002 row refinement can recover a missing summary amount without inventing it", () => {
  const base = [
    word("Total:", 0.18, 0.67, 0.08, 0.78),
    word("1", 0.68, 0.67, 0.02, 0.2),
  ];
  const targetRow = row(base, true);
  const refined = [word("17,50", 0.69, 0.67, 0.07, 0.94)];

  const merged = mergeRefinedNumericRow(base, targetRow, refined, 0.45);
  expect(merged.map((item) => item.text).join(" ")).toContain("17,50");
});

test("CR008-OCR-002 row refinement replaces a damaged product description only when the isolated row is better", () => {
  const base = [
    word("AGUA", 0.11, 0.51, 0.06, 0.68),
    word("o", 0.18, 0.51, 0.025, 0.22),
    word("SCON", 0.21, 0.51, 0.06, 0.25),
    word("fas", 0.28, 0.51, 0.04, 0.2),
    word("eco", 0.33, 0.51, 0.04, 0.18),
    word("1", 0.48, 0.51, 0.02, 0.8),
    word("1,80", 0.59, 0.51, 0.06, 0.82),
    word("1,80", 0.73, 0.51, 0.06, 0.83),
  ];
  const targetRow = row(base);
  const refined = [
    word("AGUA", 0.11, 0.51, 0.06, 0.94),
    word("CON", 0.18, 0.51, 0.05, 0.95),
    word("GAS", 0.24, 0.51, 0.05, 0.94),
  ];

  const merged = mergeRefinedTextRow(base, targetRow, refined, 0.45);
  const text = merged.map((item) => item.text).join(" ");
  expect(text).toContain("AGUA CON GAS");
  expect(text).not.toContain("SCON");
  expect(text).not.toContain("fas");
  expect(text).not.toContain("eco");
});

test("CR008-OCR-002 prioritizes product and summary rows over noisy header identifiers", () => {
  const words: OcrWord[] = [];
  for (let index = 0; index < 14; index += 1) {
    const y = 0.05 + index * 0.018;
    words.push(
      word("REF", 0.10, y, 0.06, 0.72),
      word(String(1200 + index), 0.68, y, 0.06, 0.3),
    );
  }

  const products = ["ENERGY", "TERCIO", "CANA", "CUBATA", "AGUA"];
  for (let index = 0; index < products.length; index += 1) {
    const y = 0.42 + index * 0.045;
    words.push(
      word(products[index], 0.10, y, 0.10, 0.78),
      word("1", 0.48, y, 0.02, 0.82),
      word("2.800", 0.59, y, 0.07, 0.34),
      word("560", 0.73, y, 0.05, 0.28),
    );
  }
  words.push(word("Total:", 0.16, 0.70, 0.08, 0.82), word("1", 0.72, 0.70, 0.02, 0.2));

  const selected = selectRowsForRefinement(words).map((item) => item.text);
  for (const product of products) expect(selected.some((text) => text.includes(product))).toBeTruthy();
  expect(selected.some((text) => /Total:/i.test(text))).toBeTruthy();
  expect(selected.filter((text) => text.includes("REF")).length).toBeLessThan(12);
});

test("CR008-OCR-002 derives stable UDS, price and amount bands from repeated receipt geometry", () => {
  const words: OcrWord[] = [];
  for (let index = 0; index < 5; index += 1) {
    const y = 0.40 + index * 0.045;
    words.push(
      word(index === 0 ? "ENERGY" : `ITEM${index}`, 0.10, y, 0.10, 0.8),
      word(index === 2 ? "2" : "1", 0.48, y, 0.02, 0.84),
      word(index === 2 ? "2.800" : "1.00", 0.59, y, 0.07, 0.52),
      word(index === 2 ? "560" : "1,80", 0.73, y, 0.05, 0.5),
    );
  }
  words.push(word("189984220", 0.35, 0.10, 0.09, 0.3));

  const bands = deriveNumericColumnBands(words, 0.45, 0.82, 0.72);
  expect(bands).toHaveLength(3);
  expect(bands[0].center).toBeCloseTo(0.49, 2);
  expect(bands[1].center).toBeCloseTo(0.625, 2);
  expect(bands[2].center).toBeCloseTo(0.755, 2);
  expect(bands[0].right).toBeLessThan(bands[1].center);
  expect(bands[1].right).toBeLessThan(bands[2].center);
  expect(bands[2].right).toBeGreaterThan(0.77);
});

test("CR008-OCR-002 refuses to invent numeric columns from isolated identifiers", () => {
  const words = [
    word("REF", 0.10, 0.10, 0.06, 0.8),
    word("189984220", 0.60, 0.10, 0.09, 0.3),
    word("Pedido", 0.10, 0.15, 0.08, 0.8),
    word("200203", 0.70, 0.15, 0.06, 0.3),
  ];
  expect(deriveNumericColumnBands(words, 0.45, 0.82, 0.72)).toEqual([]);
});
