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
  // A lone selectable TOTAL on a scanned invoice must not prevent OCR of
  // the body of the page. Text quantity and layout coverage matter more
  // than recognizing one financially relevant label in a tiny native layer.
  if (chars < 110 && (words.length < 5 || chars < 70)) return true;

  // Hybrid PDF scanners sometimes append 100–260 selectable characters of
  // boilerplate (company footer, legal notice, export metadata) on top of a
  // raster invoice. A nonempty, moderately long text layer is not sufficient
  // proof that the total, tax base or line items can actually be read.
  // Keep native extraction when it already carries BOTH an invoice field
  // label and a monetary value; otherwise attempt visual OCR while retaining
  // the native words if the visual pass fails or is less informative.
  if (chars >= 260) return false;
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const financialLabel = /\b(?:total|importe|subtotal|base imponible|precio|a pagar|iva|igic|cuota)\b/.test(normalized);
  const financialAmount = /(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2}|\d+\s*€|€\s*\d+|\b(?:eur|euros?)\s+\d+)/i.test(normalized);
  return !(financialLabel && financialAmount);
}
