import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import {
  mergeRecoveredNumericCell,
  selectReceiptRowsForCellRecovery,
} from "../../src/infrastructure/ocr/receipt-cell-recovery-provider";

function word(text: string, x: number, y: number, width = 0.055, confidence = 0.62): OcrWord {
  return { text, confidence, box: { x, y, width, height: 0.025 } };
}

function recoveryRow(words: OcrWord[], summaryLike = false) {
  const left = Math.min(...words.map((item) => item.box.x));
  const top = Math.min(...words.map((item) => item.box.y));
  const right = Math.max(...words.map((item) => item.box.x + item.box.width));
  const bottom = Math.max(...words.map((item) => item.box.y + item.box.height));
  return {
    words,
    box: { x: left, y: top, width: right - left, height: bottom - top },
    text: words.map((item) => item.text).join(" "),
    summaryLike,
    productLike: !summaryLike,
  };
}

const amountBand = { left: 0.69, right: 0.80, center: 0.745, support: 4 };

test("CR008-OCR-002 v4 adds a recovered amount without deleting the already-valid price cell", () => {
  const base = [
    word("CAÑA", 0.11, 0.42, 0.07, 0.75),
    word("GRANDE", 0.20, 0.42, 0.09, 0.76),
    word("2", 0.48, 0.42, 0.02, 0.88),
    word("2,80", 0.59, 0.42, 0.06, 0.91),
  ];
  const row = recoveryRow(base);
  const recovered = word("5,60", 0.72, 0.42, 0.06, 0.9);

  const merged = mergeRecoveredNumericCell(base, row, amountBand, recovered);
  const text = merged.map((item) => item.text).join(" ");
  expect(text).toContain("2,80");
  expect(text).toContain("5,60");
  expect(text).toContain("CAÑA GRANDE");
});

test("CR008-OCR-002 v4 keeps a doubtful original amount when the isolated cell has no visible monetary token", () => {
  const base = [
    word("CAÑA", 0.11, 0.42, 0.07, 0.75),
    word("2", 0.48, 0.42, 0.02, 0.88),
    word("2,80", 0.59, 0.42, 0.06, 0.91),
    word("560", 0.72, 0.42, 0.05, 0.25),
  ];
  const row = recoveryRow(base);

  const merged = mergeRecoveredNumericCell(base, row, amountBand, null);
  expect(merged).toEqual(base);
  expect(merged.map((item) => item.text).join(" ")).toContain("560");
});

test("CR008-OCR-002 v4 can attach a physically reread final total to an otherwise empty summary row", () => {
  const base = [word("Total:", 0.18, 0.67, 0.08, 0.85)];
  const row = recoveryRow(base, true);
  const recovered = word("15,91", 0.72, 0.67, 0.06, 0.94);

  const merged = mergeRecoveredNumericCell(base, row, amountBand, recovered);
  expect(merged.map((item) => item.text).join(" ")).toContain("Total:");
  expect(merged.map((item) => item.text).join(" ")).toContain("15,91");
});

test("CR008-OCR-002 v4 limits recovery rows to the receipt body after the numeric table header", () => {
  const words = [
    word("N.I.F.", 0.10, 0.10, 0.08, 0.75),
    word("189984220", 0.30, 0.10, 0.10, 0.4),
    word("DESCRIPCION", 0.10, 0.35, 0.16, 0.9),
    word("UDS", 0.48, 0.35, 0.05, 0.9),
    word("PRECIO", 0.59, 0.35, 0.08, 0.9),
    word("IMPORTE", 0.72, 0.35, 0.09, 0.9),
    word("ENERGY", 0.10, 0.40, 0.10, 0.8),
    word("1", 0.48, 0.40, 0.02, 0.85),
    word("1,80", 0.59, 0.40, 0.06, 0.8),
    word("Total:", 0.18, 0.67, 0.08, 0.85),
  ];

  const rows = selectReceiptRowsForCellRecovery(words);
  expect(rows.some((item) => item.text.includes("ENERGY"))).toBeTruthy();
  expect(rows.some((item) => /Total:/i.test(item.text))).toBeTruthy();
  expect(rows.some((item) => item.text.includes("189984220"))).toBeFalsy();
});
