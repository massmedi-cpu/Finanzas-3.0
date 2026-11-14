import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { summarizeDocumentOcrReview } from "../../src/application/document-ocr-review";
import { buildDocumentOcrResult, reconstructOcrPage, type OcrWord } from "../../src/domain/document-ocr";

function word(text: string, x: number, y: number, width = 0.16, confidence = 0.72): OcrWord {
  return { text, confidence, box: { x, y, width, height: 0.03 } };
}

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function reviewFixture(confidence = 0.72, explicitIssuer = false) {
  const issuerWords = explicitIssuer
    ? [word("Emisor:", 0.12, 0.08, 0.11, confidence),
      word("BAR", 0.24, 0.08, 0.06, confidence),
      word("CENTRAL", 0.31, 0.08, 0.14, confidence)]
    : [word("BAR", 0.12, 0.08, 0.07, confidence),
      word("CENTRAL", 0.20, 0.08, 0.14, confidence)];
  const page = reconstructOcrPage(1, [
    ...issuerWords,
    word("Fecha:", 0.12, 0.18, 0.10, confidence),
    word("03/10/2026", 0.24, 0.18, 0.18, confidence),
    word("Total", 0.58, 0.72, 0.09, confidence),
    word("17,50", 0.76, 0.72, 0.10, confidence),
  ]);
  return buildDocumentOcrResult({
    documentId: "99000000-0000-4000-8000-000000000099",
    source: "image_ocr",
    extractor: "quality-10.0.79",
    extractedAt: "2026-10-05T08:00:00.000Z",
    pages: [page],
  });
}

test("10.0.79 prioriza emisor, fecha y total dudosos sin convertir ausencias en falsas alarmas", () => {
  const review = summarizeDocumentOcrReview(reviewFixture());
  const priorityKeys = review.priorityReviewFields.map((field) => field.key);

  expect(priorityKeys).toEqual(expect.arrayContaining(["issuer", "date", "totalCents"]));
  expect(priorityKeys).toHaveLength(3);
  expect(review.nextAction).toBe("review");
  expect(review.nextActionLabel).toMatch(/comercio \/ emisor/i);
  expect(review.nextActionLabel).toMatch(/fecha/i);
  expect(review.nextActionLabel).toMatch(/total/i);

  const taxId = review.financialFields.find((field) => field.key === "taxId");
  expect(taxId?.trust).toBe("not_detected");
  expect(taxId?.requiresAttention).toBe(false);
  expect(taxId?.priority).toBe("none");
});

test("10.0.79 conserva evidencia literal y localizable junto al valor financiero interpretado", () => {
  const review = summarizeDocumentOcrReview(reviewFixture());
  const total = review.financialFields.find((field) => field.key === "totalCents");
  const date = review.financialFields.find((field) => field.key === "date");

  expect(total?.value).toBe(1750);
  expect(total?.rawValue).toBe("17,50");
  expect(total?.evidence).toEqual([
    expect.objectContaining({ pageNumber: 1, rawText: expect.stringMatching(/Total.*17,50/i) }),
  ]);
  expect(date?.value).toBe("2026-10-03");
  expect(date?.rawValue).toBe("03/10/2026");
  expect(date?.evidence[0]?.lineId).toMatch(/^p1-l/);
});

test("REC-OCR-109 · confianza alta de lectura no acredita un emisor sin etiqueta", () => {
  const review = summarizeDocumentOcrReview(reviewFixture(0.95));
  // A 95% character-recognition confidence cannot establish that an
  // unlabelled header is the issuer rather than the recipient or a slogan.
  expect(review.priorityReviewFields.map((field) => field.key)).toEqual(["issuer"]);
  expect(review.financialFields.filter((field) => field.requiresAttention).map((field) => field.key)).toEqual(["issuer"]);
  expect(review.financialFields.find((field) => field.key === "date")?.trust).toBe("reliable");
  expect(review.financialFields.find((field) => field.key === "totalCents")?.trust).toBe("reliable");
  expect(review.nextAction).toBe("review");
  expect(review.nextActionLabel).toMatch(/comercio \/ emisor/i);
});

test("REC-OCR-110 · un emisor identificado explícitamente sí permite confirmar campos fiables", () => {
  const review = summarizeDocumentOcrReview(reviewFixture(0.95, true));
  expect(review.financialFields.find((field) => field.key === "issuer")).toEqual(
    expect.objectContaining({ trust: "reliable", value: "BAR CENTRAL", requiresAttention: false }),
  );
  expect(review.priorityReviewFields).toHaveLength(0);
  expect(review.financialFields.filter((field) => field.requiresAttention)).toHaveLength(0);
  expect(review.nextAction).toBe("confirm");
});

test("10.0.79 mantiene separadas las tres capas de trazabilidad cuando existe texto estructurado", () => {
  const component = source("app/documents/ocr-page-review-workbench.tsx");
  const css = source("app/documents/ocr-review-workbench.module.css");

  expect(component).toContain("Texto estructurado para revisión");
  expect(component).toContain("Reconstrucción geométrica");
  expect(component).toContain("OCR bruto");
  expect(component).toContain("ocr-trace-structured-");
  expect(component).toContain("ocr-trace-layout-");
  expect(component).toContain("ocr-trace-raw-");
  expect(component).toContain("No sustituye al OCR bruto");
  expect(css).toContain(".traceGridThree");
  expect(css).toContain("@media(max-width:980px)");
  expect(css).toContain("white-space:pre-wrap");
});
