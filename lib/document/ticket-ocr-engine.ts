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
import { parseReceiptTsvLayout, receiptLayoutToText, type ReceiptLayout } from "./receipt-layout";
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

const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const elapsed = (started: number) => Math.round((now() - started) * 10) / 10;

function visibleChars(text: string) {
  return (text.match(/[\p{L}\d]/gu) || []).length;
}

function textScore(text: string, confidence: number | null, layout: ReceiptLayout | null, hint: DocumentTypeHint) {
  const metadata = inferDocumentMetadata(text, hint);
  let score = (confidence ?? 0) * 0.45 + Math.min(25, visibleChars(text) / 18);
  score += Math.min(30, (layout?.items.length || 0) * 6);
  score += Math.min(12, (layout?.header.length || 0) * 1.2);
  score += Math.min(8, (layout?.footer.length || 0) * 1.1);
  if (metadata.documentDate) score += 5;
  if (metadata.merchant) score += 5;
  if (/\bTOTAL\b/i.test(text)) score += 5;
  score -= Math.min(24, (layout?.unparsedBody?.length || 0) * 6);
  return Math.round(score * 10) / 10;
}

async function readPass(worker: OcrWorker, input: HTMLCanvasElement | File, psm: string, variant: string, hint: DocumentTypeHint): Promise<ReadPass> {
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
  const receiptLayout = parseReceiptTsvLayout(tsv);
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
  if ((primary.confidence ?? 0) < 62) return true;
  if (visibleChars(primary.rawText) < 120) return true;
  if (!metadata.documentDate || !metadata.merchant) return true;
  if (!primary.receiptLayout?.items.length) return true;
  if ((primary.receiptLayout.unparsedBody?.length || 0) > 0) return true;
  return false;
}

function pickPrimaryRaw(passes: ReadPass[]) {
  return [...passes].sort((a, b) => b.score - a.score)[0] || passes[0];
}

function chooseMetadata(passes: ReadPass[], layout: ReceiptLayout | null, validation: ReceiptValidation, hint: DocumentTypeHint): DocumentMetadata {
  const combined = passes.map((pass) => pass.rawText).join("\n\n--- OCR PASS ---\n\n");
  const metadata = inferDocumentMetadata(combined, hint);
  const merchantCandidates = passes
    .map((pass) => inferDocumentMetadata(pass.rawText, hint).merchant)
    .map(cleanReceiptMerchant)
    .filter((value): value is string => Boolean(value));
  const merchant = merchantCandidates.sort((a, b) => b.length - a.length)[0] || cleanReceiptMerchant(metadata.merchant);
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
 * There is deliberately no legacy-engine catch/fallback here. A failed canonical
 * pass fails visibly; a weak pass is refined once and then validated. Raw text
 * and TSV evidence are kept independently from the reconstructed ticket.
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
  onProgress(0.16, prepared.paperDetected ? "Detectando documento" : "Documento completo detectado");
  onProgress(0.24, "Corrigiendo perspectiva");
  onProgress(0.31, "Corrigiendo inclinación e iluminación");

  onProgress(0.38, "Leyendo contenido");
  const primary = await readPass(worker, prepared.adaptive, "6", "adaptive_psm6", hint);
  const passes: ReadPass[] = [primary];
  let reconstructionStarted = now();
  let reconstructed = reconstructPasses(passes, inferDocumentMetadata(primary.rawText, hint).merchant);
  let reconstructionMs = elapsed(reconstructionStarted);
  let secondaryMs = 0;

  if (shouldRunSecondary(primary, reconstructed.validation, hint)) {
    onProgress(0.62, "Completando zonas dudosas");
    const secondary = await readPass(worker, prepared.grayscale, "4", "grayscale_psm4", hint);
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
