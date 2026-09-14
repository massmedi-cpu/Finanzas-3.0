import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import { mergeReceiptRecropWords } from "../../src/infrastructure/ocr/receipt-anchor-filter-provider";

const word = (text: string, x: number, y: number, width = 0.06, confidence = 0.82): OcrWord => ({
  text,
  confidence,
  box: { x, y, width, height: 0.018 },
});

test("CR008-OCR-002 v18 recrop cannot erase first-pass evidence from an omitted amount cell", () => {
  const firstPass: OcrWord[] = [
    word("CANA", 0.20, 0.55),
    word("GRANDE", 0.28, 0.55, 0.08),
    word("2", 0.55, 0.55, 0.02),
    word("2,80", 0.66, 0.55),
    word("5,60", 0.80, 0.55),
    word("Base", 0.62, 0.72),
    word("15,91", 0.80, 0.72),
  ];

  const reread: OcrWord[] = [
    word("CANA", 0.201, 0.551),
    word("GRANDE", 0.281, 0.551, 0.08),
    word("2", 0.551, 0.551, 0.02),
    word("2,80", 0.661, 0.551),
    // Tesseract omitted the amount-column cell entirely on the recrop.
    word("Base", 0.621, 0.721),
    word("15,91", 0.801, 0.721),
    word("IVA", 0.62, 0.76),
    word("1,59", 0.80, 0.76),
    word("Total", 0.62, 0.80),
    word("17,50", 0.80, 0.80),
  ];

  const merged = mergeReceiptRecropWords(firstPass, reread);
  const text = merged.map((item) => item.text);

  expect(text).toContain("5,60");
  expect(text).toContain("1,59");
  expect(text).toContain("17,50");
  expect(text.filter((item) => item === "2,80")).toHaveLength(1);
  expect(text.filter((item) => item === "15,91")).toHaveLength(1);
});

test("CR008-OCR-002 v18 lets recrop upgrade malformed numeric evidence in the same physical slot", () => {
  const firstPass = [word("560", 0.80, 0.55, 0.06, 0.61)];
  const reread = [word("5,60", 0.801, 0.551, 0.06, 0.88)];

  const merged = mergeReceiptRecropWords(firstPass, reread);

  expect(merged.map((item) => item.text)).toEqual(["5,60"]);
});

test("CR008-OCR-002 v18 recrop cannot downgrade an explicit monetary token to bare digits", () => {
  const firstPass = [word("5,60", 0.80, 0.55, 0.06, 0.79)];
  const reread = [word("560", 0.801, 0.551, 0.06, 0.91)];

  const merged = mergeReceiptRecropWords(firstPass, reread);

  expect(merged.map((item) => item.text)).toEqual(["5,60"]);
});
