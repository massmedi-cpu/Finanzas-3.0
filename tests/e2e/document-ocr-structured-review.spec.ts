import { expect, test } from "@playwright/test";
import { buildDocumentOcrResult, reconstructOcrPage, type OcrWord } from "../../src/domain/document-ocr";

function word(text: string, x: number, y: number, width = 0.06, confidence = 0.9): OcrWord {
  return { text, confidence, box: { x, y, width, height: 0.018 } };
}

test("CR008-OCR-002 builds a clean structured receipt review without altering raw trace text", () => {
  const words: OcrWord[] = [
    word("FONDO", 0.02, 0.01, 0.07),
    word("AJENO", 0.10, 0.01, 0.07),
    word("Misa", 0.38, 0.08, 0.05),
    word("Avila", 0.22, 0.11, 0.06),
    word("Bar", 0.29, 0.11, 0.04),
    word("Razon", 0.16, 0.16, 0.06),
    word("Social:", 0.23, 0.16, 0.07),
    word("Luis", 0.36, 0.16, 0.05),
    word("Enrique", 0.42, 0.16, 0.08),
    word("DESCRIPCION", 0.14, 0.30, 0.14),
    word("UDS", 0.56, 0.30, 0.04),
    word("PRECIO", 0.66, 0.30, 0.07),
    word("IMPORTE", 0.80, 0.30, 0.08),

    word("ENERGY", 0.14, 0.35, 0.08),
    word("1", 0.57, 0.35, 0.02),
    word("1,80", 0.67, 0.35, 0.05),
    word("1,80", 0.81, 0.35, 0.05),

    word("TERCIO", 0.14, 0.40, 0.07),
    word("GALICIA", 0.22, 0.40, 0.08),
    word("CERO", 0.31, 0.40, 0.05),
    word("1", 0.57, 0.40, 0.02),
    word("2,80", 0.67, 0.40, 0.05),
    word("2,80", 0.81, 0.40, 0.05),

    word("CAÑA", 0.14, 0.45, 0.05),
    word("GRANDE", 0.20, 0.45, 0.08),
    word("2", 0.57, 0.45, 0.02),
    word("2,80", 0.67, 0.45, 0.05),
    word("5,60", 0.81, 0.45, 0.05),

    word("CUBATA", 0.14, 0.50, 0.08),
    word("1", 0.57, 0.50, 0.02),
    word("5,50", 0.67, 0.50, 0.05),
    word("5,50", 0.81, 0.50, 0.05),

    word("AGUA", 0.14, 0.55, 0.05),
    word("CON", 0.20, 0.55, 0.04),
    word("GAS", 0.25, 0.55, 0.04),
    word("1", 0.57, 0.55, 0.02),
    word("1,80", 0.67, 0.55, 0.05),
    word("1,80", 0.81, 0.55, 0.05),

    word("Base", 0.64, 0.64, 0.05),
    word("15,91", 0.81, 0.64, 0.06),
    word("4", 0.55, 0.69, 0.02, 0.35),
    word("IVA", 0.64, 0.69, 0.04),
    word("1,59", 0.81, 0.69, 0.05),
    word("Total", 0.64, 0.74, 0.06),
    word("17,50", 0.81, 0.74, 0.06),

    // Raw trace may still contain a footer artefact; structured review must not surface it.
    word("4", 0.18, 0.82, 0.02, 0.3),
  ];

  const page = reconstructOcrPage(1, words);
  expect(page.reviewText).toBeTruthy();
  const review = page.reviewText ?? "";

  expect(review).toContain("Misa");
  expect(review).toContain("Avila Bar");
  expect(review).not.toContain("FONDO AJENO");
  expect(review).toMatch(/DESCRIPCION\s+UDS\s+PRECIO\s+IMPORTE/);
  expect(review).toMatch(/ENERGY\s+1\s+1,80\s+1,80/);
  expect(review).toMatch(/TERCIO GALICIA CERO\s+1\s+2,80\s+2,80/);
  expect(review).toMatch(/CAÑA GRANDE\s+2\s+2,80\s+5,60/);
  expect(review).toMatch(/CUBATA\s+1\s+5,50\s+5,50/);
  expect(review).toMatch(/AGUA CON GAS\s+1\s+1,80\s+1,80/);
  expect(review).toContain("Base: 15,91");
  expect(review).toContain("IVA: 1,59");
  expect(review).not.toContain("IVA 4");
  expect(review).toContain("Total: 17,50");
  expect(review).not.toMatch(/(^|\n)4($|\n)/);
  expect(page.receiptIntegrity).toEqual({
    status: "verified",
    productRows: 5,
    arithmeticRowsChecked: 5,
    arithmeticRowsMatching: 5,
    lineTotalMatchesDocumentTotal: true,
    basePlusTaxMatchesTotal: true,
  });

  // The raw OCR trace is preserved independently for audit/debug purposes.
  expect(page.plainText).toMatch(/(^|\n)4$/);
});

test("generic documents keep geometric review when receipt structure is not proven", () => {
  const page = reconstructOcrPage(1, [
    word("CONTRATO", 0.12, 0.20, 0.10),
    word("DE", 0.23, 0.20, 0.03),
    word("SERVICIOS", 0.27, 0.20, 0.10),
    word("Clausula", 0.12, 0.30, 0.08),
    word("primera", 0.21, 0.30, 0.07),
  ]);

  expect(page.reviewText).toBeUndefined();
  expect(page.layoutText).toContain("CONTRATO");
});


test("structured VAT review preserves a rate only when the percent sign is explicit", () => {
  const page = reconstructOcrPage(1, [
    word("DESCRIPCION", 0.14, 0.30, 0.14),
    word("UDS", 0.56, 0.30, 0.04),
    word("PRECIO", 0.66, 0.30, 0.07),
    word("IMPORTE", 0.80, 0.30, 0.08),
    word("UNO", 0.14, 0.35, 0.05), word("1", 0.57, 0.35, 0.02), word("5,00", 0.67, 0.35, 0.05), word("5,00", 0.81, 0.35, 0.05),
    word("DOS", 0.14, 0.40, 0.05), word("1", 0.57, 0.40, 0.02), word("5,00", 0.67, 0.40, 0.05), word("5,00", 0.81, 0.40, 0.05),
    word("Base", 0.64, 0.55, 0.05), word("9,09", 0.81, 0.55, 0.05),
    word("IVA", 0.60, 0.60, 0.04), word("10", 0.66, 0.60, 0.025), word("%", 0.70, 0.60, 0.015), word("0,91", 0.81, 0.60, 0.05),
    word("Total", 0.64, 0.65, 0.06), word("10,00", 0.81, 0.65, 0.06),
  ]);

  expect(page.reviewText).toContain("IVA 10 %: 0,91");
});


test("receipt integrity flags contradictions instead of silently normalizing them", () => {
  const page = reconstructOcrPage(1, [
    word("DESCRIPCION", 0.14, 0.30, 0.14),
    word("UDS", 0.56, 0.30, 0.04),
    word("PRECIO", 0.66, 0.30, 0.07),
    word("IMPORTE", 0.80, 0.30, 0.08),
    word("UNO", 0.14, 0.35, 0.05), word("1", 0.57, 0.35, 0.02), word("5,00", 0.67, 0.35, 0.05), word("5,00", 0.81, 0.35, 0.05),
    word("DOS", 0.14, 0.40, 0.05), word("2", 0.57, 0.40, 0.02), word("3,00", 0.67, 0.40, 0.05), word("5,00", 0.81, 0.40, 0.05),
    word("Base", 0.64, 0.55, 0.05), word("9,09", 0.81, 0.55, 0.05),
    word("IVA", 0.64, 0.60, 0.04), word("0,91", 0.81, 0.60, 0.05),
    word("Total", 0.64, 0.65, 0.06), word("10,00", 0.81, 0.65, 0.06),
  ]);

  expect(page.receiptIntegrity).toEqual({
    status: "issues",
    productRows: 2,
    arithmeticRowsChecked: 2,
    arithmeticRowsMatching: 1,
    lineTotalMatchesDocumentTotal: true,
    basePlusTaxMatchesTotal: true,
  });

  const result = buildDocumentOcrResult({
    documentId: "98000000-0000-4000-8000-000000000098",
    source: "image_ocr",
    extractor: "test",
    extractedAt: "2026-09-22T18:00:00.000Z",
    pages: [page],
  });
  expect(result.status).toBe("needs_review");
  expect(result.warnings).toContain("receipt_arithmetic_mismatch");
});


test("structured review keeps a nearby merchant title even when no labelled metadata exists", () => {
  const page = reconstructOcrPage(1, [
    word("BAR", 0.28, 0.20, 0.04),
    word("CENTRAL", 0.33, 0.20, 0.08),
    word("DESCRIPCION", 0.14, 0.25, 0.14),
    word("UDS", 0.56, 0.25, 0.04),
    word("PRECIO", 0.66, 0.25, 0.07),
    word("IMPORTE", 0.80, 0.25, 0.08),
    word("UNO", 0.14, 0.30, 0.05), word("1", 0.57, 0.30, 0.02), word("2,00", 0.67, 0.30, 0.05), word("2,00", 0.81, 0.30, 0.05),
    word("DOS", 0.14, 0.35, 0.05), word("1", 0.57, 0.35, 0.02), word("3,00", 0.67, 0.35, 0.05), word("3,00", 0.81, 0.35, 0.05),
    word("Total", 0.64, 0.45, 0.06), word("5,00", 0.81, 0.45, 0.05),
  ]);

  expect(page.reviewText).toContain("BAR CENTRAL");
});
