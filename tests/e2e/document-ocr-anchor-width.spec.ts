import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import { filterReceiptAnchorWords } from "../../src/infrastructure/ocr/receipt-anchor-filter-provider";

const w = (text: string, x: number, y: number, width = 0.06): OcrWord => ({
  text,
  confidence: 0.82,
  box: { x, y, width, height: 0.018 },
});

test("CR008-OCR-002 v17 uses the complete header when structural rows are over-wide", () => {
  const words: OcrWord[] = [
    w("Pedido", 0.22, 0.28), w("123", 0.34, 0.28),
    w("DESCRIPCION", 0.20, 0.40, 0.13), w("UDS", 0.54, 0.40, 0.05),
    w("PRECIO", 0.65, 0.40, 0.08), w("IMPORTE", 0.79, 0.40, 0.09),
    w("RUIDO", 0.002, 0.45, 0.08), w("ENERGY", 0.20, 0.45), w("1", 0.55, 0.45, 0.02), w("1,80", 0.66, 0.45), w("1,80", 0.80, 0.45),
    w("TERCIO", 0.20, 0.50), w("1", 0.55, 0.50, 0.02), w("2,80", 0.66, 0.50), w("2,80", 0.80, 0.50), w("AJENO", 0.94, 0.50, 0.055),
    w("CANA", 0.20, 0.55), w("2", 0.55, 0.55, 0.02), w("2,80", 0.66, 0.55), w("5,60", 0.80, 0.55),
    w("CUBATA", 0.20, 0.60), w("1", 0.55, 0.60, 0.02), w("5,50", 0.66, 0.60), w("5,50", 0.80, 0.60),
    w("AGUA", 0.20, 0.65), w("1", 0.55, 0.65, 0.02), w("1,80", 0.66, 0.65), w("1,80", 0.80, 0.65),
    w("Base", 0.62, 0.72), w("15,91", 0.80, 0.72),
    w("IVA", 0.62, 0.76), w("1,59", 0.80, 0.76),
    w("Total", 0.62, 0.80), w("17,50", 0.80, 0.80),
  ];

  const filtered = filterReceiptAnchorWords(words);
  expect(filtered).not.toBeNull();
  const text = filtered!.words.map((item) => item.text).join(" ").toUpperCase();
  expect(text).toContain("5,60");
  expect(text).toContain("17,50");
  expect(text).not.toContain("RUIDO");
  expect(text).not.toContain("AJENO");
  expect(filtered!.bounds.width).toBeLessThan(0.92);
});
