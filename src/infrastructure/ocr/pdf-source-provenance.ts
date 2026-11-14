import type { OcrSource } from "../../domain/document-ocr";

/**
 * Attribute PDF content to its real reader, not merely to the first parser
 * selected. An entirely scanned page with failed visual recognition has no
 * native text even though the PDF.js document was opened successfully.
 */
export function resolvePdfOcrSource(input: {
  nativePageCount: number;
  visualOcrPageCount: number;
  visualOcrAttempted: number;
}): OcrSource {
  if (input.visualOcrPageCount > 0) {
    return input.nativePageCount > 0 ? "hybrid" : "pdf_ocr";
  }
  return input.visualOcrAttempted > 0 && input.nativePageCount === 0
    ? "pdf_ocr" : "pdf_text";
}
