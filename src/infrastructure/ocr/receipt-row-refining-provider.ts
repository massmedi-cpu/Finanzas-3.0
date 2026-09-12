import path from "node:path";
import { createWorker, PSM } from "tesseract.js";
import type {
  DocumentOcrProvider,
  DocumentOcrProviderOutput,
} from "../../application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../domain/document-ocr";
import { readOcrImageMetadata, type OcrImageMetadata } from "./image-metadata";
import { TesseractImageOcrProvider } from "./tesseract-image-provider";

const SUPPORTED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MONEY_TOKEN = /^\d{1,6}[,.]\d{2}$/;
const INTEGER_TOKEN = /^\d{1,2}$/;
const MAX_REFINED_ROWS = 12;
const REFINE_TIMEOUT_MS = 9_000;
const QUEUE_TIMEOUT_MS = 8_000;
const EXTRACTOR_SUFFIX = "+row-refinement-v2";

type Worker = Awaited<ReturnType<typeof createWorker>>;
type ImageRectangle = { left: number; top: number; width: number; height: number };
type RawTsvWord = {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
};
type Row = {
  words: OcrWord[];
  box: OcrBoundingBox;
  text: string;
  shouldRefine: boolean;
  summaryLike: boolean;
};

type RowRecognition = {
  row: Row;
  numericWords: OcrWord[];
  textWords: OcrWord[];
};

let workerPromise: Promise<Worker> | null = null;
let queueTail: Promise<void> = Promise.resolve();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
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
    await withTimeout(previous, QUEUE_TIMEOUT_MS, "ocr_refinement_queue_timeout");
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
    words.push({
      text,
      confidence: Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence / 100)) : 0.5,
      left,
      top,
      width,
      height,
    });
  }
  return words;
}

function parseRectangleTsv(tsv: unknown, metadata: OcrImageMetadata, rectangle: ImageRectangle): OcrWord[] {
  const raw = rawTsvWords(tsv);
  if (!raw.length) return [];
  const minLeft = Math.min(...raw.map((word) => word.left));
  const maxRight = Math.max(...raw.map((word) => word.left + word.width));
  const minTop = Math.min(...raw.map((word) => word.top));
  const maxBottom = Math.max(...raw.map((word) => word.top + word.height));
  const localX = rectangle.left > 0 && minLeft < rectangle.left - 2 && maxRight <= rectangle.width + 4;
  const localY = rectangle.top > 0 && minTop < rectangle.top - 2 && maxBottom <= rectangle.height + 4;
  const offsetX = localX ? rectangle.left : 0;
  const offsetY = localY ? rectangle.top : 0;

  return raw.flatMap((word) => {
    const left = word.left + offsetX;
    const top = word.top + offsetY;
    const right = Math.min(metadata.width, left + word.width);
    const bottom = Math.min(metadata.height, top + word.height);
    if (right <= left || bottom <= top) return [];
    return [{
      text: word.text,
      confidence: word.confidence,
      box: {
        x: Math.max(0, left / metadata.width),
        y: Math.max(0, top / metadata.height),
        width: Math.min(1, (right - left) / metadata.width),
        height: Math.min(1, (bottom - top) / metadata.height),
      },
    } satisfies OcrWord];
  });
}

function unionBox(words: OcrWord[]): OcrBoundingBox {
  const left = Math.min(...words.map((word) => word.box.x));
  const top = Math.min(...words.map((word) => word.box.y));
  const right = Math.max(...words.map((word) => word.box.x + word.box.width));
  const bottom = Math.max(...words.map((word) => word.box.y + word.box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function verticalOverlap(a: OcrBoundingBox, b: OcrBoundingBox) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, bottom - top) / Math.max(0.000001, Math.min(a.height, b.height));
}

function belongsToRow(word: OcrWord, rowWords: OcrWord[]) {
  const row = unionBox(rowWords);
  if (verticalOverlap(word.box, row) >= 0.35) return true;
  const wordCenter = word.box.y + word.box.height / 2;
  const rowCenter = row.y + row.height / 2;
  return Math.abs(wordCenter - rowCenter) <= Math.max(word.box.height, row.height) * 0.58;
}

function cleanToken(text: string) {
  return text.replace(/[€\s]/g, "");
}

function isMoney(text: string) {
  return MONEY_TOKEN.test(cleanToken(text));
}

function isInteger(text: string) {
  return INTEGER_TOKEN.test(cleanToken(text));
}

function suspiciousNumeric(text: string) {
  const token = cleanToken(text);
  return /^\d{3,6}$/.test(token) || /^\d{1,6}[,.]\d{3,}$/.test(token);
}

function isNumericLike(word: OcrWord) {
  const token = cleanToken(word.text);
  return /\d/.test(token) && /^[\d,./:-]+$/.test(token);
}

function alphaChars(text: string) {
  return (text.match(/\p{L}/gu) ?? []).length;
}

function averageConfidence(words: OcrWord[]) {
  if (!words.length) return 0;
  return words.reduce((sum, word) => sum + word.confidence, 0) / words.length;
}

function clusterRows(words: OcrWord[]) {
  const sorted = [...words].sort((a, b) => {
    const ay = a.box.y + a.box.height / 2;
    const by = b.box.y + b.box.height / 2;
    return ay - by || a.box.x - b.box.x;
  });
  const rows: OcrWord[][] = [];
  for (const word of sorted) {
    let best = -1;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < rows.length; index += 1) {
      if (!belongsToRow(word, rows[index])) continue;
      const box = unionBox(rows[index]);
      const rowCenter = box.y + box.height / 2;
      const wordCenter = word.box.y + word.box.height / 2;
      const nextDistance = Math.abs(wordCenter - rowCenter);
      if (nextDistance < distance) {
        best = index;
        distance = nextDistance;
      }
    }
    if (best === -1) rows.push([word]);
    else rows[best].push(word);
  }

  return rows.map((rowWords) => {
    const ordered = [...rowWords].sort((a, b) => a.box.x - b.box.x);
    const text = ordered.map((word) => word.text).join(" ");
    const numeric = ordered.filter((word) => /\d/.test(word.text));
    const moneyCount = numeric.filter((word) => isMoney(word.text)).length;
    const summaryLike = /\b(total|subtotal|iva|base|importe)\b/i.test(text);
    const shouldRefine = summaryLike
      ? moneyCount < 1 || numeric.some((word) => suspiciousNumeric(word.text))
      : numeric.some((word) => suspiciousNumeric(word.text)) || numeric.length >= 3;
    return {
      words: ordered,
      box: unionBox(ordered),
      text,
      shouldRefine,
      summaryLike,
    } satisfies Row;
  }).filter((row) => row.shouldRefine);
}

function rowPriority(row: Row) {
  const numeric = row.words.filter((word) => /\d/.test(word.text));
  const suspiciousCount = numeric.filter((word) => suspiciousNumeric(word.text)).length;
  const moneyCount = numeric.filter((word) => isMoney(word.text)).length;
  const productLike = alphaChars(row.text) >= 3 && numeric.length >= 2;
  return (row.summaryLike ? 1000 : 0)
    + suspiciousCount * 120
    + (numeric.length >= 3 ? 80 : 0)
    + (productLike ? 100 : 0)
    + moneyCount * 8
    + Math.min(40, alphaChars(row.text)) * 0.1;
}

export function selectRowsForRefinement(words: OcrWord[]) {
  return clusterRows(words)
    .map((row) => ({ row, score: rowPriority(row) }))
    .sort((a, b) => b.score - a.score || a.row.box.y - b.row.box.y)
    .slice(0, MAX_REFINED_ROWS)
    .map((item) => item.row)
    .sort((a, b) => a.box.y - b.box.y);
}

function documentBounds(words: OcrWord[]) {
  const substantial = words.filter((word) => alphaChars(word.text) >= 2 || /\d/.test(word.text));
  const source = substantial.length >= 6 ? substantial : words;
  const left = Math.max(0, Math.min(...source.map((word) => word.box.x)) - 0.012);
  const right = Math.min(1, Math.max(...source.map((word) => word.box.x + word.box.width)) + 0.012);
  return { left, right, width: Math.max(0.001, right - left) };
}

function rowRectangle(
  row: Row,
  metadata: OcrImageMetadata,
  leftNorm: number,
  rightNorm: number,
): ImageRectangle {
  const verticalPad = Math.max(row.box.height * 0.7, 0.004);
  const topNorm = Math.max(0, row.box.y - verticalPad);
  const bottomNorm = Math.min(1, row.box.y + row.box.height + verticalPad);
  const left = Math.max(0, Math.floor(leftNorm * metadata.width));
  const right = Math.min(metadata.width, Math.ceil(rightNorm * metadata.width));
  const top = Math.max(0, Math.floor(topNorm * metadata.height));
  const bottom = Math.min(metadata.height, Math.ceil(bottomNorm * metadata.height));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function numericQuality(words: OcrWord[]) {
  const candidates = words.filter((word) => isNumericLike(word));
  if (!candidates.length) return -10;
  const money = candidates.filter((word) => isMoney(word.text)).length;
  const integers = candidates.filter((word) => isInteger(word.text)).length;
  const suspicious = candidates.filter((word) => suspiciousNumeric(word.text)).length;
  return money * 5 + integers * 0.8 + averageConfidence(candidates) * 2 - suspicious * 4;
}

function textQuality(words: OcrWord[]) {
  if (!words.length) return -10;
  const text = words.map((word) => word.text).join(" ");
  const alpha = alphaChars(text);
  const visible = text.replace(/\s/g, "").length;
  if (!alpha || !visible) return -10;
  const noise = (text.match(/[^\p{L}\p{N} ,.:'+\-\/]/gu) ?? []).length;
  return alpha * 0.08 + averageConfidence(words) * 4 - noise * 0.25;
}

function overlapsRow(word: OcrWord, row: Row) {
  return verticalOverlap(word.box, row.box) >= 0.25;
}

function horizontallyAdjacent(left: OcrWord, right: OcrWord) {
  const gap = right.box.x - (left.box.x + left.box.width);
  const allowance = Math.max(0.01, Math.max(left.box.height, right.box.height) * 1.35);
  return gap >= -allowance * 0.5 && gap <= allowance;
}

function mergedOcrWord(parts: OcrWord[], text: string): OcrWord {
  return {
    text,
    confidence: Math.min(...parts.map((word) => word.confidence)),
    box: unionBox(parts),
  };
}

function coalesceExplicitDecimalTokens(words: OcrWord[]) {
  const ordered = [...words].sort((a, b) => a.box.x - b.box.x);
  const result: OcrWord[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const first = ordered[index];
    const firstToken = cleanToken(first.text);
    const second = ordered[index + 1];
    const secondToken = second ? cleanToken(second.text) : "";
    const third = ordered[index + 2];
    const thirdToken = third ? cleanToken(third.text) : "";

    if (
      /^\d{1,6}$/.test(firstToken)
      && /^[,.]$/.test(secondToken)
      && /^\d{2}$/.test(thirdToken)
      && horizontallyAdjacent(first, second)
      && horizontallyAdjacent(second, third)
    ) {
      result.push(mergedOcrWord([first, second, third], `${firstToken}${secondToken}${thirdToken}`));
      index += 2;
      continue;
    }

    if (
      /^\d{1,6}[,.]$/.test(firstToken)
      && /^\d{2}$/.test(secondToken)
      && horizontallyAdjacent(first, second)
    ) {
      result.push(mergedOcrWord([first, second], `${firstToken}${secondToken}`));
      index += 1;
      continue;
    }

    if (
      /^\d{1,6}$/.test(firstToken)
      && /^[,.]\d{2}$/.test(secondToken)
      && horizontallyAdjacent(first, second)
    ) {
      result.push(mergedOcrWord([first, second], `${firstToken}${secondToken}`));
      index += 1;
      continue;
    }

    result.push(first);
  }
  return result;
}

export function mergeRefinedNumericRow(
  baseWords: OcrWord[],
  row: Row,
  refinedWords: OcrWord[],
  numericStart: number,
) {
  const normalizedRefinedWords = coalesceExplicitDecimalTokens(refinedWords);
  const usable = normalizedRefinedWords.filter((word) => {
    const token = cleanToken(word.text);
    return word.confidence >= 0.12 && (MONEY_TOKEN.test(token) || INTEGER_TOKEN.test(token));
  });
  if (!usable.some((word) => isMoney(word.text))) return baseWords;

  const baseNumeric = row.words.filter((word) => word.box.x >= numericStart && isNumericLike(word));
  const baseScore = numericQuality(baseNumeric);
  const refinedScore = numericQuality(usable);
  const baseSuspicious = baseNumeric.some((word) => suspiciousNumeric(word.text));
  const requiredGain = baseSuspicious || row.summaryLike ? -0.1 : 0.75;
  if (refinedScore < baseScore + requiredGain) return baseWords;

  const kept = baseWords.filter((word) => !(
    word.box.x >= numericStart
    && isNumericLike(word)
    && overlapsRow(word, row)
  ));
  return [...kept, ...usable];
}

export function mergeRefinedTextRow(
  baseWords: OcrWord[],
  row: Row,
  refinedWords: OcrWord[],
  numericStart: number,
) {
  if (row.summaryLike) return baseWords;
  const usable = refinedWords.filter((word) => word.confidence >= 0.12 && alphaChars(word.text) > 0);
  if (!usable.length) return baseWords;

  const baseText = row.words.filter((word) => word.box.x < numericStart && alphaChars(word.text) > 0);
  if (!baseText.length) return baseWords;
  const baseAlpha = alphaChars(baseText.map((word) => word.text).join(" "));
  const refinedAlpha = alphaChars(usable.map((word) => word.text).join(" "));
  if (refinedAlpha < Math.max(3, baseAlpha * 0.5)) return baseWords;
  if (textQuality(usable) < textQuality(baseText) - 0.15) return baseWords;

  const kept = baseWords.filter((word) => !(
    word.box.x < numericStart
    && alphaChars(word.text) > 0
    && overlapsRow(word, row)
  ));
  return [...kept, ...usable];
}

async function recognizeRectangle(
  worker: Worker,
  bytes: Uint8Array,
  metadata: OcrImageMetadata,
  rectangle: ImageRectangle,
) {
  const recognition = await withTimeout(
    worker.recognize(
      Buffer.from(bytes),
      { rotateRadians: 0, rectangle },
      { text: true, tsv: true },
    ),
    REFINE_TIMEOUT_MS,
    "ocr_row_refinement_timeout",
  );
  return parseRectangleTsv((recognition?.data as unknown as Record<string, unknown>)?.tsv, metadata, rectangle);
}

async function refineRows(bytes: Uint8Array, metadata: OcrImageMetadata, baseWords: OcrWord[]) {
  if (baseWords.length < 8) return baseWords;
  const rows = selectRowsForRefinement(baseWords);
  if (!rows.length) return baseWords;
  const bounds = documentBounds(baseWords);
  if (bounds.width < 0.18) return baseWords;
  const numericStart = bounds.left + bounds.width * 0.4;
  const numericLeft = Math.max(bounds.left, numericStart - bounds.width * 0.035);
  const numericRight = Math.min(1, bounds.right + bounds.width * 0.02);

  return exclusive(async () => {
    const worker = await withTimeout(getWorker(), REFINE_TIMEOUT_MS, "ocr_row_refinement_worker_timeout");
    const recognized: RowRecognition[] = [];

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: "0123456789,.",
      preserve_interword_spaces: "1",
      classify_bln_numeric_mode: "1",
    });
    for (const row of rows) {
      const rectangle = rowRectangle(row, metadata, numericLeft, numericRight);
      const numericWords = await recognizeRectangle(worker, bytes, metadata, rectangle).catch(() => []);
      recognized.push({ row, numericWords, textWords: [] });
    }

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: "",
      preserve_interword_spaces: "1",
      classify_bln_numeric_mode: "0",
    });
    for (const item of recognized) {
      if (item.row.summaryLike || !coalesceExplicitDecimalTokens(item.numericWords).some((word) => isMoney(word.text))) continue;
      const rectangle = rowRectangle(
        item.row,
        metadata,
        Math.max(0, bounds.left - bounds.width * 0.02),
        Math.min(bounds.right, numericStart + bounds.width * 0.02),
      );
      item.textWords = await recognizeRectangle(worker, bytes, metadata, rectangle).catch(() => []);
    }

    let words = baseWords;
    for (const item of recognized) {
      words = mergeRefinedNumericRow(words, item.row, item.numericWords, numericStart);
      words = mergeRefinedTextRow(words, item.row, item.textWords, numericStart);
    }
    return words.sort((a, b) => {
      const ay = a.box.y + a.box.height / 2;
      const by = b.box.y + b.box.height / 2;
      return Math.abs(ay - by) > Math.max(a.box.height, b.box.height) * 0.45
        ? ay - by
        : a.box.x - b.box.x;
    });
  });
}

export class ReceiptRowRefiningImageOcrProvider implements DocumentOcrProvider {
  constructor(private readonly base: DocumentOcrProvider = new TesseractImageOcrProvider()) {}

  supports(mimeType: string) {
    return SUPPORTED_MIMES.has(mimeType.toLowerCase()) && this.base.supports(mimeType);
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }): Promise<DocumentOcrProviderOutput> {
    const base = await this.base.extract(input);
    const metadata = readOcrImageMetadata(input.bytes);
    if (!metadata || base.pages.length !== 1 || !base.pages[0]?.words.length) return base;

    try {
      const words = await refineRows(input.bytes, metadata, base.pages[0].words);
      return {
        ...base,
        extractor: `${base.extractor}${EXTRACTOR_SUFFIX}`.slice(0, 100),
        pages: [{ ...base.pages[0], words }],
      };
    } catch {
      invalidateWorker();
      return base;
    }
  }
}
