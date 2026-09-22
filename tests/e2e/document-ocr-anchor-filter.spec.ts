import { expect, test } from "@playwright/test";
import sharp from "sharp";
import type { DocumentOcrProvider, DocumentOcrProviderOutput } from "../../src/application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../src/domain/document-ocr";
import {
  filterReceiptAnchorWords,
  mergeReceiptRecropWords,
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
    word("Central", 0.76, 0.045),
    word("Ken", 0.82, 0.070),
    word("PUBLICIDAD", 0.08, 0.095, 0.11),

    // Receipt header / metadata.
    word("DEMO", 0.22, 0.145),
    word("BAR", 0.31, 0.145),
    word("N.I.F.", 0.26, 0.185),
    word("X1234567Z", 0.39, 0.185, 0.10),
    word("Direccion", 0.20, 0.225, 0.10),
    word("Central", 0.39, 0.225, 0.09),
    word("Kent", 0.50, 0.225, 0.06),
    word("Telefono", 0.22, 0.265, 0.09),
    word("600000000", 0.39, 0.265, 0.10),
    word("Pedido", 0.22, 0.305, 0.07),
    word("DEMO", 0.34, 0.305, 0.06),
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

    word("DEMO", 0.20, 0.14, 0.08),
    word("BAR", 0.30, 0.14, 0.06),
    word("NIF", 0.22, 0.20, 0.05),
    word("X1234567Z", 0.33, 0.20, 0.10),
    word("Pedido", 0.22, 0.28, 0.07),
    word("DEMO", 0.34, 0.28, 0.06),

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
    word("DEMO", 0.20, 0.14, 0.08),
    word("BAR", 0.30, 0.14, 0.06),
    word("NIF", 0.22, 0.20, 0.05),
    word("X1234567Z", 0.33, 0.20, 0.10),
    word("Pedido", 0.22, 0.28, 0.07),
    word("DEMO", 0.34, 0.28, 0.06),
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
    word("DEMO", 0.20, 0.14, 0.08),
    word("BAR", 0.30, 0.14, 0.06),
    word("NIF", 0.22, 0.20, 0.05),
    word("X1234567Z", 0.33, 0.20, 0.10),
    word("Pedido", 0.22, 0.28, 0.07),
    word("DEMO", 0.34, 0.28, 0.06),
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

  const recoveredInsideCrop = recoveredGlobal.filter((item) => (
    item.box.x >= recovery.x
    && item.box.x + item.box.width <= recovery.x + recovery.width + 0.000001
    && item.box.y >= recovery.y
    && item.box.y + item.box.height <= recovery.y + recovery.height + 0.000001
  ));
  expect(recoveredInsideCrop.length).toBeGreaterThanOrEqual(recoveredGlobal.length - 2);
  expect(recoveredInsideCrop.map((item) => item.text)).not.toContain("DEMO");
  expect(recoveredInsideCrop.map((item) => item.text)).not.toContain("BAR");

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
        pages: [{ pageNumber: 1, words: recoveredInsideCrop.map((item) => toLocalWord(item, recovery)) }],
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
    originalFileName: "synthetic-folded-receipt.jpg",
  });

  expect(calls).toBe(2);
  expect(output.extractor).toContain("anchor-recrop-v20");
  expect(output.warnings).toContain("background_text_filtered");
  const text = output.pages[0].words.map((item) => item.text).join(" ").toUpperCase();
  for (const expected of ["IMPORTE", "5,60", "15,91", "IVA", "1,59", "TOTAL", "17,50"]) {
    expect(text).toContain(expected);
  }
  for (const rejected of ["FONDO", "PUBLICIDAD", "AJENO", "560", "5,508", "1,008", "505/60", "50550"]) {
    expect(text).not.toContain(rejected);
  }
});


test("CR008-OCR-002 recrop can repair one-character metadata substitutions only with a clear confidence gain", () => {
  const first = [
    word("vazon", 0.20, 0.20, 0.08, 0.018, 0.52),
    word("vocial", 0.30, 0.20, 0.09, 0.018, 0.50),
    word("Luis", 0.42, 0.20, 0.06, 0.018, 0.88),
  ];
  const reread = [
    word("razon", 0.20, 0.20, 0.08, 0.018, 0.88),
    word("social", 0.30, 0.20, 0.09, 0.018, 0.86),
    word("Luis", 0.42, 0.20, 0.06, 0.018, 0.90),
  ];

  const merged = mergeReceiptRecropWords(first, reread);
  expect(merged.map((item) => item.text)).toEqual(["razon", "social", "Luis"]);

  const cautious = mergeReceiptRecropWords(
    [word("vazon", 0.20, 0.20, 0.08, 0.018, 0.82)],
    [word("razon", 0.20, 0.20, 0.08, 0.018, 0.88)],
  );
  expect(cautious.map((item) => item.text)).toEqual(["vazon"]);
});

test("CR008-OCR-002 recrop never uses confidence alone for larger lexical rewrites", () => {
  const merged = mergeReceiptRecropWords(
    [word("CUBATA", 0.20, 0.55, 0.08, 0.018, 0.40)],
    [word("COCA", 0.20, 0.55, 0.08, 0.018, 0.99)],
  );
  expect(merged.map((item) => item.text)).toEqual(["CUBATA"]);
});



test("CR008-OCR-002 ignores distant background words such as Misa instead of treating them as fuzzy Mesa metadata", () => {
  const words: OcrWord[] = [
    word("Misa", 0.36, 0.02, 0.06, 0.018, 0.88),
    word("Avila", 0.20, 0.06, 0.07, 0.018, 0.84),
    word("Victoria", 0.35, 0.06, 0.09, 0.018, 0.82),
    word("Razon", 0.20, 0.14, 0.07, 0.018, 0.82),
    word("Social", 0.28, 0.14, 0.07, 0.018, 0.82),
    word("Demo", 0.40, 0.14, 0.06, 0.018, 0.82),
    word("N.I.F.", 0.20, 0.19, 0.07, 0.018, 0.82),
    word("X1234567Z", 0.31, 0.19, 0.10, 0.018, 0.82),
    word("Direccion", 0.20, 0.24, 0.09, 0.018, 0.82),
    word("Central", 0.31, 0.24, 0.08, 0.018, 0.82),
    word("Telefono", 0.20, 0.29, 0.08, 0.018, 0.82),
    word("600000000", 0.34, 0.29, 0.10, 0.018, 0.82),
    word("DESCRIPCION", 0.20, 0.40, 0.13),
    word("UDS", 0.55, 0.40, 0.05),
    word("PRECIO", 0.65, 0.40, 0.08),
    word("IMPORTE", 0.78, 0.40, 0.09),
    word("ENERGY", 0.20, 0.45, 0.08),
    word("1", 0.56, 0.45, 0.02),
    word("1,80", 0.66, 0.45, 0.06),
    word("1,80", 0.79, 0.45, 0.06),
    word("CUBATA", 0.20, 0.50, 0.08),
    word("1", 0.56, 0.50, 0.02),
    word("5,50", 0.66, 0.50, 0.06),
    word("5,50", 0.79, 0.50, 0.06),
    word("Base", 0.62, 0.60, 0.06),
    word("15,91", 0.79, 0.60, 0.07),
    word("IVA", 0.62, 0.65, 0.05),
    word("1,59", 0.79, 0.65, 0.06),
    word("Total", 0.62, 0.70, 0.06),
    word("17,50", 0.79, 0.70, 0.07),
  ];

  const filtered = filterReceiptAnchorWords(words);
  expect(filtered).not.toBeNull();
  expect(filtered!.bounds.y).toBeGreaterThan(0.10);
  const text = filtered!.words.map((item) => item.text);
  expect(text).toContain("Razon");
  expect(text).toContain("Social");
  expect(text).not.toContain("Misa");
  expect(text).not.toContain("Avila");
});

test("CR008-OCR-002 preserves one-edit metadata anchors so recrop can verify them", () => {
  const words: OcrWord[] = [
    word("BAR", 0.24, 0.08, 0.06),
    word("DEMO", 0.32, 0.08, 0.08),
    // These are deliberately one character away from valid metadata labels.
    word("vazon", 0.20, 0.14, 0.08, 0.018, 0.48),
    word("vocial", 0.30, 0.14, 0.09, 0.018, 0.46),
    word("Luis", 0.42, 0.14, 0.06, 0.018, 0.86),
    // Deliberately avoid any other metadata anchor: this row must be what
    // extends the structural crop upward.
    word("X1234567Z", 0.30, 0.19, 0.10),
    word("Calle", 0.20, 0.24, 0.07),
    word("Victoria", 0.31, 0.24, 0.09),
    word("Sevilla", 0.20, 0.29, 0.08),
    word("600000000", 0.34, 0.29, 0.10),
    word("Operador1", 0.20, 0.34, 0.09),
    word("DESCRIPCION", 0.20, 0.42, 0.13),
    word("UDS", 0.55, 0.42, 0.05),
    word("PRECIO", 0.65, 0.42, 0.08),
    word("IMPORTE", 0.78, 0.42, 0.09),
    word("ENERGY", 0.20, 0.47, 0.08),
    word("1", 0.56, 0.47, 0.02),
    word("1,80", 0.66, 0.47, 0.06),
    word("1,80", 0.79, 0.47, 0.06),
    word("CUBATA", 0.20, 0.52, 0.08),
    word("1", 0.56, 0.52, 0.02),
    word("5,50", 0.66, 0.52, 0.06),
    word("5,50", 0.79, 0.52, 0.06),
    word("AGUA", 0.20, 0.57, 0.06),
    word("1", 0.56, 0.57, 0.02),
    word("1,80", 0.66, 0.57, 0.06),
    word("1,80", 0.79, 0.57, 0.06),
    word("Base", 0.62, 0.65, 0.06),
    word("15,91", 0.79, 0.65, 0.07),
    word("IVA", 0.62, 0.70, 0.05),
    word("1,59", 0.79, 0.70, 0.06),
    word("Total", 0.62, 0.75, 0.06),
    word("17,50", 0.79, 0.75, 0.07),
  ];

  const filtered = filterReceiptAnchorWords(words);
  expect(filtered).not.toBeNull();
  const text = filtered!.words.map((item) => item.text.toLowerCase());
  expect(text).toContain("vazon");
  expect(text).toContain("vocial");
  expect(filtered!.bounds.y).toBeLessThan(0.14);
});
