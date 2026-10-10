import type { OcrWord } from "./document-ocr";

/**
 * Some scanned PDFs retain just a selectable stamp, title or page number.
 * A native text layer does not always prove the invoice is text-accessible.
 * This classifier deliberately has no renderer or OCR worker imports.
 */
export function pdfNativeTextNeedsVisualOcr(words: OcrWord[]) {
  if (!words.length) return true;
  const text = words.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim();
  const chars = [...text].filter((char) => /[\p{L}\p{N}]/u.test(char)).length;
  if (/\b(?:total|a pagar|importe factura|base imponible)\b[^\n]{0,75}\d+[.,]\d{2}\b/i.test(text)) return false;
  return (words.length < 5 && chars < 80) || chars < 35;
}
