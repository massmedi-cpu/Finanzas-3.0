import { operationalOcrStatus } from "./ocr-operational-status";
import { SERVER_RECEIPT_OCR_ENGINE, SERVER_RECEIPT_OCR_MODEL, SERVER_RECEIPT_OCR_RUNTIME } from "./receipt-ocr-provenance";
import { recognizeServerReceiptImage } from "./server-receipt-ocr";
import { normalizeOcrText } from "./ticket-ocr";
import { recognizeTicketImage, type ImageOcrResult } from "./ticket-ocr-engine";

export type StoredArchiveOcrDocument = {
  documentType: string;
  documentDate: string | null;
  amount: number | null;
  merchant: string | null;
  ocrText: string | null;
  ocrStatus: string;
  ocrData: Record<string, unknown> | null;
  digitalReconstruction: Record<string, unknown> | null;
};

export type StoredArchiveOcrPersistence = {
  documentType: string;
  documentDate: string | null;
  amount: number | null;
  merchant: string | null;
  ocrText: string | null;
  ocrStatus: "complete" | "needs_review" | "failed" | "error";
  ocrData: Record<string, unknown>;
  digitalReconstruction: Record<string, unknown>;
  humanFieldsPreserved: string[];
  method: string;
  validationStatus: string | null;
};

export type StoredArchiveFieldChange = {
  field: "documentType" | "documentDate" | "amount" | "merchant";
  kind: "updated" | "cleared";
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function blank(value: unknown) {
  return value == null || String(value).trim() === "";
}

function sameValue(field: string, left: unknown, right: unknown) {
  if (field === "amount") {
    const a = Number(left);
    const b = Number(right);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.0001;
  }
  return String(left ?? "").trim() === String(right ?? "").trim();
}

function fieldEqual(field: string, left: unknown, right: unknown) {
  const leftBlank = blank(left);
  const rightBlank = blank(right);
  if (leftBlank || rightBlank) return leftBlank && rightBlank;
  return sameValue(field, left, right);
}

function selectMachineValue(
  field: string,
  current: unknown,
  previousMachineValue: unknown,
  nextMachineValue: unknown,
  preserved: string[],
) {
  if (blank(current)) return nextMachineValue;
  if (previousMachineValue !== undefined && sameValue(field, current, previousMachineValue)) return nextMachineValue;
  preserved.push(field);
  return current;
}

export function storedReceiptFieldChanges(
  existing: StoredArchiveOcrDocument,
  persistence: Pick<StoredArchiveOcrPersistence, "documentType" | "documentDate" | "amount" | "merchant">,
): StoredArchiveFieldChange[] {
  const fields: StoredArchiveFieldChange["field"][] = ["documentType", "documentDate", "amount", "merchant"];
  const changes: StoredArchiveFieldChange[] = [];
  for (const field of fields) {
    const before = existing[field];
    const after = persistence[field];
    if (fieldEqual(field, before, after)) continue;
    changes.push({ field, kind: blank(after) ? "cleared" : "updated" });
  }
  return changes;
}

export function buildStoredReceiptPersistence(
  existing: StoredArchiveOcrDocument,
  result: ImageOcrResult,
  processedAt = new Date().toISOString(),
): StoredArchiveOcrPersistence {
  const previousReconstruction = asRecord(existing.digitalReconstruction);
  const previousOcrData = asRecord(existing.ocrData);
  const inferred = result.metadata || {
    documentType: existing.documentType,
    documentDate: existing.documentDate,
    amount: existing.amount,
    merchant: existing.merchant,
    lines: [],
  };
  const preserved: string[] = [];

  const documentType = String(selectMachineValue(
    "documentType",
    existing.documentType,
    previousReconstruction?.documentType,
    inferred.documentType,
    preserved,
  ) || inferred.documentType || "other");
  const selectedDate = selectMachineValue(
    "documentDate",
    existing.documentDate,
    previousReconstruction?.documentDate,
    inferred.documentDate,
    preserved,
  );
  const selectedAmount = selectMachineValue(
    "amount",
    existing.amount,
    previousReconstruction?.amount,
    inferred.amount,
    preserved,
  );
  const selectedMerchant = selectMachineValue(
    "merchant",
    existing.merchant,
    previousReconstruction?.merchant,
    inferred.merchant,
    preserved,
  );

  const previousNormalized = String(previousOcrData?.normalizedText || "").trim();
  const currentNormalized = normalizeOcrText(existing.ocrText || "");
  const textMachineOwned = blank(existing.ocrText) || Boolean(previousNormalized && currentNormalized === previousNormalized);
  const ocrText = textMachineOwned ? result.text : existing.ocrText;
  if (!textMachineOwned) preserved.push("ocrText");

  const visualLayout = asRecord(result.passes[0])?.visualLayout || null;
  const operational = operationalOcrStatus(result.validation?.status, result.rawText);
  const ocrStatus = preserved.length ? "needs_review" : operational;
  const validationStatus = result.validation?.status || null;
  const ocrData: Record<string, unknown> = {
    engine: SERVER_RECEIPT_OCR_ENGINE,
    model: SERVER_RECEIPT_OCR_MODEL,
    runtime: SERVER_RECEIPT_OCR_RUNTIME,
    method: result.method,
    pages: 1,
    confidence: result.confidence,
    passes: result.passes,
    language: "es",
    localProcessing: false,
    automaticOnImport: false,
    imagePreprocessing: Boolean(asRecord(result.passes[0])?.paperDetected),
    geometryLayout: Boolean(visualLayout || result.receiptLayout),
    workerReuse: true,
    assetOrigin: "server-bundled",
    processedAt,
    bulkReprocessed: true,
    sourceOriginal: true,
    rawText: result.rawText,
    normalizedText: result.normalizedText,
    tsv: result.tsv,
    validation: result.validation,
    metrics: result.metrics,
    visualLayout,
    deskewAngle: result.deskewAngle,
    perspectiveCorrected: result.perspectiveCorrected,
  };
  const digitalReconstruction: Record<string, unknown> = {
    generated: true,
    label: ocrStatus === "complete"
      ? "Reconstrucción visual validada desde las coordenadas OCR. El original sigue siendo la referencia."
      : "Reconstrucción geométrica pendiente de revisión. El original y las líneas OCR siguen siendo la referencia.",
    engine: SERVER_RECEIPT_OCR_ENGINE,
    model: SERVER_RECEIPT_OCR_MODEL,
    runtime: SERVER_RECEIPT_OCR_RUNTIME,
    method: result.method,
    documentType: inferred.documentType,
    documentDate: inferred.documentDate,
    amount: inferred.amount,
    merchant: inferred.merchant,
    layoutText: result.layoutText || result.text,
    receiptLayout: result.receiptLayout || null,
    visualLayout,
  };

  return {
    documentType,
    documentDate: blank(selectedDate) ? null : String(selectedDate),
    amount: selectedAmount == null || selectedAmount === "" ? null : Number(selectedAmount),
    merchant: blank(selectedMerchant) ? null : String(selectedMerchant),
    ocrText: blank(ocrText) ? null : String(ocrText),
    ocrStatus,
    ocrData,
    digitalReconstruction,
    humanFieldsPreserved: [...new Set(preserved)],
    method: result.method,
    validationStatus,
  };
}

export async function reprocessStoredReceiptBytes(
  bytes: Buffer,
  existing: StoredArchiveOcrDocument,
  mimeType = "image/jpeg",
) {
  const source = new Blob([new Uint8Array(bytes)], { type: mimeType }) as File;
  const engine = {
    predict: async (input: Blob | HTMLCanvasElement) => {
      if (!(input as Blob).arrayBuffer) throw new Error("server_ocr_blob_required");
      const server = await recognizeServerReceiptImage(Buffer.from(await (input as Blob).arrayBuffer()));
      return [{ image: server.image, items: server.items, metrics: server.metrics, runtime: server.runtime }];
    },
  };
  const result = await recognizeTicketImage(source, engine, () => undefined, "receipt");
  return { result, persistence: buildStoredReceiptPersistence(existing, result) };
}
