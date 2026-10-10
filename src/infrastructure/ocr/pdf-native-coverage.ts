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
  return chars < 110 && (words.length < 5 || chars < 70);
}
