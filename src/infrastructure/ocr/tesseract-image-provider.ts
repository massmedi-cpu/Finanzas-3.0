import path from "node:path";
import { createWorker } from "tesseract.js";
import type { DocumentOcrProvider } from "../../application/document-ocr-service";
import type { OcrWord } from "../../domain/document-ocr";
import { readOcrImageMetadata, type OcrImageMetadata } from "./image-metadata";

const SUPPORTED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIDE = 12_000;
const MAX_PIXELS = 60_000_000;
const OCR_TIMEOUT_MS = 35_000;
const QUEUE_TIMEOUT_MS = 8_000;
const EXTRACTOR = "tesseract-js-7.0.0-spa";
const ROTATION_EPSILON = 0.01;
const MIN_BACKGROUND_SHARE = 0.08;
const MIN_DOCUMENT_SHARE = 0.58;
const DOCUMENT_CORE_SHARE = 0.72;
const HORIZONTAL_LINK_GAP = 0.065;
const MIN_DETACHED_GAP = 0.04;
const HORIZONTAL_CROP_MARGIN = 0.025;

type Worker = Awaited<ReturnType<typeof createWorker>>;
type TimeoutKind = "queue" | "worker" | "recognize";
type RecognitionData = Record<string, unknown>;
type ImageRectangle = { left: number; top: number; width: number; height: number };
type RecognitionCandidate = {
  words: OcrWord[];
  score: number;
  rotationRadians: number;
  autoRotate: boolean;
  backgroundFiltered?: boolean;
};
type DocumentIsolation = {
  words: OcrWord[];
  left: number;
  right: number;
  removedWords: number;
};

class OcrTimeoutError extends Error {
  constructor(readonly kind: TimeoutKind) {
    super(`ocr_${kind}_timeout`);
  }
}

let workerPromise: Promise<Worker> | null = null;
let queueTail: Promise<void> = Promise.resolve();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, kind: TimeoutKind) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OcrTimeoutError(kind)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function invalidateWorker() {
  const current = workerPromise;
  workerPromise = null;
  if (current) void current.then((worker) => worker.terminate()).catch(() => undefined);
}

async function getWorker() {
  if (!workerPromise) {
    const root = process.cwd();
    workerPromise = createWorker("spa", 1, {
      workerPath: path.join(root, "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
      corePath: path.join(root, "node_modules", "tesseract.js-core"),
      langPath: path.join(root, "node_modules", "@tesseract.js-data", "spa", "4.0.0"),
      cacheMethod: "none",
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function exclusive<T>(task: () => Promise<T>) {
  const previous = queueTail.catch(() => undefined);
  let release!: () => void;
  const slot = new Promise<void>((resolve) => { release = resolve; });
  queueTail = previous.then(() => slot);
  try {
    await withTimeout(previous, QUEUE_TIMEOUT_MS, "queue");
    return await task();
  } finally {
    release();
  }
}

function parseTsv(tsv: unknown, width: number, height: number): OcrWord[] {
  if (typeof tsv !== "string") return [];
  const words: OcrWord[] = [];
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const columns = line.split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const boxWidth = Number(columns[8]);
    const boxHeight = Number(columns[9]);
    const rawConfidence = Number(columns[10]);
    const text = columns.slice(11).join("\t").replace(/\s+/g, " ").trim();
    if (!text || ![left, top, boxWidth, boxHeight].every(Number.isFinite) || boxWidth <= 0 || boxHeight <= 0) continue;
    const right = Math.min(width, Math.max(0, left + boxWidth));
    const bottom = Math.min(height, Math.max(0, top + boxHeight));
    const x = Math.min(1, Math.max(0, left / width));
    const y = Math.min(1, Math.max(0, top / height));
    const normalizedWidth = Math.min(1 - x, Math.max(0, (right - Math.max(0, left)) / width));
    const normalizedHeight = Math.min(1 - y, Math.max(0, (bottom - Math.max(0, top)) / height));
    if (normalizedWidth <= 0 || normalizedHeight <= 0) continue;
    const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence / 100)) : 0.5;
    words.push({ text, confidence, box: { x, y, width: normalizedWidth, height: normalizedHeight } });
  }
  return words;
}

function processedImageMetadata(data: RecognitionData, fallback: OcrImageMetadata, rotationRadians: number) {
  const imageColor = data.imageColor;
  if (typeof imageColor === "string") {
    const match = /^data:image\/(?:png|jpeg|webp);base64,([\s\S]+)$/i.exec(imageColor);
    if (match) {
      try {
        const metadata = readOcrImageMetadata(new Uint8Array(Buffer.from(match[1], "base64")));
        if (metadata) return metadata;
      } catch {
        // Fall back to the deterministic dimensions below.
      }
    }
  }

  const quarterTurn = Math.abs(Math.abs(rotationRadians) - Math.PI / 2) <= ROTATION_EPSILON;
  return quarterTurn
    ? { ...fallback, width: fallback.height, height: fallback.width }
    : fallback;
}

function wordStats(words: OcrWord[]) {
  let chars = 0;
  let confidenceWeight = 0;
  let confidenceScore = 0;
  for (const word of words) {
    const weight = Math.max(1, word.text.replace(/\s+/g, "").length);
    chars += weight;
    confidenceWeight += weight;
    confidenceScore += word.confidence * weight;
  }
  return {
    chars,
    averageConfidence: confidenceWeight ? confidenceScore / confidenceWeight : 0,
  };
}

function candidateScore(words: OcrWord[]) {
  const stats = wordStats(words);
  return stats.averageConfidence * 100 + Math.min(stats.chars, 500) * 0.12 + Math.min(words.length, 80) * 0.35;
}

function needsOrientationFallback(words: OcrWord[], metadata: OcrImageMetadata) {
  const stats = wordStats(words);
  const landscape = metadata.width > metadata.height * 1.12;
  return landscape || words.length < 5 || stats.chars < 24 || stats.averageConfidence < 0.62;
}

function textWeight(word: OcrWord) {
  const chars = Math.max(1, word.text.replace(/\s+/g, "").length);
  return chars * (0.35 + word.confidence * 0.65);
}

function wordRight(word: OcrWord) {
  return word.box.x + word.box.width;
}

function wordCenter(word: OcrWord) {
  return word.box.x + word.box.width / 2;
}

function bandGap(word: OcrWord, left: number, right: number) {
  const end = wordRight(word);
  if (end < left) return left - end;
  if (word.box.x > right) return word.box.x - right;
  return 0;
}

function horizontalComponents(words: OcrWord[]) {
  const sorted = [...words].sort((a, b) => a.box.x - b.box.x || wordRight(a) - wordRight(b));
  const components: OcrWord[][] = [];
  let current: OcrWord[] = [];
  let right = 0;

  for (const word of sorted) {
    if (!current.length) {
      current = [word];
      right = wordRight(word);
      continue;
    }
    if (word.box.x - right > HORIZONTAL_LINK_GAP) {
      components.push(current);
      current = [word];
      right = wordRight(word);
      continue;
    }
    current.push(word);
    right = Math.max(right, wordRight(word));
  }
  if (current.length) components.push(current);
  return components;
}

function weightedCore(words: OcrWord[]) {
  const sorted = [...words].sort((a, b) => wordCenter(a) - wordCenter(b));
  const weights = sorted.map(textWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!totalWeight) return [] as OcrWord[];
  const target = totalWeight * DOCUMENT_CORE_SHARE;
  let best: { start: number; end: number; width: number; weight: number } | null = null;
  let start = 0;
  let windowWeight = 0;

  for (let end = 0; end < sorted.length; end += 1) {
    windowWeight += weights[end];
    while (start < end && windowWeight - weights[start] >= target) {
      windowWeight -= weights[start];
      start += 1;
    }
    if (windowWeight < target) continue;
    const left = Math.min(...sorted.slice(start, end + 1).map((word) => word.box.x));
    const right = Math.max(...sorted.slice(start, end + 1).map(wordRight));
    const width = right - left;
    if (!best || width < best.width || (Math.abs(width - best.width) < 0.005 && windowWeight > best.weight)) {
      best = { start, end, width, weight: windowWeight };
    }
  }

  return best ? sorted.slice(best.start, best.end + 1) : [];
}

function expandHorizontalBand(seedWords: OcrWord[], allWords: OcrWord[]) {
  const selected = new Set(seedWords);
  let left = Math.min(...seedWords.map((word) => word.box.x));
  let right = Math.max(...seedWords.map(wordRight));
  let changed = true;

  while (changed) {
    changed = false;
    for (const word of allWords) {
      if (selected.has(word)) continue;
      if (bandGap(word, left, right) > HORIZONTAL_LINK_GAP) continue;
      selected.add(word);
      left = Math.min(left, word.box.x);
      right = Math.max(right, wordRight(word));
      changed = true;
    }
  }

  return [...selected];
}

function validateIsolation(selectedWords: OcrWord[], allWords: OcrWord[]): DocumentIsolation | null {
  if (selectedWords.length < 6 || selectedWords.length >= allWords.length) return null;
  const selected = new Set(selectedWords);
  const outsideWords = allWords.filter((word) => !selected.has(word));
  if (!outsideWords.length) return null;

  const totalWeight = allWords.reduce((sum, word) => sum + textWeight(word), 0);
  const selectedWeight = selectedWords.reduce((sum, word) => sum + textWeight(word), 0);
  if (!totalWeight) return null;
  const keptShare = selectedWeight / totalWeight;
  const removedShare = 1 - keptShare;
  if (keptShare < MIN_DOCUMENT_SHARE || removedShare < MIN_BACKGROUND_SHARE) return null;

  let left = Math.min(...selectedWords.map((word) => word.box.x));
  let right = Math.max(...selectedWords.map(wordRight));
  const rawWidth = right - left;
  if (rawWidth < 0.2 || rawWidth > 0.9) return null;

  let leftGap = Number.POSITIVE_INFINITY;
  let rightGap = Number.POSITIVE_INFINITY;
  for (const word of outsideWords) {
    const end = wordRight(word);
    if (end <= left) leftGap = Math.min(leftGap, left - end);
    else if (word.box.x >= right) rightGap = Math.min(rightGap, word.box.x - right);
    else return null;
  }

  const nearestGap = Math.min(leftGap, rightGap);
  if (!Number.isFinite(nearestGap) || nearestGap < MIN_DETACHED_GAP) return null;

  const leftMargin = Number.isFinite(leftGap) ? Math.min(HORIZONTAL_CROP_MARGIN, leftGap * 0.4) : HORIZONTAL_CROP_MARGIN;
  const rightMargin = Number.isFinite(rightGap) ? Math.min(HORIZONTAL_CROP_MARGIN, rightGap * 0.4) : HORIZONTAL_CROP_MARGIN;
  left = Math.max(0, left - leftMargin);
  right = Math.min(1, right + rightMargin);
  if (right - left < 0.22 || right - left > 0.92) return null;

  return { words: selectedWords, left, right, removedWords: outsideWords.length };
}

function isolateDocumentWords(candidate: RecognitionCandidate): DocumentIsolation | null {
  if (candidate.words.length < 10) return null;

  const components = horizontalComponents(candidate.words);
  if (components.length > 1) {
    const scored = components
      .filter((component) => component.length >= 2)
      .map((component) => {
        const weight = component.reduce((sum, word) => sum + textWeight(word), 0);
        const top = Math.min(...component.map((word) => word.box.y));
        const bottom = Math.max(...component.map((word) => word.box.y + word.box.height));
        const verticalSpan = Math.min(1, bottom - top);
        return { component, score: weight * (1 + Math.min(0.4, verticalSpan * 0.35)) + component.length * 0.2 };
      })
      .sort((a, b) => b.score - a.score);
    const direct = scored[0] ? validateIsolation(scored[0].component, candidate.words) : null;
    if (direct) return direct;
  }

  const core = weightedCore(candidate.words);
  if (!core.length) return null;
  const expanded = expandHorizontalBand(core, candidate.words);
  return validateIsolation(expanded, candidate.words);
}

function refinementIsSafe(baseWords: OcrWord[], refinedWords: OcrWord[]) {
  const base = wordStats(baseWords);
  const refined = wordStats(refinedWords);
  if (refinedWords.length < 5 || refined.chars < Math.max(20, base.chars * 0.64)) return false;
  return refined.averageConfidence >= Math.max(0.38, base.averageConfidence - 0.12);
}

function cropRectangle(isolation: DocumentIsolation, metadata: OcrImageMetadata): ImageRectangle {
  const left = Math.max(0, Math.floor(isolation.left * metadata.width));
  const right = Math.min(metadata.width, Math.ceil(isolation.right * metadata.width));
  return { left, top: 0, width: Math.max(1, right - left), height: metadata.height };
}

async function recognizeCandidate(
  worker: Worker,
  bytes: Uint8Array,
  metadata: OcrImageMetadata,
  rotationRadians: number,
  autoRotate: boolean,
  rectangle?: ImageRectangle,
): Promise<RecognitionCandidate> {
  const options: { rotateAuto?: boolean; rotateRadians?: number; rectangle?: ImageRectangle } = autoRotate
    ? { rotateAuto: true }
    : { rotateRadians: rotationRadians };
  if (rectangle) options.rectangle = rectangle;
  const recognition = await withTimeout(
    worker.recognize(Buffer.from(bytes), options, { text: true, tsv: true, imageColor: true }),
    OCR_TIMEOUT_MS,
    "recognize",
  );
  const data = recognition?.data as unknown as RecognitionData;
  const dimensions = rectangle && Math.abs(rotationRadians) <= ROTATION_EPSILON
    ? metadata
    : processedImageMetadata(data, metadata, rotationRadians);
  const words = parseTsv(data?.tsv, dimensions.width, dimensions.height);
  return { words, score: candidateScore(words), rotationRadians, autoRotate };
}

async function refineBackgroundContamination(
  worker: Worker,
  bytes: Uint8Array,
  metadata: OcrImageMetadata,
  candidate: RecognitionCandidate,
) {
  const isolation = isolateDocumentWords(candidate);
  if (!isolation) return candidate;

  // Rectangle coordinates remain deterministic for the upright camera path. For quarter-turn
  // fallbacks we still remove a detached word band, but do not risk a wrongly remapped crop.
  if (Math.abs(candidate.rotationRadians) > ROTATION_EPSILON) {
    return { ...candidate, words: isolation.words, score: candidateScore(isolation.words), backgroundFiltered: true };
  }

  const rectangle = cropRectangle(isolation, metadata);
  try {
    const refined = await recognizeCandidate(worker, bytes, metadata, 0, false, rectangle);
    if (refinementIsSafe(isolation.words, refined.words)) {
      return { ...refined, backgroundFiltered: true };
    }
  } catch {
    // The geometry-filtered first pass is still safer than reintroducing detached background text.
  }
  return { ...candidate, words: isolation.words, score: candidateScore(isolation.words), backgroundFiltered: true };
}

export class TesseractImageOcrProvider implements DocumentOcrProvider {
  supports(mimeType: string) {
    return SUPPORTED_MIMES.has(mimeType.toLowerCase());
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }) {
    const metadata = readOcrImageMetadata(input.bytes);
    if (!metadata || metadata.mimeType !== input.mimeType) throw new Error("ocr_image_signature_mismatch");
    if (metadata.width > MAX_SIDE || metadata.height > MAX_SIDE || metadata.width * metadata.height > MAX_PIXELS) {
      throw new Error("ocr_image_dimensions_too_large");
    }

    try {
      const selected = await exclusive(async () => {
        const worker = await withTimeout(getWorker(), OCR_TIMEOUT_MS, "worker");
        const initial = await recognizeCandidate(worker, input.bytes, metadata, 0, true);
        let best = initial;
        if (needsOrientationFallback(initial.words, metadata)) {
          for (const rotationRadians of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
            const candidate = await recognizeCandidate(worker, input.bytes, metadata, rotationRadians, false);
            if (candidate.score > best.score) best = candidate;
          }
        }
        return refineBackgroundContamination(worker, input.bytes, metadata, best);
      });

      const warnings: string[] = [];
      if (!selected.words.length) warnings.push("no_text_detected");
      if (Math.abs(selected.rotationRadians) > ROTATION_EPSILON) warnings.push("orientation_corrected");
      if (selected.backgroundFiltered) warnings.push("background_text_filtered");
      return {
        source: "image_ocr" as const,
        extractor: EXTRACTOR,
        pages: [{ pageNumber: 1, words: selected.words }],
        warnings,
      };
    } catch (error) {
      if (error instanceof OcrTimeoutError || error instanceof Error) invalidateWorker();
      throw error;
    }
  }
}
