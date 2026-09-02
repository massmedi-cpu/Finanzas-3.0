import { isCompatibleReceiptOcrMethod } from "./receipt-ocr-revision";

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

export function storedOcrMethod(document: BulkOcrReprocessDocument) {
  return String(storedOcrData(document)?.method || "");
}

export function isLegacyReceiptOcrDocument(document: BulkOcrReprocessDocument) {
  const method = storedOcrMethod(document);
  return method.startsWith("image_ocr_receipt_") && !isCompatibleReceiptOcrMethod(method);
}

export function isBulkOcrReprocessCandidate(document: BulkOcrReprocessDocument) {
  if (!document.mimeType?.startsWith("image/")) return false;
  if (document.storageProvider !== "supabase_storage") return false;
  const status = String(document.ocrStatus || "").toLowerCase();
  if (status === "manual") return false;

  const data = storedOcrData(document);
  const method = storedOcrMethod(document);
  const compatible = isCompatibleReceiptOcrMethod(method);
  const legacy = isLegacyReceiptOcrDocument(document);

  // Una revisión antigua debe poder migrarse incluso si el documento ya está
  // archivado o vinculado. El reprocesado conserva document_id, original y
  // asociaciones; excluirlo por tener vínculos dejaría datos históricos para
  // siempre en un motor obsoleto. Las correcciones manuales siguen bloqueadas.
  if (legacy) return true;

  // Los reintentos operativos del motor actual son más conservadores: si el
  // documento ya está vinculado no se reabre automáticamente por un simple
  // needs_review/failed/error.
  if (Array.isArray(document.links) && document.links.length > 0) return false;
  const alreadyBulkReprocessed = compatible && data?.bulkReprocessed === true;
  const unresolved = (status === "needs_review" || status === "failed" || status === "error") && !alreadyBulkReprocessed;
  return unresolved;
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
