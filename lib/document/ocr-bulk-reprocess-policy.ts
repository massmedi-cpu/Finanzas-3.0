import { RECEIPT_OCR_METHOD_PREFIX } from "./receipt-ocr-revision";

export const BULK_OCR_REPROCESS_LIMIT = 8 as const;

export type BulkOcrReprocessDocument = {
  id: string;
  mimeType?: string | null;
  storageProvider?: string | null;
  ocrStatus?: string | null;
  ocrData?: unknown;
  links?: unknown[] | null;
};

function storedOcrData(document: BulkOcrReprocessDocument) {
  return document.ocrData && typeof document.ocrData === "object"
    ? document.ocrData as Record<string, unknown>
    : null;
}

function storedOcrMethod(document: BulkOcrReprocessDocument) {
  return String(storedOcrData(document)?.method || "");
}

export function isBulkOcrReprocessCandidate(document: BulkOcrReprocessDocument) {
  if (!document.mimeType?.startsWith("image/")) return false;
  if (document.storageProvider !== "supabase_storage") return false;
  if (Array.isArray(document.links) && document.links.length > 0) return false;
  const status = String(document.ocrStatus || "").toLowerCase();
  if (status === "manual") return false;
  const data = storedOcrData(document);
  const method = storedOcrMethod(document);
  const current = method.startsWith(RECEIPT_OCR_METHOD_PREFIX);
  const alreadyBulkReprocessed = current && data?.bulkReprocessed === true;
  const unresolved = (status === "needs_review" || status === "failed" || status === "error") && !alreadyBulkReprocessed;
  const legacy = method.startsWith("image_ocr_receipt_") && !current;
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
