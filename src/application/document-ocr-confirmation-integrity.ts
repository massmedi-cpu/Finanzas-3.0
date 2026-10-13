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
  if (!Array.isArray(actual.lineItems) || actual.lineItems.length !== expected.lineItems.length) return false;
  return expected.lineItems.every((expectedRow, index) => {
    const row: unknown = actual.lineItems[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const item = row as Record<string, unknown>;
    return item.description === expectedRow.description
      && item.quantity === expectedRow.quantity
      && item.unitPriceCents === expectedRow.unitPriceCents
      && item.totalCents === expectedRow.totalCents;
  });
}
