export const RECEIPT_OCR_REVISION = "paddle_layout_v1" as const;
export const RECEIPT_OCR_METHOD_PREFIX = `image_ocr_receipt_v501:${RECEIPT_OCR_REVISION}:` as const;

export function isCurrentReceiptOcrMethod(method: unknown) {
  return typeof method === "string" && method.startsWith(RECEIPT_OCR_METHOD_PREFIX);
}
