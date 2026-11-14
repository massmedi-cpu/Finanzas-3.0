/**
 * Financial App OCR confirmation is one indivisible human-reviewed payload.
 * A revision number and matching total alone do not establish that the
 * confirmed issuer, timestamp, items and notes were actually persisted.
 *
 * Mirrors the reviewedValues keys returned by financial_app.confirm_document_ocr_review
 * and financial_app.document_ocr_history (read-only inspected 2026-10-13).
 */
export type OcrConfirmedLineItem = {
  description: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number | null;
};

export type OcrConfirmedValues = {
  type: "ticket" | "invoice" | "other";
  documentDate: string | null;
  documentTime: string | null;
  issuerName: string | null;
  issuerTaxId: string | null;
  documentNumber: string | null;
  billingPeriod: string | null;
  taxBaseCents: number | null;
  taxesCents: number | null;
  totalCents: number | null;
  paymentMethod: string | null;
  lineItems: OcrConfirmedLineItem[];
  notes: string;
};

export function sameConfirmedOcrValues(observed: unknown, expected: OcrConfirmedValues | null): boolean {
  if (!expected || !observed || typeof observed !== "object" || Array.isArray(observed)) return false;
  const actual = observed as Record<string, unknown>;
  const keys = [
    "type", "documentDate", "documentTime", "issuerName", "issuerTaxId",
    "documentNumber", "billingPeriod", "taxBaseCents", "taxesCents",
    "totalCents", "paymentMethod", "notes",
  ] as const;
  if (keys.some((key) => actual[key] !== expected[key])) return false;
  const observedLines = actual.lineItems;
  if (!Array.isArray(observedLines) || observedLines.length !== expected.lineItems.length) return false;
  return expected.lineItems.every((expectedRow, index) => {
    const row: unknown = observedLines[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const item = row as Record<string, unknown>;
    return item.description === expectedRow.description
      && item.quantity === expectedRow.quantity
      && item.unitPriceCents === expectedRow.unitPriceCents
      && item.totalCents === expectedRow.totalCents;
  });
}


/** Preserve HTTP status: the error code by itself cannot prove that a remote PATCH did not commit. */
export class OcrReviewHttpError extends Error {
  readonly status: number;
  constructor(status: number, code: string) {
    super(code);
    this.name = "OcrReviewHttpError";
    this.status = status;
  }
}

const REJECTED_REVIEW_FIELDS = new Set([
  "invalid_document_review",
  "invalid_document_id",
  "invalid_document_ocr_run_id",
  "invalid_document_type",
  "invalid_document_notes",
  "invalid_document_date",
  "invalid_document_time",
  "invalid_document_issuer",
  "invalid_document_issuer_tax_id",
  "invalid_document_number",
  "invalid_document_billing_period",
  "invalid_document_tax_base",
  "invalid_document_taxes",
  "invalid_document_total",
  "invalid_document_payment_method",
  "invalid_document_line_items",
]);
const REJECTED_REVIEW_LINE = /^invalid_document_line_(?:0|[1-9]\d?|1\d{2})_(?:description|quantity|unit_price|total)$/;

/**
 * A pre-persistence rejection must be unambiguous. A 5xx response, a network
 * failure, or arbitrary "invalid_" text MUST force an independent history read
 * before the human is allowed to submit a second confirmation.
 */
export function isDefinitelyRejectedOcrReview(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = error.message;
  if (error instanceof OcrReviewHttpError) {
    if (error.status === 413 && code === "document_review_too_large") return true;
    if (error.status !== 400) return false;
    if (code === "invalid_json") return true;
  } else if (!/^invalid_document_(?:tax_base|taxes|total|line_(?:0|[1-9]\d?|1\d{2})_(?:quantity|unit_price|total))$/.test(code)) {
    // Only editor-local format validation, with no HTTP request sent.
    return false;
  }
  return REJECTED_REVIEW_FIELDS.has(code) || REJECTED_REVIEW_LINE.test(code);
}
