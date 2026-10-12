import type { OcrWord } from "../../domain/document-ocr";

/**
 * Exact enough for the native-vs-visual OCR decision: reject percentages,
 * numeric prefixes and 3-decimal ratios rather than treating them as money.
 * This is evidence detection, not financial amount parsing or persistence.
 */
function hasMoneyEvidence(text: string) {
  const decimals = /(?:^|[^\d.,])(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2})(?!\d|[.,]\d|\s*%)/;
  const currencyBefore = /(?:€\s*|\b(?:eur|euros?)\s+)(?:\d{1,3}(?:\.\d{3})+|\d+)(?!\d|[.,]\d|\s*%)/;
  const currencyAfter = /(?:^|[^\d.,])(?:\d{1,3}(?:\.\d{3})+|\d+)\s*(?:€|\b(?:eur|euros?)\b)(?!\d|[.,]\d)/;
  return decimals.test(text) || currencyBefore.test(text) || currencyAfter.test(text);
}

function hasInvoiceTotalEvidence(words: OcrWord[]) {
  const text = words.map((word) => word.text).join(" ")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  for (const label of text.matchAll(/\b(?:total|importe total|a pagar)\b/g)) {
    const tail = text.slice((label.index ?? 0) + label[0].length, (label.index ?? 0) + label[0].length + 56);
    // TOTAL without a value is not proved by an unrelated IVA, tax base,
    // reference number or unit price printed after the heading.
    const competingField = tail.search(/\b(?:i\.?v\.?a|i\.?g\.?i\.?c|base imponible|subtotal|cuota|precio unitario|referencia|numero de factura)\b/);
    const ownField = competingField < 0 ? tail : tail.slice(0, competingField);
    if (hasMoneyEvidence(ownField)) return true;
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
  // A long selectable legal footer can contain hundreds of characters while
  // the actual invoice is exclusively rasterized above it. Neither character
  // count nor the number of native spans proves page-wide text coverage.
  // Preserve a positively identified native invoice total, but try visual
  // OCR when every selectable span is restricted to the bottom fifth.
  const footerOnly = words.every(({ box }) =>
    Number.isFinite(box.y) && Number.isFinite(box.height)
    && box.y >= 0.8 && box.y <= 1 && box.height >= 0
    && box.y + box.height <= 1.001);
  if (footerOnly && !hasInvoiceTotalEvidence(words)) return true;

  // Repeated text spans packed into a tiny top/header/sidebar band do not
  // constitute whole-page invoice coverage either. An OCR-selectable banner
  // may surround a rasterized invoice body. Keep a real native TOTAL, but
  // offer bounded visual recovery when the selectable layer occupies less
  // than one fifth of page height regardless of its character count.
  let top = 1;
  let bottom = 0;
  let validGeometry = true;
  for (const { box } of words) {
    if (!Number.isFinite(box.y) || !Number.isFinite(box.height)
      || box.y < 0 || box.y > 1 || box.height < 0 || box.y + box.height > 1.001) {
      validGeometry = false;
      break;
    }
    top = Math.min(top, box.y);
    bottom = Math.max(bottom, box.y + box.height);
  }
  if (validGeometry && bottom - top < 0.18 && !hasInvoiceTotalEvidence(words)) return true;

  // A rotated filing stamp or legal strip can run all the way down a PDF's
  // margin. Vertical coverage alone then looks complete, but no text from
  // the invoice body was actually extracted. Check horizontal placement
  // independently. Keep a genuinely selectable invoice TOTAL authoritative.
  const marginOnly = words.every(({ box }) =>
    Number.isFinite(box.x) && Number.isFinite(box.width)
    && box.x >= 0 && box.width >= 0 && box.x + box.width <= 1.001
    && (box.x + box.width <= 0.2 || box.x >= 0.8));
  if (marginOnly && !hasInvoiceTotalEvidence(words)) return true;

  // Some hybrid scanners retain selectable headers AND legal footers
  // while the invoice body (including its line items and final amount)
  // is raster-only. Their bounding span is full-page even though neither
  // edge region proves that the financial body was extracted. Only trigger
  // this path when both edges have text but the central body is empty.
  // This avoids treating ordinary short native invoices or full text
  // pages as scanner overlays.
  if (validGeometry && !hasInvoiceTotalEvidence(words)
    && words.some(({ box }) => box.y <= 0.15)
    && words.some(({ box }) => box.y >= 0.8)
    && !words.some(({ box }) => box.y < 0.8 && box.y + box.height > 0.2)) {
    return true;
  }

  if (chars >= 210 && words.length >= 5) return false;
  // A single enormous native text item can still be hidden PDF metadata,
  // not a readable invoice. For that case require actual financial evidence.
  if (chars >= 260 && words.length >= 2) return false;
  // One hidden PDF text span is not a full invoice merely because it
  // includes a tax percentage or VAT amount after an empty TOTAL heading.
  // Require the invoice total itself before bypassing raster recognition.
  if (words.length === 1) return !hasInvoiceTotalEvidence(words);
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
  // A lengthier but unrelated OCR result must never erase a known native
  // invoice total. Recognition volume alone does not establish relevance.
  const nativeTotal = hasInvoiceTotalEvidence(nativeWords);
  const visualTotal = hasInvoiceTotalEvidence(visualWords);
  // A native invoice total is deterministic selectable financial evidence.
  // Additional raster words (even if numerous) cannot be trusted to replace
  // the original with a conflicting OCR amount. Preserve the native text;
  // visual OCR still recovers scanned pages when no native total is present.
  if (nativeTotal) return false;

  // A badly recognized raster may generate more words than the native layer,
  // but quantity is not quality. Preserve the readable original and mark the
  // hybrid page unverified instead of replacing it with low-confidence noise.
  const confidences = visualWords
    .map((word) => word.confidence)
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  const meanConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0;
  if (meanConfidence < 0.35) return false;

  const nativeChars = nativeWords.reduce((sum, word) => sum + word.text.trim().length, 0);
  const visualChars = visualWords.reduce((sum, word) => sum + word.text.trim().length, 0);
  if ((visualWords.length > nativeWords.length && visualChars >= nativeChars)
    || visualChars >= Math.max(nativeChars + 30, nativeChars * 1.5)) return true;

  if (!visualTotal || nativeTotal) return false;
  return meanConfidence >= 0.55;
}
