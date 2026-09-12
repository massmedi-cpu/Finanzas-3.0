import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import {
  mergeRefinedNumericRow,
  mergeRefinedTextRow,
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
