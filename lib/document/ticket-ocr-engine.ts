import {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  parseEuroValue,
  recognizeTicketImage as recognizeRectifiedTicket,
  scoreReceiptCandidate,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
} from "./ticket-ocr-v307";

export { inferDocumentMetadata, normalizeOcrText, preserveOcrLayout, parseEuroValue };
export type { DocumentMetadata, DocumentTypeHint, ImageOcrResult };

type Recognition = { data?: { text?: string; confidence?: number } };
type Worker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (input: File | HTMLCanvasElement, options?: Record<string, unknown>, output?: Record<string, boolean>) => Promise<Recognition>;
};

type SupplementalPass = {
  text: string;
  layoutText: string;
  confidence: number | null;
};

const visibleLength = (value: string) => value.replace(/\s/g, "").length;
const letterCount=(value:string)=>(value.match(/\p{L}/gu)||[]).length;
const wordCount=(value:string)=>(value.match(/[\p{L}]{2,}/gu)||[]).length;
const compactWords = (value: string) => value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);

function repairReceiptNumbers(line: string) {
  if (/\b(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/.test(line)) return line;
  return line
    .replace(/\b(\d)(\d{2})(?=\s+\d+[.,]\d{2}\b)/g, "$1.$2")
    .replace(/\b(\d{1,2})\s+(\d{2})(?=\s+\d+[.,]\d{2}\b)/g, "$1.$2")
    .replace(/(\bTOTAL\b[^\d]{0,12})(\d{1,4})\s+(\d{2})(?=\s*(?:€|EUR)\b)/gi, "$1$2,$3");
}

function numericSignature(line: string) {
  const repaired = repairReceiptNumbers(line);
  const values = repaired.match(/\d+(?:[.,:]\d{2})/g) || [];
  if (!values.length) return "";
  return values.slice(-2).map((value) => value.replace(",", ".")).join("|");
}

function lexicalOverlap(a: string, b: string) {
  const left = new Set(compactWords(a).filter((word) => /[A-Z]/.test(word)));
  const right = new Set(compactWords(b).filter((word) => /[A-Z]/.test(word)));
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const word of left) if (right.has(word)) hits += 1;
  return hits / Math.max(left.size, right.size);
}

function lineQuality(raw: string) {
  const line = repairReceiptNumbers(raw).trim();
  const letters = letterCount(line);
  const words = wordCount(line);
  const decimals = (line.match(/\d+[.,]\d{2}\b/g) || []).length;
  const singleNoise = (line.match(/(?:^|\s)[A-Z](?=\s|$)/g) || []).length;
  const collapsedPrice = (line.match(/\b\d{3,4}(?=\s+\d+[.,]\d{2}\b)/g) || []).length;
  let score = letters * 0.22 + words * 1.15 + decimals * 2.7;
  score -= singleNoise * 2.1 + collapsedPrice * 3.2;
  if (/\b(TOTAL|IVA|BASE|HORA|FECHA|MESA|CAMARERO|PRECIO|IMPORTE)\b/i.test(line)) score += 3;
  if (line.length > 4 && line.length < 80) score += 1;
  return score;
}

export function mergeReceiptTexts(primaryText: string, alternateText: string) {
  const primary = normalizeOcrText(primaryText).split(/\r?\n/).filter(Boolean);
  const alternate = normalizeOcrText(alternateText).split(/\r?\n/).filter(Boolean);
  if (!primary.length) return normalizeOcrText(alternateText);
  if (!alternate.length) return normalizeOcrText(primaryText);
  const used = new Set<number>();
  const merged = primary.map((source, sourceIndex) => {
    const signature = numericSignature(source);
    let bestIndex = -1;
    let bestFit = -Infinity;
    for (let index = 0; index < alternate.length; index += 1) {
      if (used.has(index)) continue;
      const candidate = alternate[index];
      const candidateSignature = numericSignature(candidate);
      const distance = Math.abs(index - sourceIndex);
      let fit = -distance * 0.35;
      if (signature && candidateSignature === signature) fit += 8;
      else if (signature || candidateSignature) fit -= 3;
      fit += lexicalOverlap(source, candidate) * 5;
      if (fit > bestFit) {
        bestFit = fit;
        bestIndex = index;
      }
    }
    if (bestIndex < 0 || bestFit < 1.5) return repairReceiptNumbers(source);
    const candidate = alternate[bestIndex];
    const candidateSignature=numericSignature(candidate);
    const sourceQuality = lineQuality(source);
    const candidateQuality = lineQuality(candidate);
    const samePrices=Boolean(signature)&&candidateSignature===signature;
    const richerMatchingLine=samePrices&&candidateQuality>=sourceQuality-0.25&&(
      letterCount(candidate)>=letterCount(source)+1||
      wordCount(candidate)>=wordCount(source)+1
    );
    if (candidateQuality > sourceQuality + 0.9 || richerMatchingLine) {
      used.add(bestIndex);
      return repairReceiptNumbers(candidate);
    }
    return repairReceiptNumbers(source);
  });
  return normalizeOcrText(merged.join("\n"));
}

function textQuality(text: string) {
  return normalizeOcrText(text).split(/\r?\n/).filter(Boolean).reduce((sum, line) => sum + lineQuality(line), 0);
}

async function makeSupplementalCanvas(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const maxWidth = 3400;
    const maxHeight = 6200;
    const scale = Math.min(1.15, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas no disponible");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = "grayscale(1) contrast(1.45)";
    context.drawImage(bitmap, 0, 0, width, height);
    context.filter = "none";
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function sparseReceiptPass(file: File, worker: Worker): Promise<SupplementalPass> {
  const canvas = await makeSupplementalCanvas(file);
  await worker.setParameters?.({
    tessedit_pageseg_mode: "11",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  const result = await worker.recognize(canvas, {}, { text: true });
  const raw = String(result.data?.text || "");
  return {
    text: normalizeOcrText(raw),
    layoutText: preserveOcrLayout(raw),
    confidence: Number.isFinite(result.data?.confidence) ? Number(result.data?.confidence) : null,
  };
}

export async function recognizeTicketImage(
  file: File,
  worker: Worker,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = null,
): Promise<ImageOcrResult> {
  const base = await recognizeRectifiedTicket(
    file,
    worker,
    (value, label) => onProgress(Math.min(0.78, value * 0.78), label),
    hint,
  );

  try {
    onProgress(0.82, "Verificando líneas y nombres del ticket");
    const sparse = await sparseReceiptPass(file, worker);
    onProgress(0.93, "Combinando las lecturas más fiables");
    const mergedText = mergeReceiptTexts(base.text, sparse.text);
    const mergedLayout = mergeReceiptTexts(base.layoutText || base.text, sparse.layoutText || sparse.text);
    const baseQuality = textQuality(base.text);
    const mergedQuality = textQuality(mergedText);
    const mergedConfidence = sparse.confidence == null
      ? base.confidence
      : base.confidence == null
        ? sparse.confidence
        : Math.round((base.confidence * 0.65 + sparse.confidence * 0.35) * 10) / 10;
    const sparseScore = scoreReceiptCandidate(sparse.text, sparse.confidence, hint);
    const mergedScore = scoreReceiptCandidate(mergedText, mergedConfidence, hint);
    const metadata = inferDocumentMetadata(mergedText, hint);
    const baseMetadata = inferDocumentMetadata(base.text, hint);
    const metadataSafe =
      (!baseMetadata.documentDate || metadata.documentDate === baseMetadata.documentDate) &&
      (baseMetadata.amount == null || metadata.amount === baseMetadata.amount) &&
      (!baseMetadata.merchant || Boolean(metadata.merchant));
    const useMerged =
      metadataSafe &&
      visibleLength(mergedText) >= visibleLength(base.text) * 0.82 &&
      mergedQuality >= baseQuality - 0.5;

    onProgress(0.98, "Validando el resultado final");
    return {
      text: useMerged ? mergedText : base.text,
      layoutText: useMerged ? mergedLayout : base.layoutText,
      confidence: useMerged ? mergedConfidence : base.confidence,
      method: useMerged ? "image_ocr_receipt_v308:consensus_sparse" : "image_ocr_receipt_v308:rectified_fallback",
      passes: [
        ...base.passes,
        { variant: "sparse_original_psm11", confidence: sparse.confidence, score: Math.round(sparseScore * 10) / 10 },
        { variant: "consensus_line_merge", confidence: mergedConfidence, score: Math.round(mergedScore * 10) / 10 },
      ],
    };
  } catch {
    onProgress(0.98, "Validando el resultado final");
    return {
      ...base,
      method: "image_ocr_receipt_v308:rectified_fallback",
    };
  }
}
