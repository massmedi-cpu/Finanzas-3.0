import path from "node:path";
import { createWorker, PSM } from "tesseract.js";
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
const NUMERIC_COLUMN_START_SHARE = 0.36;
const NUMERIC_CLUSTER_GAP_SHARE = 0.055;
const NUMERIC_CLUSTER_MARGIN_SHARE = 0.035;
const MAX_NUMERIC_COLUMNS = 3;
const MONEY_TOKEN = /^\d{1,6}[,.]\d{2}$/;

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
type RawTsvWord = {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
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

async function terminateOwnedWorker(worker: Worker) {
  workerPromise = null;
  await worker.terminate().catch(() => undefined);
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

function rawTsvWords(tsv: unknown): RawTsvWord[] {
  if (typeof tsv !== "string") return [];
  const words: RawTsvWord[] = [];
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const columns = line.split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    const rawConfidence = Number(columns[10]);
    const text = columns.slice(11).join("\t").replace(/\s+/g, " ").trim();
    if (!text || ![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence / 100)) : 0.5;
    words.push({ text, confidence, left, top, width, height });
  }
  return words;
}

function parseTsv(tsv: unknown, width: number, height: number, rectangle?: ImageRectangle): OcrWord[] {
  const raw = rawTsvWords(tsv);
  if (!raw.length) return [];

  // Tesseract can report rectangle coordinates in crop-local space. Detect that once for the
  // whole recognition result and translate them back to source-image space before normalizing.
  // If it already reports source coordinates, the minimum lies inside the requested rectangle
  // and no offset is applied. This keeps geometry stable across full-image and cropped passes.
  const minLeft = Math.min(...raw.map((word) => word.left));
  const maxRight = Math.max(...raw.map((word) => word.left + word.width));
  const minTop = Math.min(...raw.map((word) => word.top));
  const maxBottom = Math.max(...raw.map((word) => word.top + word.height));
  const localX = Boolean(
    rectangle
    && rectangle.left > 0
    && minLeft < rectangle.left - 2
    && maxRight <= rectangle.width + 4,
  );
  const localY = Boolean(
    rectangle
    && rectangle.top > 0
    && minTop < rectangle.top - 2
    && maxBottom <= rectangle.height + 4,
  );
  const offsetX = localX && rectangle ? rectangle.left : 0;
  const offsetY = localY && rectangle ? rectangle.top : 0;

  const words: OcrWord[] = [];
  for (const rawWord of raw) {
    const left = rawWord.left + offsetX;
    const top = rawWord.top + offsetY;
    const right = Math.min(width, Math.max(0, left + rawWord.width));
    const bottom = Math.min(height, Math.max(0, top + rawWord.height));
    const clippedLeft = Math.max(0, left);
    const clippedTop = Math.max(0, top);
    const x = Math.min(1, Math.max(0, clippedLeft / width));
    const y = Math.min(1, Math.max(0, clippedTop / height));
    const normalizedWidth = Math.min(1 - x, Math.max(0, (right - clippedLeft) / width));
    const normalizedHeight = Math.min(1 - y, Math.max(0, (bottom - clippedTop) / height));
    if (normalizedWidth <= 0 || normalizedHeight <= 0) continue;
    words.push({
      text: rawWord.text,
      confidence: rawWord.confidence,
      box: { x, y, width: normalizedWidth, height: normalizedHeight },
    });
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

export function preserveAlignedNumericColumns(selectedWords: OcrWord[], allWords: OcrWord[]) {
  const selected = new Set(selectedWords);
  const outside = allWords.filter((word) => !selected.has(word));

  for (const column of horizontalComponents(outside)) {
    // A wide inter-column gap is not evidence of a different document. Protect a
    // predominantly numeric column when it shares at least three distinct rows with
    // the selected text. Keep uncertain tokens verbatim too: this is an isolation
    // safeguard, not monetary parsing ("560" must never become "5,60" here).
    const numericWords = column.filter((word) => /^[€$£+-]?\d[\d.,/]*[%€$£]?$/.test(word.text.replace(/\s+/g, "")));
    const substantiveWords = column.filter((word) => !/^(?:EUR|USD|GBP|[€$£])$/i.test(word.text));
    if (numericWords.length < 3 || numericWords.length / substantiveWords.length < 0.6) continue;

    const alignedRows: OcrWord[] = [];
    for (const word of numericWords) {
      if (!selectedWords.some((anchor) => verticalOverlapRatio(word, anchor) >= 0.6)) continue;
      if (alignedRows.some((row) => verticalOverlapRatio(word, row) >= 0.6)) continue;
      alignedRows.push(word);
    }
    if (alignedRows.length < 3) continue;
    for (const word of column) selected.add(word);
  }

  return allWords.filter((word) => selected.has(word));
}

function validateIsolation(selectedWords: OcrWord[], allWords: OcrWord[]): DocumentIsolation | null {
  selectedWords = preserveAlignedNumericColumns(selectedWords, allWords);
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

function fallbackNumericRectangle(isolation: DocumentIsolation, metadata: OcrImageMetadata): ImageRectangle {
  const documentWidth = isolation.right - isolation.left;
  const numericLeft = isolation.left + documentWidth * NUMERIC_COLUMN_START_SHARE;
  const left = Math.max(0, Math.floor(numericLeft * metadata.width));
  const right = Math.min(metadata.width, Math.ceil(isolation.right * metadata.width));
  return { left, top: 0, width: Math.max(1, right - left), height: metadata.height };
}

function numericColumnRectangles(words: OcrWord[], isolation: DocumentIsolation, metadata: OcrImageMetadata) {
  const documentWidth = isolation.right - isolation.left;
  const start = isolation.left + documentWidth * NUMERIC_COLUMN_START_SHARE;
  const candidates = words
    .filter((word) => /\d/.test(word.text) && wordCenter(word) >= start && wordCenter(word) <= isolation.right)
    .sort((a, b) => wordCenter(a) - wordCenter(b));
  if (candidates.length < 2) return [fallbackNumericRectangle(isolation, metadata)];

  const gapLimit = Math.max(0.012, documentWidth * NUMERIC_CLUSTER_GAP_SHARE);
  const clusters: OcrWord[][] = [];
  for (const word of candidates) {
    const previous = clusters.at(-1);
    if (!previous) {
      clusters.push([word]);
      continue;
    }
    const previousCenter = previous.reduce((sum, item) => sum + wordCenter(item), 0) / previous.length;
    if (Math.abs(wordCenter(word) - previousCenter) <= gapLimit) previous.push(word);
    else clusters.push([word]);
  }

  const margin = documentWidth * NUMERIC_CLUSTER_MARGIN_SHARE;
  const rectangles = clusters
    .filter((cluster) => cluster.length >= 2)
    .map((cluster) => {
      const leftNorm = Math.max(isolation.left, Math.min(...cluster.map((word) => word.box.x)) - margin);
      const rightNorm = Math.min(isolation.right, Math.max(...cluster.map(wordRight)) + margin);
      const left = Math.max(0, Math.floor(leftNorm * metadata.width));
      const right = Math.min(metadata.width, Math.ceil(rightNorm * metadata.width));
      return { left, top: 0, width: Math.max(1, right - left), height: metadata.height };
    })
    .filter((rectangle) => rectangle.width >= Math.max(12, metadata.width * 0.025))
    .sort((a, b) => a.left - b.left)
    .slice(-MAX_NUMERIC_COLUMNS);

  return rectangles.length ? rectangles : [fallbackNumericRectangle(isolation, metadata)];
}

function verticalOverlapRatio(a: OcrWord, b: OcrWord) {
  const aBottom = a.box.y + a.box.height;
  const bBottom = b.box.y + b.box.height;
  const overlap = Math.max(0, Math.min(aBottom, bBottom) - Math.max(a.box.y, b.box.y));
  return overlap / Math.max(0.001, Math.min(a.box.height, b.box.height));
}

function isMonetaryWord(word: OcrWord) {
  return MONEY_TOKEN.test(word.text.replace(/\s+/g, ""));
}

function isReplaceableNumericWord(word: OcrWord) {
  const text = word.text.replace(/\s+/g, "");
  if (!/\d/.test(text)) return false;
  return /[,.\/]/.test(text) || /^\d{3,}$/.test(text);
}

function mergeMonetaryRefinement(baseWords: OcrWord[], numericWords: OcrWord[]) {
  const replacements = numericWords.filter((word) => isMonetaryWord(word) && word.confidence >= 0.2);
  if (!replacements.length) return baseWords;

  const kept = baseWords.filter((word) => {
    if (!isReplaceableNumericWord(word)) return true;
    return !replacements.some((replacement) => {
      if (verticalOverlapRatio(word, replacement) < 0.35) return false;
      const widthAwareLimit = Math.max(0.025, Math.min(0.075, Math.max(word.box.width, replacement.box.width) * 1.6));
      return Math.abs(wordCenter(word) - wordCenter(replacement)) <= widthAwareLimit;
    });
  });

  const deduplicated = [...kept];
  for (const replacement of replacements) {
    const duplicate = deduplicated.some((word) => (
      word.text === replacement.text
      && verticalOverlapRatio(word, replacement) >= 0.65
      && Math.abs(wordCenter(word) - wordCenter(replacement)) <= 0.025
    ));
    if (!duplicate) deduplicated.push(replacement);
  }

  return deduplicated.sort((a, b) => {
    const yDelta = a.box.y - b.box.y;
    return Math.abs(yDelta) > 0.006 ? yDelta : a.box.x - b.box.x;
  });
}

async function recognizeMonetaryColumns(
  worker: Worker,
  bytes: Uint8Array,
  metadata: OcrImageMetadata,
  isolation: DocumentIsolation,
  baseWords: OcrWord[],
) {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    tessedit_char_whitelist: "0123456789,.",
    preserve_interword_spaces: "1",
    classify_bln_numeric_mode: "1",
  });
  let timedOut = false;
  try {
    const words: OcrWord[] = [];
    for (const rectangle of numericColumnRectangles(baseWords, isolation, metadata)) {
      const recognition = await withTimeout(
        worker.recognize(
          Buffer.from(bytes),
          { rotateRadians: 0, rectangle },
          { text: true, tsv: true },
        ),
        OCR_TIMEOUT_MS,
        "recognize",
      );
      const data = recognition?.data as unknown as RecognitionData;
      words.push(...parseTsv(data?.tsv, metadata.width, metadata.height, rectangle));
    }
    return words;
  } catch (error) {
    if (error instanceof OcrTimeoutError) timedOut = true;
    throw error;
  } finally {
    if (timedOut) {
      invalidateWorker();
    } else {
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          tessedit_char_whitelist: "",
          preserve_interword_spaces: "0",
          classify_bln_numeric_mode: "0",
        });
      } catch {
        invalidateWorker();
      }
    }
  }
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
  const words = parseTsv(data?.tsv, dimensions.width, dimensions.height, rectangle);
  return { words, score: candidateScore(words), rotationRadians, autoRotate };
}

async function refineBackgroundContamination(
  worker: Worker,
  bytes: Uint8Array,
  metadata: OcrImageMetadata,
  candidate: RecognitionCandidate,
) {
  // Fixed quarter-turn fallbacks are already proven by the rotation/EXIF regression suite.
  // Their coordinates are in the rotated space, so horizontal filtering must not reinterpret
  // the right-hand monetary column as a detached background band.
  if (Math.abs(candidate.rotationRadians) > ROTATION_EPSILON) return candidate;

  const isolation = isolateDocumentWords(candidate);
  if (!isolation) return candidate;

  const rectangle = cropRectangle(isolation, metadata);
  let selectedWords = isolation.words;
  try {
    const refined = await recognizeCandidate(worker, bytes, metadata, 0, false, rectangle);
    if (refinementIsSafe(isolation.words, refined.words)) selectedWords = refined.words;
  } catch (error) {
    if (error instanceof OcrTimeoutError) throw error;
    // The geometry-filtered first pass is still safer than reintroducing detached background text.
  }

  // Receipts commonly place quantity, unit price and line amount in neighbouring columns. Reading
  // the whole numeric half as one OCR region can merge those columns (for example swallowing a
  // decimal separator or joining adjacent amounts). Detect stable numeric x-clusters first and
  // re-read each narrow column independently from the original pixels. Replacements still require
  // an explicit two-decimal token; no amount is inferred from malformed text.
  try {
    const monetaryWords = await recognizeMonetaryColumns(worker, bytes, metadata, isolation, selectedWords);
    selectedWords = mergeMonetaryRefinement(selectedWords, monetaryWords);
  } catch (error) {
    if (error instanceof OcrTimeoutError) throw error;
    // Numeric refinement is additive hardening; keep the isolated document result if unavailable.
  }

  return { ...candidate, words: selectedWords, score: candidateScore(selectedWords), backgroundFiltered: true };
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
        try {
          const initial = await recognizeCandidate(worker, input.bytes, metadata, 0, true);
          let best = initial;
          if (needsOrientationFallback(initial.words, metadata)) {
            for (const rotationRadians of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
              const candidate = await recognizeCandidate(worker, input.bytes, metadata, rotationRadians, false);
              if (candidate.score > best.score) best = candidate;
            }
          }
          return await refineBackgroundContamination(worker, input.bytes, metadata, best);
        } finally {
          // Release Tesseract before this queue slot is handed to the next request.
          await terminateOwnedWorker(worker);
        }
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
      // A queue timeout means another request still owns the worker: never terminate its worker.
      if (!(error instanceof OcrTimeoutError && error.kind === "queue")) invalidateWorker();
      throw error;
    }
  }
}
