import {
  estimateDeskewFromSamples,
  inferDocumentMetadata,
  localAdaptiveThreshold,
  normalizeOcrText,
  parseEuroValue,
  preserveOcrLayout,
  recognizeTicketImage as recognizeLegacyTicket,
  reconstructTsvReceipt,
  scoreReceiptCandidate,
  shouldRefineReceiptCandidates,
  extractReceiptTotal,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
} from "./ticket-ocr-geometry";
import {
  parseReceiptTsvLayout,
  parseTsvWords,
  receiptLayoutToText,
  tsvLines,
  type ReceiptLayout,
} from "./receipt-layout";
import { cleanReceiptMerchant, reconstructReceiptEvidence } from "./receipt-reconstruction";

export { inferDocumentMetadata, normalizeOcrText, preserveOcrLayout, parseEuroValue };
export type { DocumentMetadata, DocumentTypeHint, ImageOcrResult };

type Recognition = { data?: { text?: string; confidence?: number; tsv?: string } };
type Worker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (input: File | HTMLCanvasElement, options?: Record<string, unknown>, output?: Record<string, boolean>) => Promise<Recognition>;
};
type Bounds = { left: number; top: number; width: number; height: number };
type PaperGeometry = { top: number; bottom: number; topLeft: number; topRight: number; bottomLeft: number; bottomRight: number };
type Candidate = {
  variant: string;
  text: string;
  layoutText: string;
  confidence: number | null;
  tsv: string;
  receiptLayout: ReceiptLayout | null;
  score: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const letterCount = (value: string) => (value.match(/\p{L}/gu) || []).length;
const wordCount = (value: string) => (value.match(/[\p{L}]{2,}/gu) || []).length;
const compactWords = (value: string) => value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.round((ordered.length - 1) * q)))];
}

function repairReceiptNumbers(line: string) {
  if (/\b(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/.test(line)) return line;
  return line
    .replace(/\b(\d)(\d{2})(?=\s+\d+[.,]\d{2}\b)/g, "$1.$2")
    .replace(/\b(\d{1,2})\s+(\d{2})(?=\s+\d+[.,]\d{2}\b)/g, "$1.$2")
    .replace(/(\bTOTAL\b[^\d]{0,12})(\d{1,4})\s+(\d{2})(?=\s*(?:€|EUR)\b)/gi, "$1$2,$3");
}

function normalizeRawText(raw: string) {
  return normalizeOcrText(String(raw || "").split(/\r?\n/).map(repairReceiptNumbers).join("\n"));
}

function numericSignature(line: string) {
  const values = repairReceiptNumbers(line).match(/\d+(?:[.,:]\d{2})/g) || [];
  return values.length ? values.slice(-2).map((value) => value.replace(",", ".")).join("|") : "";
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
  let score = letters * 0.22 + words * 1.15 + decimals * 2.7 - singleNoise * 2.1;
  if (/\b(TOTAL|IVA|BASE|HORA|FECHA|MESA|CAMARERO|PRECIO|IMPORTE|PENDIENTE|POWERED)\b/i.test(line)) score += 3;
  return score;
}

export function mergeReceiptTexts(primaryText: string, alternateText: string) {
  const primary = normalizeRawText(primaryText).split(/\r?\n/).filter(Boolean);
  const alternate = normalizeRawText(alternateText).split(/\r?\n/).filter(Boolean);
  if (!primary.length) return normalizeRawText(alternateText);
  if (!alternate.length) return normalizeRawText(primaryText);
  const used = new Set<number>();
  const merged = primary.map((source, sourceIndex) => {
    const signature = numericSignature(source);
    let bestIndex = -1;
    let bestFit = -Infinity;
    for (let index = 0; index < alternate.length; index += 1) {
      if (used.has(index)) continue;
      const candidate = alternate[index];
      const candidateSignature = numericSignature(candidate);
      let fit = -Math.abs(index - sourceIndex) * 0.35;
      if (signature && candidateSignature === signature) fit += 8;
      else if (signature || candidateSignature) fit -= 3;
      fit += lexicalOverlap(source, candidate) * 5;
      if (fit > bestFit) { bestFit = fit; bestIndex = index; }
    }
    if (bestIndex < 0 || bestFit < 1.5) return repairReceiptNumbers(source);
    const candidate = alternate[bestIndex];
    if (lineQuality(candidate) > lineQuality(source) + 0.6) { used.add(bestIndex); return repairReceiptNumbers(candidate); }
    return repairReceiptNumbers(source);
  });
  for (let index = 0; index < alternate.length; index += 1) {
    if (used.has(index)) continue;
    const line = repairReceiptNumbers(alternate[index]);
    if (lineQuality(line) >= 6 && !merged.some((existing) => lexicalOverlap(existing, line) > 0.78 && numericSignature(existing) === numericSignature(line))) merged.push(line);
  }
  return normalizeRawText(merged.join("\n"));
}

export function detectReceiptTextBounds(tsv: string, width: number, height: number): Bounds {
  const words = parseTsvWords(tsv).filter((word) => word.height < height * 0.1 && word.width >= word.height * 0.35);
  if (words.length < 10) return { left: 0, top: 0, width, height };
  const moneyWords = words.filter((word) => word.conf >= 12 && /\d{1,6}[.,]\d{2}/.test(word.text));
  if (moneyWords.length >= 3) {
    const typicalHeight = Math.max(8, quantile(moneyWords.map((word) => word.height), 0.5));
    let right = quantile(moneyWords.map((word) => word.left + word.width), 0.9) + typicalHeight * 2.2;
    const firstMoney = quantile(moneyWords.map((word) => word.left), 0.2);
    const receiptWords = words.filter((word) => word.left + word.width / 2 <= right && word.left < firstMoney + typicalHeight * 4.5);
    if (receiptWords.length >= 10) {
      let left = quantile(receiptWords.map((word) => word.left), 0.035) - typicalHeight * 2.4;
      let top = quantile(receiptWords.map((word) => word.top), 0.015);
      let bottom = quantile(receiptWords.map((word) => word.top + word.height), 0.985);
      const contentHeight = Math.max(1, bottom - top);
      left = clamp(left, 0, width - 1);
      right = clamp(right, left + 1, width);
      top = clamp(top - contentHeight * 0.05, 0, height - 1);
      bottom = clamp(bottom + contentHeight * 0.05, top + 1, height);
      return { left: Math.floor(left), top: Math.floor(top), width: Math.ceil(right - left), height: Math.ceil(bottom - top) };
    }
  }
  return { left: 0, top: 0, width, height };
}

function paperGeometry(data: ImageData, width: number, height: number): PaperGeometry | null {
  const step = Math.max(4, Math.floor(Math.max(width, height) / 650));
  const rows = Math.ceil(height / step);
  const columns = Math.ceil(width / step);
  const spans: Array<{ y: number; left: number; right: number }> = [];
  for (let gridY = 0; gridY < rows; gridY += 1) {
    const y = Math.min(height - 1, gridY * step);
    const runs: Array<{ left: number; right: number; hits: number }> = [];
    let current: { left: number; right: number; hits: number } | null = null;
    for (let gridX = 0; gridX < columns; gridX += 1) {
      const x = Math.min(width - 1, gridX * step);
      const offset = (y * width + x) * 4;
      const red = data.data[offset];
      const green = data.data[offset + 1];
      const blue = data.data[offset + 2];
      const high = Math.max(red, green, blue);
      const low = Math.min(red, green, blue);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const paper = luminance >= 145 && high - low <= 68;
      if (paper) {
        if (!current) current = { left: x, right: x, hits: 1 };
        else { current.right = x; current.hits += 1; }
      } else if (current) { runs.push(current); current = null; }
    }
    if (current) runs.push(current);
    const best = runs.sort((a, b) => b.hits - a.hits)[0];
    if (best && best.hits >= Math.max(4, Math.round(columns * 0.14))) spans.push({ y, left: best.left, right: best.right });
  }
  if (spans.length < rows * 0.22) return null;
  const top = spans[0].y;
  const bottom = spans.at(-1)!.y;
  if (bottom - top < height * 0.38) return null;
  const band = Math.max(4, Math.round(spans.length * 0.16));
  const topBand = spans.slice(0, band);
  const bottomBand = spans.slice(-band);
  const topLeft = median(topBand.map((span) => span.left));
  const topRight = median(topBand.map((span) => span.right));
  const bottomLeft = median(bottomBand.map((span) => span.left));
  const bottomRight = median(bottomBand.map((span) => span.right));
  if (Math.min(topRight - topLeft, bottomRight - bottomLeft) < width * 0.28) return null;
  return { top, bottom, topLeft, topRight, bottomLeft, bottomRight };
}

function rectify(source: HTMLCanvasElement, geometry: PaperGeometry | null) {
  if (!geometry) return source;
  const height = Math.max(1, geometry.bottom - geometry.top);
  const topWidth = geometry.topRight - geometry.topLeft;
  const bottomWidth = geometry.bottomRight - geometry.bottomLeft;
  const targetWidth = Math.max(1, Math.round((topWidth + bottomWidth) / 2));
  const marginX = Math.round(targetWidth * 0.045);
  const marginY = Math.round(height * 0.04);
  const output = document.createElement("canvas");
  output.width = targetWidth + marginX * 2;
  output.height = height + marginY * 2;
  const context = output.getContext("2d");
  if (!context) return source;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
  const strip = Math.max(1, Math.round(height / 900));
  for (let destinationY = 0; destinationY < height; destinationY += strip) {
    const ratio = destinationY / Math.max(1, height - 1);
    const left = geometry.topLeft + (geometry.bottomLeft - geometry.topLeft) * ratio;
    const right = geometry.topRight + (geometry.bottomRight - geometry.topRight) * ratio;
    const sourceY = geometry.top + destinationY;
    const sourceHeight = Math.min(strip, height - destinationY);
    context.drawImage(source, left, sourceY, Math.max(1, right - left), sourceHeight, marginX, marginY + destinationY, targetWidth, sourceHeight);
  }
  return output;
}

function deskew(source: HTMLCanvasElement) {
  const scale = Math.min(1, 900 / Math.max(source.width, source.height));
  const sample = document.createElement("canvas");
  sample.width = Math.max(1, Math.round(source.width * scale));
  sample.height = Math.max(1, Math.round(source.height * scale));
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return { canvas: source, angle: 0 };
  context.drawImage(source, 0, 0, sample.width, sample.height);
  const data = context.getImageData(0, 0, sample.width, sample.height);
  const points: Array<{ x: number; y: number }> = [];
  const stride = Math.max(1, Math.round(Math.max(sample.width, sample.height) / 650));
  for (let y = 0; y < sample.height; y += stride) {
    for (let x = 0; x < sample.width; x += stride) {
      const offset = (y * sample.width + x) * 4;
      const luminance = data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722;
      if (luminance < 150) points.push({ x, y });
    }
  }
  if (points.length > 16000) points.splice(0, points.length - 16000);
  const angle = estimateDeskewFromSamples(points, sample.width, sample.height);
  if (!angle) return { canvas: source, angle: 0 };
  const radians = (-angle * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const output = document.createElement("canvas");
  output.width = Math.ceil(source.width * cosine + source.height * sine);
  output.height = Math.ceil(source.height * cosine + source.width * sine);
  const outputContext = output.getContext("2d");
  if (!outputContext) return { canvas: source, angle: 0 };
  outputContext.fillStyle = "#fff";
  outputContext.fillRect(0, 0, output.width, output.height);
  outputContext.translate(output.width / 2, output.height / 2);
  outputContext.rotate(radians);
  outputContext.drawImage(source, -source.width / 2, -source.height / 2);
  return { canvas: output, angle };
}

async function prepareReceipt(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1500 / Math.max(1, bitmap.width), 2800 / Math.max(1, bitmap.height));
    if (bitmap.width < 900) scale = Math.min(1.45, 1250 / Math.max(1, bitmap.width));
    const base = document.createElement("canvas");
    base.width = Math.max(1, Math.round(bitmap.width * scale));
    base.height = Math.max(1, Math.round(bitmap.height * scale));
    const baseContext = base.getContext("2d", { willReadFrequently: true });
    if (!baseContext) throw new Error("Canvas no disponible");
    baseContext.fillStyle = "#fff";
    baseContext.fillRect(0, 0, base.width, base.height);
    baseContext.drawImage(bitmap, 0, 0, base.width, base.height);
    const geometry = paperGeometry(baseContext.getImageData(0, 0, base.width, base.height), base.width, base.height);
    const rectified = rectify(base, geometry);
    const straight = deskew(rectified);
    const natural = straight.canvas;
    const targetWidth = Math.min(1350, Math.max(950, natural.width));
    const resizeScale = targetWidth / natural.width;
    const width = Math.max(1, Math.round(natural.width * resizeScale));
    const height = Math.max(1, Math.round(natural.height * resizeScale));
    const gray = document.createElement("canvas");
    gray.width = width;
    gray.height = height;
    const grayContext = gray.getContext("2d", { willReadFrequently: true });
    if (!grayContext) throw new Error("Canvas no disponible");
    grayContext.drawImage(natural, 0, 0, width, height);
    const image = grayContext.getImageData(0, 0, width, height);
    let low = 255;
    let high = 0;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const value = Math.round(image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722);
      low = Math.min(low, value);
      high = Math.max(high, value);
      image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
    const range = Math.max(55, high - low);
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const value = clamp(Math.round((image.data[offset] - low) * 240 / range + 8), 0, 255);
      image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = value;
    }
    grayContext.putImageData(image, 0, 0);
    const threshold = localAdaptiveThreshold(image.data, width, height);
    const adaptive = document.createElement("canvas");
    adaptive.width = width;
    adaptive.height = height;
    adaptive.getContext("2d")?.putImageData(new ImageData(threshold, width, height), 0, 0);
    return { adaptive, gray, deskewAngle: straight.angle, paperDetected: Boolean(geometry) };
  } finally {
    bitmap.close();
  }
}

async function read(worker: Worker, input: HTMLCanvasElement | File, pageSegmentationMode: string) {
  await worker.setParameters?.({ tessedit_pageseg_mode: pageSegmentationMode, preserve_interword_spaces: "1", user_defined_dpi: "300" });
  const result = await worker.recognize(input, {}, { text: true, tsv: true });
  const raw = String(result.data?.text || "");
  const tsv = String(result.data?.tsv || "");
  const structured = reconstructTsvReceipt(tsv);
  return {
    text: normalizeRawText(raw),
    layoutText: structured?.layoutText || preserveOcrLayout(raw),
    confidence: Number.isFinite(result.data?.confidence) ? Number(result.data?.confidence) : null,
    tsv,
    receiptLayout: parseReceiptTsvLayout(tsv),
  };
}

function addCandidate(candidates: Candidate[], variant: string, result: Awaited<ReturnType<typeof read>>, hint: DocumentTypeHint) {
  const itemCount = result.receiptLayout?.items.length || 0;
  candidates.push({ variant, ...result, score: scoreReceiptCandidate(result.text, result.confidence, hint) + itemCount * 9 });
}

function candidateMerchant(candidates: Candidate[], hint: DocumentTypeHint) {
  const values = candidates.map((candidate) => inferDocumentMetadata(candidate.text, hint).merchant).map(cleanReceiptMerchant).filter((value): value is string => Boolean(value));
  if (!values.length) return null;
  return values.reduce((best, value) => {
    const score = (merchant: string) => letterCount(merchant) + (/\b(BAR|CAF[EÉ]|RESTAURANTE|HOTEL|TABERNA|MES[ÓO]N|ESTANCO|FARMACIA|TIENDA)\b/i.test(merchant) ? 30 : 0) - (merchant.match(/\d/g) || []).length * 2;
    return score(value) > score(best) ? value : best;
  });
}

function summaryCrop(source: HTMLCanvasElement) {
  const output = document.createElement("canvas");
  const top = Math.floor(source.height * 0.48);
  output.width = source.width;
  output.height = source.height - top;
  const context = output.getContext("2d");
  if (!context) return source;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(source, 0, top, source.width, source.height - top, 0, 0, output.width, output.height);
  return output;
}

export async function recognizeTicketImage(file: File, worker: Worker, onProgress: (value: number, label: string) => void, hint: DocumentTypeHint = null): Promise<ImageOcrResult> {
  if (hint !== "receipt") return recognizeLegacyTicket(file, worker, onProgress, hint);
  const candidates: Candidate[] = [];
  try {
    onProgress(0.06, "Preparando el ticket");
    const prepared = await prepareReceipt(file);
    onProgress(0.20, prepared.paperDetected || prepared.deskewAngle ? "Corrigiendo papel, perspectiva y giro" : "Corrigiendo luz y contraste");
    onProgress(0.30, "Leyendo ticket completo");
    const primary = await read(worker, prepared.adaptive, "6");
    addCandidate(candidates, "canonical_adaptive_psm6", primary, hint);

    let reconstruction = reconstructReceiptEvidence([primary.text], [primary.receiptLayout], candidateMerchant(candidates, hint));
    if (shouldRefineReceiptCandidates([{ text: primary.text, confidence: primary.confidence, receiptLayout: primary.receiptLayout }], hint) || !reconstruction.layout || reconstruction.layout.items.length < 4) {
      onProgress(0.61, "Completando únicamente líneas dudosas");
      const alternate = await read(worker, prepared.gray, "4");
      addCandidate(candidates, "canonical_gray_psm4", alternate, hint);
      reconstruction = reconstructReceiptEvidence(candidates.map((candidate) => candidate.text), candidates.map((candidate) => candidate.receiptLayout), candidateMerchant(candidates, hint));
    }

    let total = reconstruction.total;
    if (total === null) {
      onProgress(0.82, "Confirmando Base, IVA y Total");
      const totals = await read(worker, summaryCrop(prepared.gray), "6");
      addCandidate(candidates, "canonical_summary_psm6", totals, hint);
      reconstruction = reconstructReceiptEvidence(candidates.map((candidate) => candidate.text), candidates.map((candidate) => candidate.receiptLayout), candidateMerchant(candidates, hint));
      total = reconstruction.total ?? extractReceiptTotal(totals.text);
    }

    const best = candidates.reduce((current, candidate) => candidate.score > current.score ? candidate : current);
    const merchant = candidateMerchant(candidates, hint);
    const layout = reconstruction.layout;
    const finalText = layout?.items.length ? receiptLayoutToText(layout) : mergeReceiptTexts(candidates[0].text, candidates[1]?.text || "");
    const inferred = inferDocumentMetadata(candidates.map((candidate) => candidate.text).join("\n"), hint);
    const metadata = {
      ...inferred,
      documentType: "receipt" as const,
      amount: total ?? inferred.amount,
      merchant: merchant ?? cleanReceiptMerchant(inferred.merchant),
      lines: finalText.split(/\r?\n/).filter(Boolean),
    };
    onProgress(0.97, "Validando líneas e importes");
    return {
      text: finalText,
      layoutText: layout ? receiptLayoutToText(layout) : best.layoutText,
      confidence: best.confidence,
      method: `image_ocr_receipt_v501:canonical_v4:${best.variant}`,
      passes: candidates.map(({ variant, confidence, score }) => ({ variant, confidence, score: Math.round(score * 10) / 10 })),
      receiptLayout: layout,
      metadata,
    };
  } catch {
    onProgress(0.55, "Usando lectura de compatibilidad");
    return recognizeLegacyTicket(file, worker, onProgress, hint);
  }
}
