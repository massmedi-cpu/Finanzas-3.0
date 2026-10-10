import type { OcrWord } from "../../domain/document-ocr";

/**
 * The first pass already lets Tesseract auto-rotate. Do not automatically
 * spend three more OCR passes on *every* landscape receipt when that pass
 * returned ample high-confidence text. Poor/short results still trigger the
 * full fallback set, regardless of page orientation.
 */
export function ocrNeedsRotationFallback(
  words: Array<Pick<OcrWord, "text" | "confidence">>,
  metadata: { width: number; height: number },
) {
  let chars = 0;
  let weightedConfidence = 0;
  for (const word of words) {
    const length = Math.max(1, word.text.replace(/\s+/g, "").length);
    chars += length;
    weightedConfidence += length * word.confidence;
  }
  const confidence = chars ? weightedConfidence / chars : 0;
  if (words.length >= 8 && chars >= 40 && confidence >= 0.78) return false;
  const landscape = metadata.width > metadata.height * 1.12;
  return landscape || words.length < 5 || chars < 24 || confidence < 0.62;
}
