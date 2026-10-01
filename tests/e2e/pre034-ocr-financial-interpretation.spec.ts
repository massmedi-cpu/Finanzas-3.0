import { expect, test } from "@playwright/test";
import { interpretDocumentOcrFinancially, OCR_FIELD_TRUST_LABELS } from "../../src/domain/document-ocr-financial-interpretation";
import type { DocumentOcrResult, OcrLine } from "../../src/domain/document-ocr";

function line(id: string, text: string, confidence = 0.95, y = 0.1): OcrLine {
  return {
    id,
    text,
    confidence,
    alignment: "left",
    box: { x: 0.05, y, width: 0.9, height: 0.04 },
    words: [{ text, confidence, box: { x: 0.05, y, width: 0.9, height: 0.04 } }],
  };
}

function result(lines: OcrLine[]): DocumentOcrResult {
  return {
    contractVersion: 1,
    documentId: "11111111-1111-4111-8111-111111111111",
    status: "ready",
    source: "image_ocr",
    extractor: "test",
    extractedAt: "2026-10-01T12:00:00.000Z",
    confidence: 0.95,
    plainText: lines.map((item) => item.text).join("\n"),
    pages: [{ pageNumber: 1, lines, plainText: lines.map((item) => item.text).join("\n"), layoutText: lines.map((item) => item.text).join("\n") }],
    warnings: [],
    principles: { bankSource: "read_only", financialWrites: false, requiresHumanReview: true, preservesGeometry: true },
  };
}

test("extracts the Axioma financial fields without mutating raw OCR", async () => {
  const raw = result([
    line("issuer", "Comercio: TIENDA SEVILLA SL", 0.96, 0.05),
    line("tax", "CIF B12345678", 0.94, 0.10),
    line("date", "Fecha: 01/10/2026 13:45", 0.93, 0.15),
    line("number", "Factura: F-2026-0042", 0.91, 0.20),
    line("period", "Periodo: 01/09/2026 - 30/09/2026", 0.90, 0.25),
    line("item", "Servicio mensual 100,00", 0.88, 0.35),
    line("base", "Base imponible 100,00", 0.97, 0.70),
    line("vat", "IVA 21 % 21,00", 0.96, 0.75),
    line("total", "TOTAL 121,00 €", 0.98, 0.80),
    line("pay", "Pago con tarjeta VISA", 0.86, 0.85),
  ]);
  const originalText = raw.plainText;
  const interpretation = interpretDocumentOcrFinancially(raw);

  expect(interpretation.issuer.value).toBe("TIENDA SEVILLA SL");
  expect(interpretation.taxId.value).toBe("B12345678");
  expect(interpretation.date.value).toBe("2026-10-01");
  expect(interpretation.time.value).toBe("13:45");
  expect(interpretation.documentNumber.value).toBe("F-2026-0042");
  expect(interpretation.period.value).toBe("01/09/2026 - 30/09/2026");
  expect(interpretation.taxBaseCents.value).toBe(10000);
  expect(interpretation.taxesCents.value).toBe(2100);
  expect(interpretation.totalCents.value).toBe(12100);
  expect(interpretation.paymentMethod.value).toBe("Tarjeta");
  expect(interpretation.lines.some((item) => item.description.includes("Servicio mensual") && item.totalCents === 10000)).toBeTruthy();
  expect(interpretation.warnings).not.toContain("base_plus_tax_mismatch");
  expect(raw.plainText).toBe(originalText);
  expect(raw.principles).toEqual({ bankSource: "read_only", financialWrites: false, requiresHumanReview: true, preservesGeometry: true });
});

test("does not invent absent fields and marks weak evidence as doubtful", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("issuer", "PANADERIA DEL BARRIO", 0.60),
    line("total", "TOTAL 1.234,56 €", 0.60, 0.8),
  ]));

  expect(interpretation.issuer.trust).toBe("doubtful");
  expect(interpretation.totalCents.value).toBe(123456);
  expect(interpretation.totalCents.trust).toBe("doubtful");
  expect(interpretation.taxId.value).toBeNull();
  expect(interpretation.taxId.trust).toBe("not_detected");
  expect(interpretation.date.value).toBeNull();
  expect(OCR_FIELD_TRUST_LABELS.not_detected).toBe("No detectado");
  expect(OCR_FIELD_TRUST_LABELS.doubtful).toBe("Dudoso");
  expect(OCR_FIELD_TRUST_LABELS.reliable).toBe("Fiable");
});

test("flags inconsistent base plus tax instead of coercing the source", async () => {
  const raw = result([
    line("base", "Base imponible 100,00", 0.95),
    line("vat", "IVA 21,00", 0.95, 0.7),
    line("total", "TOTAL 130,00", 0.95, 0.8),
  ]);
  const interpretation = interpretDocumentOcrFinancially(raw);
  expect(interpretation.warnings).toContain("base_plus_tax_mismatch");
  expect(interpretation.totalCents.value).toBe(13000);
  expect(raw.plainText).toContain("TOTAL 130,00");
});
