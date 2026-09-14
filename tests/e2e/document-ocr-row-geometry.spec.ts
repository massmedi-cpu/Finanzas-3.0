import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import { reconstructOcrPage } from "../../src/domain/document-ocr";
import { clusterOcrRows, ocrRowTextBox } from "../../src/domain/ocr-rows";
import { filterReceiptAnchorWords } from "../../src/infrastructure/ocr/receipt-anchor-filter-provider";
import { selectReceiptRowsForColumnSweep } from "../../src/infrastructure/ocr/receipt-column-sweep-provider";
import { paddedFocusedCellRectangle } from "../../src/infrastructure/ocr/receipt-padded-cell-consensus-provider";

const w = (text: string, x: number, y: number, width = 0.06, height = 0.02): OcrWord => ({
  text, confidence: 0.88, box: { x, y, width, height },
});
function receipt() {
  return [
    w("TIENDA", 0.2, 0.16), w("NIF", 0.2, 0.22), w("00000000", 0.4, 0.22),
    w("DESCRIPCION", 0.2, 0.3, 0.22), w("UDS", 0.56, 0.3),
    w("PRECIO", 0.66, 0.3), w("IMPORTE", 0.8, 0.3, 0.09),
    ...[["PRODUCTO_A", "1", "1,80", "1,80"], ["PRODUCTO_B", "2", "2,80", "560"],
      ["PRODUCTO_C", "1", "5,50", "5,508"]].flatMap((values, index) => values.map((value, column) => (
        w(value, [0.2, 0.56, 0.66, 0.8][column], 0.35 + index * 0.04, column ? 0.06 : 0.23)
      ))),
    ...[["Base", "15,91"], ["IVA", "1,59"], ["Total", "17,50"]].flatMap((values, index) => [
      w(values[0], 0.6, 0.52 + index * 0.04), w(values[1], 0.8, 0.52 + index * 0.04),
    ]),
  ];
}

test("tall background glyphs cannot merge the header and neighbouring product rows", () => {
  const original = receipt();
  const noise = w("F", 0.1, 0.275, 0.03, 0.17);
  const rows = clusterOcrRows([...original, noise]);
  for (const [label, values] of [
    ["PRODUCTO_A", ["1", "1,80", "1,80"]],
    ["PRODUCTO_B", ["2", "2,80", "560"]],
    ["PRODUCTO_C", ["1", "5,50", "5,508"]],
  ] as const) {
    const row = rows.find((row) => row.some((word) => word.text === label))!;
    expect(row.slice(-3).map((word) => word.text)).toEqual(values);
    expect(row.some((word) => word.text === "DESCRIPCION")).toBe(false);
  }
  expect(rows.flat()).toHaveLength(original.length + 1);
  for (const word of original) expect(rows.flat()).toContain(word);
});

test("anchor filtering, numeric recovery and final layout share the same distinct rows", () => {
  const words = [...receipt(), w("F", 0.1, 0.275, 0.03, 0.17), w("PUBLICIDAD", 0.93, 0.4)];
  const filtered = filterReceiptAnchorWords(words);
  expect(filtered).not.toBeNull();
  const rows = selectReceiptRowsForColumnSweep(filtered!.words);
  for (const label of ["PRODUCTO_A", "PRODUCTO_B", "PRODUCTO_C", "Base", "IVA", "Total"]) {
    expect(rows.some((row) => row.text.includes(label))).toBe(true);
  }
  const page = reconstructOcrPage(1, words);
  expect(page.lines.find((line) => line.text.includes("PRODUCTO_B"))?.words.slice(-3).map((word) => word.text))
    .toEqual(["2", "2,80", "560"]);
  expect(page.plainText).not.toContain("5,60");
});

test("crop geometry ignores a tall mark while retaining all original words", () => {
  const row = [w("PRODUCTO", 0.2, 0.4), w("2", 0.56, 0.4), w("2,80", 0.66, 0.4),
    w("560", 0.8, 0.4), w("F", 0.45, 0.34, 0.02, 0.15)];
  const box = ocrRowTextBox(row);
  expect(box.y).toBeCloseTo(0.4);
  expect(box.height).toBeCloseTo(0.02);
  expect(row.at(-1)?.text).toBe("F");
});

test("both padded variants exclude adjacent rows and remain inside their numeric column", () => {
  const metadata = { mimeType: "image/jpeg" as const, width: 1600, height: 2000 };
  const row = { words: [], box: { x: 0.2, y: 0.48, width: 0.65, height: 0.04 }, text: "PRODUCTO 2 2,80 560", summaryLike: false };
  const band = { left: 0.74, right: 0.87, center: 0.805, support: 5 };
  for (const variant of [0, 1] as const) {
    const crop = paddedFocusedCellRectangle(metadata, row, band, "money", variant);
    expect(crop.top).toBeGreaterThan(0.47 * metadata.height);
    expect(crop.top + crop.height).toBeLessThan(0.53 * metadata.height);
    expect(crop.left).toBeGreaterThanOrEqual(Math.floor(band.left * metadata.width));
    expect(crop.left + crop.width).toBeLessThanOrEqual(Math.ceil(band.right * metadata.width));
  }
});

test("a missed numeric cell uses the numbers' baseline rather than a slanted description", () => {
  const metadata = { mimeType: "image/jpeg" as const, width: 1600, height: 2000 };
  const words = [w("PRODUCTO", 0.2, 0.42), w("1", 0.56, 0.4), w("1,80", 0.66, 0.4)];
  const row = { words, box: { x: 0.2, y: 0.4, width: 0.6, height: 0.04 }, text: "PRODUCTO 1 1,80", summaryLike: false };
  const band = { left: 0.74, right: 0.87, center: 0.805, support: 5 };
  const crop = paddedFocusedCellRectangle(metadata, row, band, "money", 1);
  expect(crop.top).toBeLessThan(0.4 * metadata.height);
  expect(crop.top + crop.height).toBeLessThan(0.43 * metadata.height);
});
