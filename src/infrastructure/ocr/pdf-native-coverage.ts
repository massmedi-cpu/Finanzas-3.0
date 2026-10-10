import type { OcrWord } from "../../domain/document-ocr";

/**
 * Scanned PDF pages sometimes retain only an embedded page number or stamp.
 * A nonempty selectable text layer is not proof that the invoice is readable.
 * Fall back to visual OCR for sparse native text, keeping the original text
 * if recognition cannot improve it.
 */
export function pdfNativeTextNeedsVisualOcr(words: OcrWord[]) {
  if (!words.length) return true;
  const text = words.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim();
  const chars = [...text].filter((char) => /[\p{L}\p{N}]/u.test(char)).length;
  if (/\b(?:total|a pagar|importe factura|base imponible)\b[^\n]{0,75}\d+[.,]\d{2}\b/i.test(text)) return false;
  return (words.length < 5 && chars < 80) || chars < 35;
}
