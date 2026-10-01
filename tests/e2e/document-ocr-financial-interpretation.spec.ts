import { expect, test } from "@playwright/test";
import { runDocumentOcr, type DocumentOcrProvider } from "../../src/application/document-ocr-service";

const documentId = "93400000-0000-4000-8000-000000000034";

type WordInput = [text: string, confidence: number, x: number, y: number, width?: number];

function words(rows: WordInput[]) {
  return rows.map(([text, confidence, x, y, width = Math.max(0.04, text.length * 0.012)]) => ({
    text,
    confidence,
    box: { x, y, width, height: 0.035 },
  }));
}

function provider(rows: WordInput[]): DocumentOcrProvider {
  return {
    supports: () => true,
    extract: async () => ({
      source: "image_ocr",
      extractor: "pre034-fixture-v1",
      pages: [{ pageNumber: 1, words: words(rows) }],
    }),
  };
}

async function interpret(rows: WordInput[]) {
  return runDocumentOcr({
    documentId,
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/jpeg",
    originalFileName: "documento.jpg",
    provider: provider(rows),
    now: () => new Date("2026-10-01T10:00:00Z"),
  });
}

test("PRE-034 interprets a generic Spanish invoice without inventing financial values", async () => {
  const result = await interpret([
    ["SERVICIOS", 0.97, 0.08, 0.06], ["DEL", 0.97, 0.23, 0.06], ["SUR", 0.97, 0.31, 0.06],
    ["CIF", 0.97, 0.08, 0.12], ["B12345678", 0.98, 0.18, 0.12],
    ["Factura", 0.97, 0.08, 0.18], ["F-2026-0042", 0.98, 0.22, 0.18],
    ["Fecha", 0.97, 0.08, 0.24], ["01/10/2026", 0.99, 0.20, 0.24], ["Hora", 0.97, 0.50, 0.24], ["12:45", 0.99, 0.61, 0.24],
    ["Periodo", 0.96, 0.08, 0.30], ["09/2026", 0.96, 0.22, 0.30],
    ["Servicio", 0.96, 0.08, 0.45], ["mensual", 0.96, 0.20, 0.45], ["1.000,00", 0.98, 0.76, 0.45],
    ["Base", 0.98, 0.08, 0.62], ["1.000,00", 0.99, 0.76, 0.62],
    ["IVA", 0.98, 0.08, 0.68], ["210,00", 0.99, 0.78, 0.68],
    ["TOTAL", 0.99, 0.08, 0.74], ["1.210,00", 0.99, 0.76, 0.74],
    ["Pago", 0.96, 0.08, 0.82], ["con", 0.96, 0.17, 0.82], ["tarjeta", 0.98, 0.23, 0.82],
  ]);

  const ocr = result.interpretation;
  expect(ocr.issuerName.value).toContain("SERVICIOS");
  expect(ocr.taxId.value).toBe("B12345678");
  expect(ocr.documentDate.value).toBe("2026-10-01");
  expect(ocr.documentTime.value).toBe("12:45");
  expect(ocr.documentNumber.value).toBe("F-2026-0042");
  expect(ocr.period.value).toBe("09/2026");
  expect(ocr.baseCents.value).toBe(100000);
  expect(ocr.taxCents.value).toBe(21000);
  expect(ocr.totalCents.value).toBe(121000);
  expect(ocr.paymentMethod.value).toBe("Tarjeta");
  expect(ocr.lines.some((line) => line.description.includes("Servicio") && line.totalCents === 100000)).toBe(true);
  expect(ocr.validation.basePlusTaxMatchesTotal).toBe(true);
  expect(ocr.taxId.confidence).toBe("reliable");
  expect(ocr.totalCents.evidence[0]).toMatchObject({ pageNumber: 1 });
  expect(ocr.totalCents.evidence[0].box.width).toBeGreaterThan(0);
});

test("PRE-034 labels weak evidence as doubtful and absent values as not detected", async () => {
  const result = await interpret([
    ["Tienda", 0.62, 0.08, 0.08],
    ["Fecha", 0.61, 0.08, 0.22], ["01/10/2026", 0.62, 0.20, 0.22],
    ["TOTAL", 0.60, 0.08, 0.70], ["12,30", 0.61, 0.78, 0.70],
  ]);

  expect(result.interpretation.documentDate.value).toBe("2026-10-01");
  expect(result.interpretation.documentDate.confidence).toBe("doubtful");
  expect(result.interpretation.totalCents.value).toBe(1230);
  expect(result.interpretation.totalCents.confidence).toBe("doubtful");
  expect(result.interpretation.taxId).toMatchObject({ value: null, confidence: "not_detected", score: null, evidence: [] });
  expect(result.interpretation.taxCents.value).toBeNull();
  expect(result.interpretation.paymentMethod.value).toBeNull();
});

test("PRE-034 keeps recognition and interpretation separate and preserves read-only guardrails", async () => {
  const result = await interpret([
    ["TOTAL", 0.99, 0.08, 0.70], ["1.234,56", 0.99, 0.75, 0.70],
  ]);

  expect(result.plainText).toContain("TOTAL");
  expect(result.interpretation.totalCents.value).toBe(123456);
  expect(result.interpretation.contractVersion).toBe(1);
  expect(result.principles).toMatchObject({
    bankSource: "read_only",
    financialWrites: false,
    requiresHumanReview: true,
  });
});
