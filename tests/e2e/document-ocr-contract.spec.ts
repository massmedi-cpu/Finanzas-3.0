import { expect, test } from "@playwright/test";
import { buildDocumentOcrResult, reconstructOcrPage, type OcrWord } from "../../src/domain/document-ocr";

const documentId = "93000000-0000-4000-8000-000000000093";

function word(text: string, confidence: number, x: number, y: number, width: number, height = 0.035): OcrWord {
  return { text, confidence, box: { x, y, width, height } };
}

test("F11 OCR contract reconstructs skewed receipt rows while preserving columns", () => {
  const page = reconstructOcrPage(1, [
    word("SUPERMERCADO", 0.98, 0.31, 0.04, 0.36, 0.05),
    word("LECHE", 0.94, 0.06, 0.20, 0.14),
    word("1,50", 0.97, 0.82, 0.214, 0.11),
    word("PAN", 0.93, 0.06, 0.273, 0.09),
    word("0,85", 0.96, 0.82, 0.26, 0.11),
    word("TOTAL", 0.99, 0.56, 0.42, 0.14, 0.045),
    word("2,35", 0.99, 0.82, 0.414, 0.11, 0.045),
  ]);

  expect(page.lines).toHaveLength(4);
  expect(page.lines[0].text).toBe("SUPERMERCADO");
  expect(page.lines[0].alignment).toBe("center");
  expect(page.lines[1].text).toBe("LECHE 1,50");
  expect(page.lines[2].text).toBe("PAN 0,85");
  expect(page.lines[3].text).toBe("TOTAL 2,35");
  expect(page.layoutText).toContain("LECHE");
  expect(page.layoutText).toContain("1,50");
  expect(page.layoutText.indexOf("1,50")).toBeGreaterThan(page.layoutText.indexOf("LECHE") + 10);
});

test("F11 OCR contract keeps financial data read-only and forces human review semantics", () => {
  const page = reconstructOcrPage(1, [
    word("FACTURA", 0.96, 0.08, 0.05, 0.20),
    word("TOTAL", 0.98, 0.58, 0.80, 0.13),
    word("54,04", 0.99, 0.82, 0.80, 0.12),
  ]);
  const result = buildDocumentOcrResult({
    documentId,
    source: "image_ocr",
    extractor: "test-provider",
    extractedAt: "2026-09-07T06:00:00Z",
    pages: [page],
  });

  expect(result.status).toBe("ready");
  expect(result.plainText).toContain("TOTAL 54,04");
  expect(result.principles).toEqual({
    bankSource: "read_only",
    financialWrites: false,
    requiresHumanReview: true,
    preservesGeometry: true,
  });
  expect(result.pages[0].lines[1].words[1].box.x).toBeCloseTo(0.82, 4);
});

test("F11 OCR contract marks low-confidence extraction for review instead of inventing certainty", () => {
  const page = reconstructOcrPage(1, [
    word("TOTAL", 0.58, 0.58, 0.80, 0.13),
    word("54,04", 0.51, 0.82, 0.802, 0.12),
  ]);
  const result = buildDocumentOcrResult({
    documentId,
    source: "image_ocr",
    extractor: "test-provider",
    extractedAt: "2026-09-07T06:00:00Z",
    pages: [page],
  });

  expect(result.status).toBe("needs_review");
  expect(result.warnings).toContain("low_confidence");
  expect(result.confidence).toBeLessThan(0.65);
});

test("F11 OCR geometry rejects boxes outside the source instead of silently clipping evidence", () => {
  expect(() => reconstructOcrPage(1, [word("FUERA", 0.9, 0.95, 0.1, 0.2)])).toThrow("invalid_ocr_box");
  expect(() => reconstructOcrPage(0, [])).toThrow("invalid_ocr_page_number");
});
