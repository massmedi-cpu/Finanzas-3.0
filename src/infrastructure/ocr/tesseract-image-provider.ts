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
const HORIZONTAL_CROP_MARGIN = 0.035;

type Worker = Awaited<ReturnType<typeof createWorker>>;
type TimeoutKind = "queue" | "worker" | "recognize";
type RecognitionData = Record<string, unknown>;
type ImageRectangle = { left: number; top: number; width: number; height: number };
type RecognitionBlock = {
  id: string;
  words: OcrWord[];
  left: number;
  right: number;
  top: number;
  bottom: number;
  weight: number;
};
type RecognitionCandidate = {
  words: OcrWord[];
  blocks: RecognitionBlock[];
  score: number;
  rotationRadians: number;
  autoRotate: boolean;
  backgroundFiltered?: boolean;
};
type ParsedTsv = { words: OcrWord[]; blocks: RecognitionBlock[] };
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

function textWeight(word: OcrWord) {
  const chars = Math.max(1, word.text.replace(/\s+/g, "").length);
  return chars * (0.35 + word.confidence * 0.65);
}

function parseTsv(tsv: unknown, width: number, height: number): ParsedTsv {
  if (typeof tsv !== "string") return { words: [], blocks: [] };
  const words: OcrWord[] = [];
  const blockWords = new Map<string, OcrWord[]>();

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
    const word: OcrWord = { text, confidence, box: { x, y, width: normalizedWidth, height: normalizedHeight } };
    words.push(word);
    const blockId = `${columns[1]}:${columns[2]}`;
    const bucket = blockWords.get(blockId) ?? [];
    bucket.push(word);
    blockWords.set(blockId, bucket);
  }

  const blocks: RecognitionBlock[] = [...blockWords.entries()].map(([id, entries]) => {
    const left = Math.min(...entries.map((word) => word.box.x));
    const right = Math.max(...entries.map((word) => word.box.x + word.box.width));
    const top = Math.min(...entries.map((word) => word.box.y));
    const bottom = Math.max(...entries.map((word) => word.box.y + word.box.height));
    return {
      id,
      words: entries,
      left,
      right,
      top,
      bottom,
      weight: entries.reduce((sum, word) => sum + textWeight(word), 0),
    };
  });

  return { words, blocks };
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

function intervalOverlap(leftA: number, rightA: number, leftB: number, rightB: number) {
  return Math.max(0, Math.min(rightA, rightB) - Math.max(leftA, leftB));
}

function horizontalOverlapRatio(a: RecognitionBlock, b: RecognitionBlock) {
  const denominator = Math.max(0.001, Math.min(a.right - a.left, b.right - b.left));
  return intervalOverlap(a.left, a.right, b.left, b.right) / denominator;
}

function verticalGap(a: RecognitionBlock, b: RecognitionBlock) {
  if (a.bottom < b.top) return b.top - a.bottom;
  if (b.bottom < a.top) return a.top - b.bottom;
  return 0;
}

function primaryDocumentBlocks(blocks: RecognitionBlock[]) {
  const usable = blocks.filter((block) => block.words.length >= 2 && block.weight >= 3);
  if (usable.length < 2) return usable.length ? usable : blocks;

  const visited = new Set<string>();
  const components: RecognitionBlock[][] = [];
  for (const seed of usable) {
    if (visited.has(seed.id)) continue;
    const component: RecognitionBlock[] = [];
    const queue = [seed];
    visited.add(seed.id);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (const candidate of usable) {
        if (visited.has(candidate.id)) continue;
        const overlap = horizontalOverlapRatio(current, candidate);
        const gap = verticalGap(current, candidate);
        if (overlap >= 0.28 && gap <= 0.16) {
          visited.add(candidate.id);
          queue.push(candidate);
        }
      }
    }
    components.push(component);
  }

  const scored = components.map((component) => {
    const weight = component.reduce((sum, block) => sum + block.weight, 0);
    const top = Math.min(...component.map((block) => block.top));
    const bottom = Math.max(...component.map((block) => block.bottom));
    const left = Math.min(...component.map((block) => block.left));
    const right = Math.max(...component.map((block) => block.right));
    const verticalSpan = Math.min(1, bottom - top);
    const horizontalSpan = Math.min(1, right - left);
    const score = weight * (1 + Math.min(0.35, verticalSpan * 0.25)) + component.length * 1.5 + horizontalSpan * 4;
    return { component, score, weight, left, right };
  }).sort((a, b) => b.score - a.score);

  const primary = scored[0];
  if (!primary) return blocks;
  const totalWeight = usable.reduce((sum, block) => sum + block.weight, 0);
  if (!totalWeight || primary.weight / totalWeight < 0.45) return blocks;

  const bandMargin = Math.min(0.12, Math.max(0.045, (primary.right - primary.left) * 0.12));
  const bandLeft = Math.max(0, primary.left - bandMargin);
  const bandRight = Math.min(1, primary.right + bandMargin);
  return usable.filter((block) => {
    if (primary.component.some((entry) => entry.id === block.id)) return true;
    const overlap = intervalOverlap(block.left, block.right, bandLeft, bandRight);
    const blockWidth = Math.max(0.001, block.right - block.left);
    const center = (block.left + block.right) / 2;
    return overlap / blockWidth >= 0.55 || (center >= bandLeft && center <= bandRight);
  });
}

function isolateDocumentWords(candidate: RecognitionCandidate): DocumentIsolation | null {
  if (candidate.words.length < 10 || candidate.blocks.length < 2) return null;
  const keptBlocks = primaryDocumentBlocks(candidate.blocks);
  if (!keptBlocks.length || keptBlocks.length === candidate.blocks.length) return null;

  const keptIds = new Set(keptBlocks.map((block) => block.id));
  const words = candidate.blocks.filter((block) => keptIds.has(block.id)).flatMap((block) => block.words);
  if (words.length < 6) return null;

  const totalWeight = candidate.blocks.reduce((sum, block) => sum + block.weight, 0);
  const keptWeight = keptBlocks.reduce((sum, block) => sum + block.weight, 0);
  if (!totalWeight) return null;
  const keptShare = keptWeight / totalWeight;
  const removedShare = 1 - keptShare;
  if (keptShare < MIN_DOCUMENT_SHARE || removedShare < MIN_BACKGROUND_SHARE) return null;

  const left = Math.max(0, Math.min(...words.map((word) => word.box.x)) - HORIZONTAL_CROP_MARGIN);
  const right = Math.min(1, Math.max(...words.map((word) => word.box.x + word.box.width)) + HORIZONTAL_CROP_MARGIN);
  if (right - left < 0.22 || right - left > 0.92) return null;
  return { words, left, right, removedWords: candidate.words.length - words.length };
}

function refinementIsSafe(baseWords: OcrWord[], refinedWords: OcrWord[]) {
  const base = wordStats(baseWords);
  const refined = wordStats(refinedWords);
  if (refinedWords.length < 5 || refined.chars < Math.max(20, base.chars * 0.68)) return false;
  return refined.averageConfidence >= Math.max(0.4, base.averageConfidence - 0.1);
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
  const parsed = parseTsv(data?.tsv, dimensions.width, dimensions.height);
  return { words: parsed.words, blocks: parsed.blocks, score: candidateScore(parsed.words), rotationRadians, autoRotate };
}

async function refineBackgroundContamination(
  worker: Worker,
  bytes: Uint8Array,
  metadata: OcrImageMetadata,
  candidate: RecognitionCandidate,
) {
  const isolation = isolateDocumentWords(candidate);
  if (!isolation) return candidate;

  // Rectangle coordinates are reliable for upright images. For a quarter-turn fallback,
  // keep the deterministic block filter without trying to remap crop coordinates.
  if (Math.abs(candidate.rotationRadians) > ROTATION_EPSILON) {
    return { ...candidate, words: isolation.words, backgroundFiltered: true };
  }

  const rectangle = cropRectangle(isolation, metadata);
  try {
    const refined = await recognizeCandidate(worker, bytes, metadata, 0, false, rectangle);
    const refinedIsolation = isolateDocumentWords(refined);
    const refinedWords = refinedIsolation?.words ?? refined.words;
    if (refinementIsSafe(isolation.words, refinedWords)) {
      return { ...refined, words: refinedWords, backgroundFiltered: true };
    }
  } catch {
    // The first pass is still useful; fail safely back to geometry-filtered words.
  }
  return { ...candidate, words: isolation.words, backgroundFiltered: true };
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
