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

type Worker = Awaited<ReturnType<typeof createWorker>>;
type TimeoutKind = "queue" | "worker" | "recognize";
type RecognitionData = Record<string, unknown>;
type RecognitionCandidate = {
  words: OcrWord[];
  score: number;
  rotationRadians: number;
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

async function recognizeCandidate(
  worker: Worker,
  bytes: Uint8Array,
  metadata: OcrImageMetadata,
  rotationRadians: number,
  autoRotate: boolean,
): Promise<RecognitionCandidate> {
  const options = autoRotate ? { rotateAuto: true } : { rotateRadians: rotationRadians };
  const recognition = await withTimeout(
    worker.recognize(Buffer.from(bytes), options, { text: true, tsv: true, imageColor: true }),
    OCR_TIMEOUT_MS,
    "recognize",
  );
  const data = recognition?.data as unknown as RecognitionData;
  const dimensions = processedImageMetadata(data, metadata, rotationRadians);
  const words = parseTsv(data?.tsv, dimensions.width, dimensions.height);
  return { words, score: candidateScore(words), rotationRadians };
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
        if (!needsOrientationFallback(initial.words, metadata)) return initial;

        let best = initial;
        for (const rotationRadians of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
          const candidate = await recognizeCandidate(worker, input.bytes, metadata, rotationRadians, false);
          if (candidate.score > best.score) best = candidate;
        }
        return best;
      });

      const warnings: string[] = [];
      if (!selected.words.length) warnings.push("no_text_detected");
      if (Math.abs(selected.rotationRadians) > ROTATION_EPSILON) warnings.push("orientation_corrected");
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
