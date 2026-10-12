import type { OcrWord } from "../../domain/document-ocr";

/**
 * Exact enough for the native-vs-visual OCR decision: reject percentages,
 * numeric prefixes and 3-decimal ratios rather than treating them as money.
 * This is evidence detection, not financial amount parsing or persistence.
 */
function hasMoneyEvidence(text: string) {
  const decimals = /(?:^|[^\d.,])(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2})(?![\d.,]|\s*%)/;
  const currencyBefore = /(?:€\s*|\b(?:eur|euros?)\s+)(?:\d{1,3}(?:\.\d{3})+|\d+)(?![\d.,]|\s*%)/;
  const currencyAfter = /(?:^|[^\d.,])(?:\d{1,3}(?:\.\d{3})+|\d+)\s*€(?![\d.,])/;
  return decimals.test(text) || currencyBefore.test(text) || currencyAfter.test(text);
}

function hasInvoiceTotalEvidence(words: OcrWord[]) {
  const text = words.map((word) => word.text).join(" ")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  for (const label of text.matchAll(/\b(?:total|importe total|a pagar)\b/g)) {
    const tail = text.slice((label.index ?? 0) + label[0].length, (label.index ?? 0) + label[0].length + 56);
    if (hasMoneyEvidence(tail)) return true;
  }
  return false;
}

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
  // Five independent text spans covering a substantial amount of an
  // invoice are already a usable native layer, even when it contains no
  // price (a cover page or a detailed header). Preserve that fast path;
  // a single long hidden footer cannot claim the same structural coverage.
  if (chars >= 210 && words.length >= 5) return false;
  if (chars >= 260) return false;
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const financialLabel = /\b(?:total|importe|subtotal|base imponible|precio|a pagar|iva|igic|cuota)\b/.test(normalized);
  return !(financialLabel && hasMoneyEvidence(normalized));
}

/**
 * OCR on a scanned invoice may be shorter than an unrelated selectable
 * footer. Prefer a confidently recognized invoice TOTAL over the footer,
 * instead of comparing character counts alone. Native text still wins when
 * it already carries an identifiable total or visual evidence is weak.
 */
export function pdfVisualOcrImprovesNative(nativeWords: OcrWord[], visualWords: OcrWord[]) {
  if (!visualWords.length) return false;
  if (!nativeWords.length) return true;
  const nativeChars = nativeWords.reduce((sum, word) => sum + word.text.trim().length, 0);
  const visualChars = visualWords.reduce((sum, word) => sum + word.text.trim().length, 0);
  if ((visualWords.length > nativeWords.length && visualChars >= nativeChars)
    || visualChars >= Math.max(nativeChars + 30, nativeChars * 1.5)) return true;

  if (!hasInvoiceTotalEvidence(visualWords) || hasInvoiceTotalEvidence(nativeWords)) return false;
  const confidences = visualWords
    .map((word) => word.confidence)
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  const meanConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0;
  return meanConfidence >= 0.55;
}
