import {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
  type OcrPassEvidence,
} from "./ticket-ocr";
import { prepareReceiptImage } from "./receipt-image-preprocessor";
import {
  parseReceiptTsvLayout,
  parseTsvWords,
  receiptLayoutToText,
  tsvLines,
  type ReceiptLayout,
} from "./receipt-layout";
import { cleanReceiptMerchant, reconstructReceiptEvidence } from "./receipt-reconstruction";
import { validateReceiptFinancials, type ReceiptValidation } from "./receipt-financial-validator";
import { RECEIPT_OCR_METHOD_PREFIX } from "./receipt-ocr-revision";

export {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
} from "./ticket-ocr";

export { validateReceiptFinancials } from "./receipt-financial-validator";
export { RECEIPT_OCR_METHOD_PREFIX, RECEIPT_OCR_REVISION, isCurrentReceiptOcrMethod } from "./receipt-ocr-revision";

type OcrWorker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (
    input: HTMLCanvasElement | File,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{ data?: { text?: string; tsv?: string; confidence?: number } }>;
};

type ReadPass = {
  variant: string;
  rawText: string;
  normalizedText: string;
  layoutText: string;
  tsv: string;
  confidence: number | null;
  receiptLayout: ReceiptLayout | null;
  durationMs: number;
  score: number;
};

type ReceiptBounds = { left: number; top: number; width: number; height: number };

const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const elapsed = (started: number) => Math.round((now() - started) * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function visibleChars(text: string) {
  return (text.match(/[\p{L}\d]/gu) || []).length;
}

function recognitionNoise(text: string) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const tokens = lines.flatMap((line) => line.split(/\s+/)).filter(Boolean);
  const singleLetterTokens = tokens.filter((token) => /^\p{L}$/u.test(token)).length;
  const symbolHeavyLines = lines.filter((line) => {
    const compact = line.replace(/\s/g, "");
    if (!compact) return false;
    const useful = (compact.match(/[\p{L}\d€%.,:()\/+\-]/gu) || []).length;
    return useful / compact.length < 0.62;
  }).length;
  const tinyNoiseLines = lines.filter((line) => {
    const letters = (line.match(/\p{L}/gu) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    return line.length <= 16 && letters + digits <= 3;
  }).length;
  return Math.min(32, singleLetterTokens * 0.55 + symbolHeavyLines * 2.2 + tinyNoiseLines * 1.25);
}

function textScore(text: string, confidence: number | null, layout: ReceiptLayout | null, hint: DocumentTypeHint) {
  const metadata = inferDocumentMetadata(text, hint);
  const meaningfulLines = normalizeOcrText(text).split(/\r?\n/).filter((line) => visibleChars(line) >= 4).length;
  let score = (confidence ?? 0) * 0.8 + Math.min(12, meaningfulLines * 0.65);
  score += Math.min(10, (layout?.items.length || 0) * 2);
  if (metadata.documentDate) score += 4;
  if (metadata.merchant) score += 4;
  if (/\bTOTAL\b/i.test(text)) score += 2;
  score -= Math.min(22, (layout?.unparsedBody?.length || 0) * 2.75);
  score -= recognitionNoise(text);
  return Math.round(score * 10) / 10;
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[index];
}

/**
 * Derives the physical receipt text region from OCR geometry only. It has no
 * merchant/product vocabulary and never rewrites OCR text. The first clean
 * grayscale observation is therefore also the locator for the precision pass.
 */
function detectReceiptTextBounds(tsv: string, width: number, height: number): ReceiptBounds {
  const full = { left: 0, top: 0, width, height };
  const words = parseTsvWords(tsv).filter((word) => word.conf >= 18 && word.height < height * 0.12);
  if (words.length < 10) return full;

  const lines = tsvLines(tsv);
  const anchor = lines.find((line) => /DESCRIP/i.test(line.plain) && /PRECI/i.test(line.plain));
  if (anchor) {
    const anchorLeft = Math.min(...anchor.words.map((word) => word.left));
    const anchorRight = Math.max(...anchor.words.map((word) => word.left + word.width));
    const anchorWidth = Math.max(1, anchorRight - anchorLeft);
    const horizontalMargin = anchorWidth * 0.1;
    const left = clamp(anchorLeft - horizontalMargin, 0, width - 1);
    const right = clamp(anchorRight + horizontalMargin, left + 1, width);
    const aligned = lines.filter((line) => {
      const useful = line.words.filter((word) => word.conf >= 18);
      if (!useful.length) return false;
      const inside = useful.filter((word) => {
        const center = word.left + word.width / 2;
        return center >= left && center <= right;
      }).length;
      return inside / useful.length >= 0.55;
    });
    if (aligned.length >= 6) {
      const topRaw = Math.min(...aligned.map((line) => line.top));
      const bottomRaw = Math.max(...aligned.map((line) => line.bottom));
      const contentHeight = Math.max(1, bottomRaw - topRaw);
      const top = clamp(topRaw - contentHeight * 0.055, 0, height - 1);
      const bottom = clamp(bottomRaw + contentHeight * 0.07, top + 1, height);
      const expandedLeft = clamp(left - anchorWidth * 0.025, 0, width - 1);
      const expandedRight = clamp(right + anchorWidth * 0.025, expandedLeft + 1, width);
      const candidate = {
        left: Math.floor(expandedLeft),
        top: Math.floor(top),
        width: Math.ceil(expandedRight - expandedLeft),
        height: Math.ceil(bottom - top),
      };
      const areaRatio = (candidate.width * candidate.height) / Math.max(1, width * height);
      if (candidate.width >= width * 0.35 && candidate.height >= height * 0.35 && areaRatio < 0.94) return candidate;
    }
  }

  const useful = words.filter((word) => word.conf >= 28);
  if (useful.length < 14) return full;
  let left = quantile(useful.map((word) => word.left), 0.04);
  let right = quantile(useful.map((word) => word.left + word.width), 0.96);
  let top = quantile(useful.map((word) => word.top), 0.015);
  let bottom = quantile(useful.map((word) => word.top + word.height), 0.985);
  const contentWidth = right - left;
  const contentHeight = bottom - top;
  if (contentWidth < width * 0.3 || contentHeight < height * 0.3) return full;
  left = clamp(left - contentWidth * 0.08, 0, width - 1);
  right = clamp(right + contentWidth * 0.08, left + 1, width);
  top = clamp(top - contentHeight * 0.055, 0, height - 1);
  bottom = clamp(bottom + contentHeight * 0.07, top + 1, height);
  const candidate = { left: Math.floor(left), top: Math.floor(top), width: Math.ceil(right - left), height: Math.ceil(bottom - top) };
  const areaRatio = (candidate.width * candidate.height) / Math.max(1, width * height);
  return areaRatio < 0.94 ? candidate : full;
}

function cropCanvas(source: HTMLCanvasElement, bounds: ReceiptBounds) {
  if (bounds.left === 0 && bounds.top === 0 && bounds.width === source.width && bounds.height === source.height) return source;
  const output = document.createElement("canvas");
  output.width = bounds.width;
  output.height = bounds.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Canvas no disponible");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(source, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  return output;
}

function offsetReceiptLayout(layout: ReceiptLayout | null, topOffset: number) {
  if (!layout || !topOffset) return layout;
  return {
    ...layout,
    items: layout.items.map((item) => ({
      ...item,
      top: Number.isFinite(item.top) ? Number(item.top) + topOffset : item.top,
      bottom: Number.isFinite(item.bottom) ? Number(item.bottom) + topOffset : item.bottom,
    })),
    summary: layout.summary.map((line) => ({ ...line, top: Number.isFinite(line.top) ? Number(line.top) + topOffset : line.top })),
    unparsedBody: (layout.unparsedBody || []).map((row) => ({
      ...row,
      top: Number.isFinite(row.top) ? Number(row.top) + topOffset : row.top,
      bottom: Number.isFinite(row.bottom) ? Number(row.bottom) + topOffset : row.bottom,
    })),
  } satisfies ReceiptLayout;
}

async function readPass(
  worker: OcrWorker,
  input: HTMLCanvasElement | File,
  psm: string,
  variant: string,
  hint: DocumentTypeHint,
  topOffset = 0,
): Promise<ReadPass> {
  const started = now();
  await worker.setParameters?.({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  const result = await worker.recognize(input, {}, { text: true, tsv: true });
  const rawText = String(result.data?.text || "");
  const normalizedText = normalizeOcrText(rawText);
  const tsv = String(result.data?.tsv || "");
  const receiptLayout = offsetReceiptLayout(parseReceiptTsvLayout(tsv), topOffset);
  const confidence = Number.isFinite(result.data?.confidence) ? Number(result.data?.confidence) : null;
  return {
    variant,
    rawText,
    normalizedText,
    layoutText: preserveOcrLayout(rawText),
    tsv,
    confidence,
    receiptLayout,
    durationMs: elapsed(started),
    score: textScore(normalizedText, confidence, receiptLayout, hint),
  };
}

function reconstructPasses(passes: ReadPass[], merchant: string | null) {
  const reconstructed = reconstructReceiptEvidence(
    passes.map((pass) => pass.rawText),
    passes.map((pass) => pass.receiptLayout),
    merchant,
  );
  const validation = validateReceiptFinancials(reconstructed.layout, passes.map((pass) => pass.rawText));
  return { ...reconstructed, validation };
}

function shouldRunSecondary(primary: ReadPass, validation: ReceiptValidation, hint: DocumentTypeHint) {
  if (hint !== "receipt") return visibleChars(primary.rawText) < 100 || (primary.confidence ?? 0) < 45;
  const metadata = inferDocumentMetadata(primary.rawText, hint);
  if (validation.status !== "complete") return true;
  if ((primary.confidence ?? 0) < 72) return true;
  if (visibleChars(primary.rawText) < 120) return true;
  if (!metadata.documentDate || !metadata.merchant) return true;
  if (!primary.receiptLayout?.items.length) return true;
  if ((primary.receiptLayout.unparsedBody?.length || 0) > 0) return true;
  return false;
}

function pickPrimaryRaw(passes: ReadPass[]) {
  return [...passes].sort((a, b) => b.score - a.score || (b.confidence ?? 0) - (a.confidence ?? 0))[0] || passes[0];
}

function chooseMetadata(passes: ReadPass[], layout: ReceiptLayout | null, validation: ReceiptValidation, hint: DocumentTypeHint): DocumentMetadata {
  const combined = passes.map((pass) => pass.rawText).join("\n\n--- OCR PASS ---\n\n");
  const metadata = inferDocumentMetadata(combined, hint);
  const merchant = passes
    .map((pass) => ({ value: cleanReceiptMerchant(inferDocumentMetadata(pass.rawText, hint).merchant), score: pass.score }))
    .filter((candidate): candidate is { value: string; score: number } => Boolean(candidate.value))
    .sort((a, b) => b.score - a.score || a.value.length - b.value.length)[0]?.value
    || cleanReceiptMerchant(metadata.merchant);
  const printedTotal = validation.printedTotal;
  return {
    ...metadata,
    amount: printedTotal ?? metadata.amount,
    merchant,
    lines: layout ? receiptLayoutToText(layout).split(/\r?\n/).filter(Boolean) : metadata.lines,
  };
}

function passEvidence(pass: ReadPass): OcrPassEvidence {
  return {
    variant: pass.variant,
    confidence: pass.confidence,
    score: pass.score,
    rawText: pass.rawText,
    normalizedText: pass.normalizedText,
    tsv: pass.tsv,
    durationMs: pass.durationMs,
  };
}

/**
 * Canonical receipt OCR.
 *
 * The clean grayscale observation is deliberately first: it preserves literal
 * characters and supplies geometry. A second precision observation is then run
 * only over the detected receipt region. Raw evidence is never rewritten by
 * reconstruction and every inferred structured value remains independently
 * auditable against the stored OCR passes.
 */
export async function recognizeTicketImage(
  file: File,
  worker: OcrWorker,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = "receipt",
): Promise<ImageOcrResult> {
  const totalStarted = now();
  onProgress(0.04, "Preparando imagen");
  const prepared = await prepareReceiptImage(file);
  onProgress(0.18, prepared.paperDetected ? "Documento detectado" : "Localizando contenido del ticket");

  onProgress(0.3, "Leyendo texto original");
  const primary = await readPass(worker, prepared.grayscale, "4", "grayscale_literal_psm4", hint);
  const passes: ReadPass[] = [primary];
  let reconstructionStarted = now();
  let reconstructed = reconstructPasses(passes, inferDocumentMetadata(primary.rawText, hint).merchant);
  let reconstructionMs = elapsed(reconstructionStarted);
  let secondaryMs = 0;

  if (shouldRunSecondary(primary, reconstructed.validation, hint)) {
    const bounds = detectReceiptTextBounds(primary.tsv, prepared.adaptive.width, prepared.adaptive.height);
    const precisionInput = cropCanvas(prepared.adaptive, bounds);
    const cropped = precisionInput !== prepared.adaptive;
    onProgress(0.58, cropped ? "Leyendo con precisión solo el ticket" : "Completando zonas dudosas");
    const secondary = await readPass(worker, precisionInput, "6", cropped ? "adaptive_receipt_region_psm6" : "adaptive_precision_psm6", hint, bounds.top);
    secondaryMs = secondary.durationMs;
    passes.push(secondary);
    reconstructionStarted = now();
    reconstructed = reconstructPasses(passes, inferDocumentMetadata(passes.map((pass) => pass.rawText).join("\n"), hint).merchant);
    reconstructionMs += elapsed(reconstructionStarted);
  }

  onProgress(0.82, "Reconstruyendo ticket");
  const bestRaw = pickPrimaryRaw(passes);
  const layoutText = reconstructed.layout ? receiptLayoutToText(reconstructed.layout) : preserveOcrLayout(bestRaw.rawText);
  onProgress(0.9, "Validando importes");
  const metadata = chooseMetadata(passes, reconstructed.layout, reconstructed.validation, hint);
  const metrics = {
    preprocessMs: prepared.durationMs,
    primaryMs: primary.durationMs,
    secondaryMs,
    reconstructionMs: Math.round(reconstructionMs * 10) / 10,
    totalMs: elapsed(totalStarted),
  };
  onProgress(0.97, "Guardando resultado");

  return {
    text: bestRaw.rawText,
    rawText: bestRaw.rawText,
    normalizedText: bestRaw.normalizedText,
    layoutText,
    tsv: bestRaw.tsv,
    confidence: bestRaw.confidence,
    method: `${RECEIPT_OCR_METHOD_PREFIX}${bestRaw.variant}`,
    passes: passes.map(passEvidence),
    receiptLayout: reconstructed.layout,
    metadata,
    validation: reconstructed.validation,
    metrics,
    deskewAngle: prepared.deskewAngle,
    perspectiveCorrected: prepared.perspectiveCorrected,
  };
}
