import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OcrReviewHttpError, isDefinitelyRejectedOcrReview } from "../../src/application/document-ocr-confirmation-integrity";
import { sameConfirmedOcrValues, type OcrConfirmedValues } from "../../src/application/document-ocr-confirmation-integrity";

const confirmed: OcrConfirmedValues = {
  type: "invoice",
  documentDate: "2026-10-13",
  documentTime: "12:34",
  issuerName: "SUMINISTROS ANDALUCÍA SL",
  issuerTaxId: "B12345674",
  documentNumber: "A-2026-0081",
  billingPeriod: "septiembre 2026",
  taxBaseCents: 10000,
  taxesCents: 2100,
  totalCents: 12100,
  paymentMethod: "Tarjeta",
  lineItems: [
    { description: "Servicio", quantity: 2, unitPriceCents: 5000, totalCents: 10000 },
    { description: "Descuento", quantity: null, unitPriceCents: null, totalCents: null },
  ],
  notes: "Verificado con factura original",
};

test("REC-OCR-132 · OCR confirmation must match the entire human-reviewed record", () => {
  expect(sameConfirmedOcrValues({ ...confirmed }, confirmed)).toBe(true);
  const edits: Record<string, unknown> = {
    type: "ticket",
    documentDate: "2026-10-12",
    documentTime: "12:35",
    issuerName: "OTRA EMPRESA",
    issuerTaxId: "12345678Z",
    documentNumber: "A-2026-0082",
    billingPeriod: "octubre 2026",
    taxBaseCents: 9900,
    taxesCents: 2101,
    totalCents: 12000,
    paymentMethod: "Efectivo",
    notes: "No coincide",
  };
  for (const [key, value] of Object.entries(edits)) {
    const observed = { ...confirmed, [key]: value };
    expect(sameConfirmedOcrValues(observed, confirmed), key).toBe(false);
  }
});

test("REC-OCR-133 · same total cannot validate wrong invoice products or incomplete history", () => {
  const alteredItems = {
    ...confirmed,
    lineItems: [
      { ...confirmed.lineItems[0], description: "No corresponde a la factura" },
      ...confirmed.lineItems.slice(1),
    ],
  };
  expect(alteredItems.totalCents).toBe(confirmed.totalCents);
  expect(sameConfirmedOcrValues(alteredItems, confirmed)).toBe(false);
  expect(sameConfirmedOcrValues({ ...confirmed, lineItems: [...confirmed.lineItems].reverse() }, confirmed)).toBe(false);
  expect(sameConfirmedOcrValues({ ...confirmed, lineItems: [] }, confirmed)).toBe(false);
  expect(sameConfirmedOcrValues({ type: confirmed.type, totalCents: confirmed.totalCents }, confirmed)).toBe(false);
  expect(sameConfirmedOcrValues(null, confirmed)).toBe(false);
  expect(sameConfirmedOcrValues(confirmed, null)).toBe(false);
});


test("REC-OCR-CONF-033 · un 5xx con código invalid_ nunca autoriza confirmar dos veces", () => {
  const safe = [
    new Error("invalid_document_total"),
    new Error("invalid_document_line_0_quantity"),
    new OcrReviewHttpError(400, "invalid_document_total"),
    new OcrReviewHttpError(400, "invalid_document_line_199_unit_price"),
    new OcrReviewHttpError(400, "invalid_json"),
    new OcrReviewHttpError(413, "document_review_too_large"),
  ];
  for (const error of safe) expect(isDefinitelyRejectedOcrReview(error), error.message).toBe(true);
  const ambiguous = [
    new OcrReviewHttpError(503, "invalid_document_total"),
    new OcrReviewHttpError(502, "invalid_document_line_0_quantity"),
    new OcrReviewHttpError(409, "invalid_document_total"),
    new OcrReviewHttpError(200, "invalid_document_total"),
    new OcrReviewHttpError(400, "invalid_arbitrary_database_message"),
    new OcrReviewHttpError(400, "invalid_document_line_201_total"),
    new OcrReviewHttpError(413, "invalid_document_total"),
    new Error("invalid_arbitrary_database_message"),
    new Error("request_failed"),
    new TypeError("Failed to fetch"),
    null,
  ];
  for (const error of ambiguous) expect(isDefinitelyRejectedOcrReview(error)).toBe(false);
  const panel = readFileSync(join(process.cwd(), "app/documents/ocr-review-panel.tsx"), "utf8");
  expect(panel).toContain("isDefinitelyRejectedOcrReview(caught)");
  expect(panel).not.toContain('code.startsWith("invalid_")');
  expect(panel).toContain("new OcrReviewHttpError(response.status, code)");
});
