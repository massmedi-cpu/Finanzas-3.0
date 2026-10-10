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
  const landscape = metadata.width > metadata.height * 1.12;
  // For landscape images, confidence alone can be misleading if the first
  // pass recognized unrelated background or gibberish. Require at least one
  // recognizable financial cue before skipping alternative orientations.
  const financialCue = words.some((word) =>
    /\b(?:total|importe|factura|recibo|iva|igic|eur)\b|\d+[,.]\d{2}/i.test(word.text)
  );
  if (words.length >= 8 && chars >= 40 && confidence >= 0.78
    && (!landscape || financialCue)) return false;
  return landscape || words.length < 5 || chars < 24 || confidence < 0.62;
}

/**
 * Only the automatic orientation pass needs the color image produced by
 * Tesseract to recover output dimensions. Explicit quarter turns and crop
 * passes already know their geometry; avoid returning large base64 images
 * for each secondary OCR pass.
 */
export function ocrRecognitionOutputFlags(autoRotate: boolean) {
  return { text: true, tsv: true, imageColor: autoRotate };
}
