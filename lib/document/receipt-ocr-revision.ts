import { SERVER_RECEIPT_OCR_GEOMETRY_REVISION } from "./receipt-ocr-provenance";

export const RECEIPT_OCR_REVISION = SERVER_RECEIPT_OCR_GEOMETRY_REVISION;
export const RECEIPT_PARSER_REVISION = "parser_v7" as const;
export const RECEIPT_OCR_METHOD_PREFIX = `image_ocr_receipt_v501:${RECEIPT_OCR_REVISION}:${RECEIPT_PARSER_REVISION}:` as const;
export const RECEIPT_OCR_LEGACY_COMPATIBLE_PREFIXES = [
  "image_ocr_receipt_v501:paddle_layout_v6:parser_v7:",
] as const;

export function isCurrentReceiptOcrMethod(method: unknown) {
  return typeof method === "string" && method.startsWith(RECEIPT_OCR_METHOD_PREFIX);
}

export function isCompatibleReceiptOcrMethod(method: unknown) {
  if (isCurrentReceiptOcrMethod(method)) return true;
  return typeof method === "string" && RECEIPT_OCR_LEGACY_COMPATIBLE_PREFIXES.some((prefix) => method.startsWith(prefix));
}
