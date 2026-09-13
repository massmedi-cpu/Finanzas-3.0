import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import { filterReceiptAnchorWords } from "../../src/infrastructure/ocr/receipt-anchor-filter-provider";

function word(
  text: string,
  x: number,
  y: number,
  width = 0.07,
  height = 0.018,
  confidence = 0.9,
): OcrWord {
  return { text, confidence, box: { x, y, width, height } };
}

test("CR008-OCR-002 v14 keeps structural recrop active when upstream OCR already removed background text", () => {
  const cleanReceipt: OcrWord[] = [
    word("NIF", 0.22, 0.12, 0.05),
    word("YB398422C", 0.32, 0.12, 0.10),

    word("DESCRIPCION", 0.20, 0.20, 0.13),
    word("UDS", 0.50, 0.20, 0.05),
    word("PRECIO", 0.62, 0.20, 0.08),

    word("ENERGY", 0.20, 0.28, 0.08),
    word("1", 0.51, 0.28, 0.02),
    word("1,80", 0.63, 0.28, 0.06),

    word("TERCIO", 0.20, 0.36, 0.08),
    word("GALICIA", 0.30, 0.36, 0.09),
    word("1", 0.51, 0.36, 0.02),
    word("2,80", 0.63, 0.36, 0.06),

    word("CANA", 0.20, 0.44, 0.06),
    word("GRANDE", 0.28, 0.44, 0.08),
    word("2", 0.51, 0.44, 0.02),
    word("2,80", 0.63, 0.44, 0.06),

    word("CUBATA", 0.20, 0.52, 0.08),
    word("1", 0.51, 0.52, 0.02),
    word("5,50", 0.63, 0.52, 0.06),

    word("Base", 0.54, 0.60, 0.06),
    word("15,91", 0.64, 0.60, 0.07),
    word("IVA", 0.54, 0.68, 0.05),
    word("1,59", 0.64, 0.68, 0.06),
    word("Total", 0.54, 0.76, 0.06),
    word("17,50", 0.64, 0.76, 0.07),
  ];

  const filtered = filterReceiptAnchorWords(cleanReceipt);

  expect(filtered).not.toBeNull();
  expect(filtered!.removedWords).toBe(0);
  expect(filtered!.words).toHaveLength(cleanReceipt.length);
  expect(filtered!.recoveryBounds.height).toBeGreaterThan(filtered!.bounds.height);

  const strictRight = filtered!.bounds.x + filtered!.bounds.width;
  const recoveryRight = filtered!.recoveryBounds.x + filtered!.recoveryBounds.width;
  expect(recoveryRight).toBeGreaterThan(strictRight);
});