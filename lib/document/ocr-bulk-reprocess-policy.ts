import { RECEIPT_OCR_METHOD_PREFIX } from "./receipt-ocr-revision";

export const BULK_OCR_REPROCESS_LIMIT = 8 as const;

export type BulkOcrReprocessDocument = {
  id: string;
  mimeType?: string | null;
  ocrStatus?: string | null;
  ocrData?: unknown;
};

function storedOcrMethod(document: BulkOcrReprocessDocument) {
  if (!document.ocrData || typeof document.ocrData !== "object") return "";
  return String((document.ocrData as Record<string, unknown>).method || "");
}

export function isBulkOcrReprocessCandidate(document: BulkOcrReprocessDocument) {
  if (!document.mimeType?.startsWith("image/")) return false;
  const status = String(document.ocrStatus || "").toLowerCase();
  if (status === "manual") return false;
  const unresolved = status === "needs_review" || status === "failed" || status === "error";
  const legacy = !storedOcrMethod(document).startsWith(RECEIPT_OCR_METHOD_PREFIX);
  return unresolved || legacy;
}

export function bulkOcrReprocessPlan(
  documents: BulkOcrReprocessDocument[],
  limit = BULK_OCR_REPROCESS_LIMIT,
) {
  const safeLimit = Math.max(1, Math.min(25, Math.trunc(limit) || BULK_OCR_REPROCESS_LIMIT));
  const candidates = documents.filter(isBulkOcrReprocessCandidate);
  return {
    total: candidates.length,
    selected: candidates.slice(0, safeLimit),
    remaining: Math.max(0, candidates.length - safeLimit),
    limit: safeLimit,
  };
}
