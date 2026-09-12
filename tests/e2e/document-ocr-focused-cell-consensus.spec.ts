import { expect, test } from "@playwright/test";
import {
  explicitNumericTokens,
  focusedCellRectangle,
  focusedCellUpscaleFactor,
} from "../../src/infrastructure/ocr/receipt-focused-cell-consensus-provider";
import type { OcrImageMetadata } from "../../src/infrastructure/ocr/image-metadata";
import type { OcrWord } from "../../src/domain/document-ocr";

const metadata: OcrImageMetadata = {
  mimeType: "image/jpeg",
  width: 4000,
  height: 3000,
};

const rowWord: OcrWord = {
  text: "CAÑA",
  confidence: 0.8,
  box: { x: 0.12, y: 0.5, width: 0.08, height: 0.02 },
};

const row = {
  words: [rowWord],
  box: { x: 0.12, y: 0.5, width: 0.5, height: 0.02 },
  text: "CAÑA GRANDE",
  summaryLike: false,
};

const moneyBand = {
  left: 0.62,
  right: 0.74,
  center: 0.68,
  support: 5,
};

test("CR008-OCR-002 v8 narrows the physical crop around the numeric column instead of rereading the whole band", () => {
  const rectangle = focusedCellRectangle(metadata, row, moneyBand, "money", 0);
  const fullBandWidth = Math.round((moneyBand.right - moneyBand.left) * metadata.width);
  expect(rectangle.width).toBeLessThan(fullBandWidth);
  expect(rectangle.width).toBeGreaterThanOrEqual(72);
  expect(rectangle.height).toBeLessThan(150);
});

test("CR008-OCR-002 v8 enlarges a focused 60 px row enough for a second physical read", () => {
  expect(focusedCellUpscaleFactor(60)).toBe(3);
  expect(60 * focusedCellUpscaleFactor(60)).toBeGreaterThanOrEqual(180);
});

test("CR008-OCR-002 v8 accepts explicit decimal punctuation from OCR text but never manufactures it from bare digits", () => {
  expect(explicitNumericTokens(" 5 , 60 ", "money")).toEqual(["5,60"]);
  expect(explicitNumericTokens("5.60", "money")).toEqual(["5.60"]);
  expect(explicitNumericTokens("560", "money")).toEqual([]);
  expect(explicitNumericTokens("2.800", "money")).toEqual([]);
});

test("CR008-OCR-002 v8 keeps integer and money reads in separate column contracts", () => {
  expect(explicitNumericTokens("2", "integer")).toEqual(["2"]);
  expect(explicitNumericTokens("2,80", "integer")).toEqual([]);
  expect(explicitNumericTokens("2,80", "money")).toEqual(["2,80"]);
});
