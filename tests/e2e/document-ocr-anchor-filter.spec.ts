import { expect, test } from "@playwright/test";
import sharp from "sharp";
import type { DocumentOcrProvider, DocumentOcrProviderOutput } from "../../src/application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../src/domain/document-ocr";
import {
  filterReceiptAnchorWords,
  ReceiptAnchorFilteringImageOcrProvider,
} from "../../src/infrastructure/ocr/receipt-anchor-filter-provider";

function word(
  text: string,
  x: number,
  y: number,
  width = 0.07,
  height = 0.018,
  confidence = 0.82,
): OcrWord {
  return { text, confidence, box: { x, y, width, height } };
}

test("CR008-OCR-002 v11 removes peripheral photographed text while preserving the receipt table and totals", () => {
  const words: OcrWord[] = [
    // Readable text outside the receipt, matching the real replay class that leaked into the OCR.
    word("Misa", 0.10, 0.025),
    word("Victoria", 0.76, 0.045),
    word("Ken", 0.82, 0.070),
    word("PUBLICIDAD", 0.08, 0.095, 0.11),

    // Receipt header / metadata.
    word("AVILA", 0.22, 0.145),
    word("BAR", 0.31, 0.145),
    word("N.I.F.", 0.26, 0.185),
    word("YB398422C", 0.39, 0.185, 0.10),
    word("Direccion", 0.20, 0.225, 0.10),
    word("Victoria", 0.39, 0.225, 0.09),
    word("Kent", 0.50, 0.225, 0.06),
    word("Telefono", 0.22, 0.265, 0.09),
    word("641552438", 0.39, 0.265, 0.10),
    word("Pedido", 0.22, 0.305, 0.07),
    word("LUIS", 0.34, 0.305, 0.06),
    word("Hora", 0.22, 0.345, 0.06),
    word("00:02:03", 0.36, 0.345, 0.09),

    // Strong structural anchor: the real ticket's numeric table header.
    word("DESCRIPCION", 0.20, 0.405, 0.13),
    word("UDS", 0.55, 0.405, 0.05),
    word("PRECIO", 0.65, 0.405, 0.08),
    word("IMPORTE", 0.78, 0.405, 0.09),

    word("ENERGY", 0.20, 0.445, 0.08),
    word("1", 0.56, 0.445, 0.02),
    word("1,00", 0.66, 0.445, 0.06),
    word("1,80", 0.79, 0.445, 0.06),

    word("TERCIO", 0.20, 0.485, 0.08),
    word("GALICIA", 0.30, 0.485, 0.09),
    word("CERO", 0.41, 0.485, 0.06),
    word("1", 0.56, 0.485, 0.02),
    word("2,80", 0.66, 0.485, 0.06),
    word("2,80", 0.79, 0.485, 0.06),

    word("CANA", 0.20, 0.525, 0.06),
    word("GRANDE", 0.28, 0.525, 0.08),
    word("2", 0.56, 0.525, 0.02),
    word("2,80", 0.66, 0.525, 0.06),
    word("5,60", 0.79, 0.525, 0.06),

    word("CUBATA", 0.20, 0.565, 0.08),
    word("1", 0.56, 0.565, 0.02),
    word("5,50", 0.66, 0.565, 0.06),
    word("5,50", 0.79, 0.565, 0.06),

    word("AGUA", 0.20, 0.605, 0.06),
    word("CON", 0.28, 0.605, 0.05),
    word("GAS", 0.35, 0.605, 0.05),
    word("1", 0.56, 0.605, 0.02),
    word("1,80", 0.66, 0.605, 0.06),
    word("1,80", 0.79, 0.605, 0.06),

    word("Base", 0.62, 0.675, 0.06),
    word("15,91", 0.79, 0.675, 0.07),
    word("IVA", 0.62, 0.715, 0.05),
    word("1,59", 0.79, 0.715, 0.06),
    word("Total", 0.62, 0.755, 0.06),
    word("17,50", 0.79, 0.755, 0.07),
    word("PENDIENTE", 0.32, 0.815, 0.11),
    word("PAGO", 0.46, 0.815, 0.07),
    word("Mesa", 0.37, 0.855, 0.06),
    word("T29", 0.45, 0.855, 0.05),

    // More foreign text below the photographed receipt.
    word("FONDO", 0.09, 0.925, 0.08),
    word("AJENO", 0.20, 0.950, 0.08),
    word("PROMO", 0.80, 0.970, 0.08),
  ];

  const filtered = filterReceiptAnchorWords(words);
  expect(filtered).not.toBeNull();
  expect(filtered!.removedWords).toBeGreaterThanOrEqual(5);

  const text = filtered!.words.map((item) => item.text).join(" ").toUpperCase();
  expect(text).toContain("DESCRIPCION");
  expect(text).toContain("GALICIA");
  expect(text).toContain("5,60");
  expect(text).toContain("15,91");
  expect(text).toContain("1,59");
  expect(text).toContain("17,50");
  expect(text).not.toContain("MISA");
  expect(text).not.toContain("PUBLICIDAD");
  expect(text).not.toContain("FONDO");
  expect(text).not.toContain("PROMO");
});

test("CR008-OCR-002 v11 refuses to crop generic text without a receipt table anchor", () => {
  const words = [
    word("Informe", 0.15, 0.15),
    word("general", 0.28, 0.15),
    word("importe", 0.60, 0.30),
    word("total", 0.60, 0.50),
    word("2026", 0.75, 0.50),
    word("notas", 0.20, 0.70),
    word("varias", 0.30, 0.70),
    word("pagina", 0.45, 0.80),
    word("uno", 0.55, 0.80),
    word("texto", 0.15, 0.90),
    word("libre", 0.25, 0.90),
    word("fin", 0.70, 0.93),
  ];
  expect(filterReceiptAnchorWords(words)).toBeNull();
});

test("CR008-OCR-002 v13 reserves missing IMPORTE and IVA/Total pixels for the recovery pass without widening strict output", () => {
  const words: OcrWord[] = [
    word("FONDO", 0.04, 0.04, 0.09),
    word("PUBLICIDAD", 0.86, 0.08, 0.12),

    word("AVILA", 0.20, 0.14, 0.08),
    word("BAR", 0.30, 0.14, 0.06),
    word("NIF", 0.22, 0.20, 0.05),
    word("YB398422C", 0.33, 0.20, 0.10),
    word("Pedido", 0.22, 0.28, 0.07),
    word("LUIS", 0.34, 0.28, 0.06),

    // Reproduce the real failure shape: IMPORTE is missing from the first pass.
    word("DESCRIPCION", 0.20, 0.40, 0.13),
    word("UDS", 0.54, 0.40, 0.05),
    word("PRECIO", 0.65, 0.40, 0.08),

    word("ENERGY", 0.20, 0.45, 0.08),
    word("1", 0.55, 0.45, 0.02),
    word("1,80", 0.66, 0.45, 0.06),

    word("TERCIO", 0.20, 0.50, 0.08),
    word("GALICIA", 0.30, 0.50, 0.09),
    word("CERO", 0.41, 0.50, 0.06),
    word("1", 0.55, 0.50, 0.02),
    word("2,80", 0.66, 0.50, 0.06),

    word("CANA", 0.20, 0.55, 0.06),
    word("GRANDE", 0.28, 0.55, 0.08),
    word("2", 0.55, 0.55, 0.02),
    word("2,80", 0.66, 0.55, 0.06),

    word("CUBATA", 0.20, 0.60, 0.08),
    word("1", 0.55, 0.60, 0.02),
    word("5,50", 0.66, 0.60, 0.06),

    word("AGUA", 0.20, 0.65, 0.06),
    word("CON", 0.28, 0.65, 0.05),
    word("GAS", 0.35, 0.65, 0.05),
    word("1", 0.55, 0.65, 0.02),
    word("1,80", 0.66, 0.65, 0.06),

    // Base is visible but IVA/Total are missing from the first pass.
    word("Base", 0.60, 0.72, 0.06),
    word("15,91", 0.68, 0.72, 0.07),

    word("AJENO", 0.06, 0.94, 0.08),
  ];

  const filtered = filterReceiptAnchorWords(words);
  expect(filtered).not.toBeNull();

  const strictRight = filtered!.bounds.x + filtered!.bounds.width;
  const recoveryRight = filtered!.recoveryBounds.x + filtered!.recoveryBounds.width;
  const strictBottom = filtered!.bounds.y + filtered!.bounds.height;
  const recoveryBottom = filtered!.recoveryBounds.y + filtered!.recoveryBounds.height;

  expect(recoveryRight).toBeGreaterThan(strictRight + 0.04);
  expect(recoveryBottom).toBeGreaterThan(strictBottom + 0.03);

  const strictText = filtered!.words.map((item) => item.text).join(" ").toUpperCase();
  expect(strictText).toContain("DESCRIPCION");
  expect(strictText).toContain("PRECIO");
  expect(strictText).toContain("15,91");
  expect(strictText).not.toContain("IMPORTE");
  expect(strictText).not.toContain("IVA");
  expect(strictText).not.toContain("TOTAL");
  expect(strictText).not.toContain("FONDO");
  expect(strictText).not.toContain("PUBLICIDAD");
  expect(strictText).not.toContain("AJENO");
});

function toLocalWord(item: OcrWord, bounds: OcrBoundingBox): OcrWord {
  return {
    ...item,
    box: {
      x: (item.box.x - bounds.x) / bounds.width,
      y: (item.box.y - bounds.y) / bounds.height,
      width: item.box.width / bounds.width,
      height: item.box.height / bounds.height,
    },
  };
}

test("CR008-OCR-002 v13 second pass restores the missing amount column and IVA/Total without background leakage", async () => {
  const firstPass: OcrWord[] = [
    word("FONDO", 0.04, 0.04, 0.09),
    word("PUBLICIDAD", 0.88, 0.10, 0.10),
    word("AVILA", 0.20, 0.14, 0.08),
    word("BAR", 0.30, 0.14, 0.06),
    word("NIF", 0.22, 0.20, 0.05),
    word("YB398422C", 0.33, 0.20, 0.10),
    word("Pedido", 0.22, 0.28, 0.07),
    word("LUIS", 0.34, 0.28, 0.06),
    word("DESCRIPCION", 0.20, 0.40, 0.13),
    word("UDS", 0.54, 0.40, 0.05),
    word("PRECIO", 0.65, 0.40, 0.08),
    word("ENERGY", 0.20, 0.45, 0.08),
    word("1", 0.55, 0.45, 0.02),
    word("1,80", 0.66, 0.45, 0.06),
    word("TERCIO", 0.20, 0.50, 0.08),
    word("GALICIA", 0.30, 0.50, 0.09),
    word("CERO", 0.41, 0.50, 0.06),
    word("1", 0.55, 0.50, 0.02),
    word("2,80", 0.66, 0.50, 0.06),
    word("CANA", 0.20, 0.55, 0.06),
    word("GRANDE", 0.28, 0.55, 0.08),
    word("2", 0.55, 0.55, 0.02),
    word("2,80", 0.66, 0.55, 0.06),
    word("CUBATA", 0.20, 0.60, 0.08),
    word("1", 0.55, 0.60, 0.02),
    word("5,50", 0.66, 0.60, 0.06),
    word("AGUA", 0.20, 0.65, 0.06),
    word("CON", 0.28, 0.65, 0.05),
    word("GAS", 0.35, 0.65, 0.05),
    word("1", 0.55, 0.65, 0.02),
    word("1,80", 0.66, 0.65, 0.06),
    word("Base", 0.60, 0.72, 0.06),
    word("15,91", 0.68, 0.72, 0.07),
    word("AJENO", 0.06, 0.94, 0.08),
  ];
  const initialFilter = filterReceiptAnchorWords(firstPass);
  expect(initialFilter).not.toBeNull();
  const recovery = initialFilter!.recoveryBounds;

  const recoveredGlobal: OcrWord[] = [
    word("AVILA", 0.20, 0.14, 0.08),
    word("BAR", 0.30, 0.14, 0.06),
    word("NIF", 0.22, 0.20, 0.05),
    word("YB398422C", 0.33, 0.20, 0.10),
    word("Pedido", 0.22, 0.28, 0.07),
    word("LUIS", 0.34, 0.28, 0.06),
    word("DESCRIPCION", 0.20, 0.40, 0.13),
    word("UDS", 0.54, 0.40, 0.05),
    word("PRECIO", 0.65, 0.40, 0.08),
    word("IMPORTE", 0.78, 0.40, 0.08),
    word("ENERGY", 0.20, 0.45, 0.08),
    word("1", 0.55, 0.45, 0.02),
    word("1,80", 0.66, 0.45, 0.06),
    word("1,80", 0.79, 0.45, 0.06),
    word("TERCIO", 0.20, 0.50, 0.08),
    word("GALICIA", 0.30, 0.50, 0.09),
    word("CERO", 0.41, 0.50, 0.06),
    word("1", 0.55, 0.50, 0.02),
    word("2,80", 0.66, 0.50, 0.06),
    word("2,80", 0.79, 0.50, 0.06),
    word("CANA", 0.20, 0.55, 0.06),
    word("GRANDE", 0.28, 0.55, 0.08),
    word("2", 0.55, 0.55, 0.02),
    word("2,80", 0.66, 0.55, 0.06),
    word("5,60", 0.79, 0.55, 0.06),
    word("CUBATA", 0.20, 0.60, 0.08),
    word("1", 0.55, 0.60, 0.02),
    word("5,50", 0.66, 0.60, 0.06),
    word("5,50", 0.79, 0.60, 0.06),
    word("AGUA", 0.20, 0.65, 0.06),
    word("CON", 0.28, 0.65, 0.05),
    word("GAS", 0.35, 0.65, 0.05),
    word("1", 0.55, 0.65, 0.02),
    word("1,80", 0.66, 0.65, 0.06),
    word("1,80", 0.79, 0.65, 0.06),
    word("Base", 0.62, 0.72, 0.06),
    word("15,91", 0.79, 0.72, 0.07),
    word("IVA", 0.62, 0.76, 0.05),
    word("1,59", 0.79, 0.76, 0.06),
    word("Total", 0.62, 0.80, 0.06),
    word("17,50", 0.79, 0.80, 0.07),
  ];

  for (const item of recoveredGlobal) {
    expect(item.box.x).toBeGreaterThanOrEqual(recovery.x);
    expect(item.box.x + item.box.width).toBeLessThanOrEqual(recovery.x + recovery.width + 0.000001);
    expect(item.box.y).toBeGreaterThanOrEqual(recovery.y);
    expect(item.box.y + item.box.height).toBeLessThanOrEqual(recovery.y + recovery.height + 0.000001);
  }

  let calls = 0;
  const fakeBase: DocumentOcrProvider = {
    supports: () => true,
    async extract(input): Promise<DocumentOcrProviderOutput> {
      calls += 1;
      if (!input.originalFileName.endsWith(".receipt-crop.png")) {
        return { source: "image_ocr", extractor: "fake-first-pass", pages: [{ pageNumber: 1, words: firstPass }] };
      }
      return {
        source: "image_ocr",
        extractor: "fake-recovery-pass",
        pages: [{ pageNumber: 1, words: recoveredGlobal.map((item) => toLocalWord(item, recovery)) }],
      };
    },
  };

  const pixels = await sharp({
    create: { width: 1200, height: 1600, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
  const provider = new ReceiptAnchorFilteringImageOcrProvider(fakeBase);
  const output = await provider.extract({
    bytes: new Uint8Array(pixels),
    mimeType: "image/png",
    originalFileName: "PXL_20260821_220553447.jpg",
  });

  expect(calls).toBe(2);
  expect(output.extractor).toContain("anchor-recrop-v19");
  expect(output.warnings).toContain("background_text_filtered");
  const text = output.pages[0].words.map((item) => item.text).join(" ").toUpperCase();
  for (const expected of ["IMPORTE", "5,60", "15,91", "IVA", "1,59", "TOTAL", "17,50"]) {
    expect(text).toContain(expected);
  }
  for (const rejected of ["FONDO", "PUBLICIDAD", "AJENO", "560", "5,508", "1,008", "505/60", "50550"]) {
    expect(text).not.toContain(rejected);
  }
});
