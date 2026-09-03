import { SERVER_RECEIPT_OCR_GEOMETRY_REVISION } from "./receipt-ocr-provenance";

export const RECEIPT_OCR_REVISION = SERVER_RECEIPT_OCR_GEOMETRY_REVISION;
export const RECEIPT_PARSER_REVISION = "parser_v8" as const;
export const RECEIPT_OCR_METHOD_PREFIX = `image_ocr_receipt_v501:${RECEIPT_OCR_REVISION}:${RECEIPT_PARSER_REVISION}:` as const;

// OCR visual que conserva evidencia suficientemente reciente para no volver a
// ejecutar Tesseract. Un parser anterior puede actualizarse sobre el texto ya
// guardado sin releer la imagen ni alterar la procedencia visual.
export const RECEIPT_OCR_COMPATIBLE_PREFIXES = [
  RECEIPT_OCR_METHOD_PREFIX,
  `image_ocr_receipt_v501:${RECEIPT_OCR_REVISION}:parser_v7:`,
  "image_ocr_receipt_v501:paddle_layout_v6:parser_v8:",
  "image_ocr_receipt_v501:paddle_layout_v6:parser_v7:",
] as const;

export function isCurrentReceiptOcrMethod(method: unknown) {
  return typeof method === "string" && method.startsWith(RECEIPT_OCR_METHOD_PREFIX);
}

export function isCompatibleReceiptOcrMethod(method: unknown) {
  return typeof method === "string" && RECEIPT_OCR_COMPATIBLE_PREFIXES.some((prefix) => method.startsWith(prefix));
}

export function hasCurrentReceiptParser(method: unknown) {
  return isCompatibleReceiptOcrMethod(method) && typeof method === "string" && method.includes(`:${RECEIPT_PARSER_REVISION}:`);
}

export function needsReceiptMetadataReparse(method: unknown) {
  return isCompatibleReceiptOcrMethod(method) && !hasCurrentReceiptParser(method);
}

export function upgradeReceiptParserMethod(method: unknown) {
  if (typeof method !== "string" || !isCompatibleReceiptOcrMethod(method)) return null;
  return method.replace(/:parser_v\d+:/, `:${RECEIPT_PARSER_REVISION}:`);
}
