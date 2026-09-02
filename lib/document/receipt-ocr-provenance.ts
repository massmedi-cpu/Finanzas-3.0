export const SERVER_RECEIPT_OCR_RUNTIME = "server-tesseract-7" as const;
export const SERVER_RECEIPT_OCR_ENGINE = "Tesseract.js 7 · servidor" as const;
export const SERVER_RECEIPT_OCR_MODEL = "spa.traineddata" as const;
export const SERVER_RECEIPT_OCR_GEOMETRY_REVISION = "server_tesseract_7_geometry_v1" as const;

export function receiptOcrRuntime(value: unknown) {
  return value === SERVER_RECEIPT_OCR_RUNTIME ? SERVER_RECEIPT_OCR_RUNTIME : null;
}

export function receiptOcrVariant(paperDetected: boolean) {
  return paperDetected ? "server_tesseract_7_paper_geometry" : "server_tesseract_7_geometry";
}
