import path from "node:path";
import { createWorker, PSM } from "tesseract.js";
import type {
  DocumentOcrProvider,
  DocumentOcrProviderOutput,
} from "../../application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../domain/document-ocr";
import { isReceiptMoney } from "../../domain/receipt-money";
import { readOcrImageMetadata, type OcrImageMetadata } from "./image-metadata";
import {
  deriveNumericColumnBands,
  ReceiptRowRefiningImageOcrProvider,
} from "./receipt-row-refining-provider";

const CELL_TIMEOUT_MS = 8_000;
const QUEUE_TIMEOUT_MS = 8_000;
const MAX_RECOVERY_ROWS = 10;
const EXTRACTOR_SUFFIX = "+cell-recovery-v4";

type Worker = Awaited<ReturnType<typeof createWorker>>;
type ImageRectangle = { left: number; top: number; width: number; height: number };
type NumericBand = ReturnType<typeof deriveNumericColumnBands>[number];
type RawTsvWord = {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type RecoveryRow = {
  words: OcrWord[];
  box: OcrBoundingBox;
  text: string;
  summaryLike: boolean;
  productLike: boolean;
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
    await withTimeout(previous, QUEUE_TIMEOUT_MS, "ocr_cell_recovery_queue_timeout");
    return await task();
  } finally {
    release();
  }
}

function cleanToken(text: string) {
  return text.replace(/[€\s]/g, "");
}

function isMoney(text: string) {
  return isReceiptMoney(text);
}

function isNumericLike(word: OcrWord) {
  const token = cleanToken(word.text);
  return /\d/.test(token) && /^[\d,./:-]+$/.test(token);
}

function suspiciousNumeric(text: string) {
  const token = cleanToken(text);
  return /^\d{3,6}$/.test(token) || /^\d{1,6}[,.]\d{3,}$/.test(token);
}

function alphaChars(text: string) {
  return (text.match(/\p{L}/gu) ?? []).length;
}

function centerX(word: OcrWord) {
  return word.box.x + word.box.width / 2;
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
  if (verticalOverlap(word.box, row) >= 0.32) return true;
  const wordCenter = word.box.y + word.box.height / 2;
  const rowCenter = row.y + row.height / 2;
  return Math.abs(wordCenter - rowCenter) <= Math.max(word.box.height, row.height) * 0.56;
}

function clusterRows(words: OcrWord[]) {
  const sorted = [...words].sort((a, b) => {
    const ay = a.box.y + a.box.height / 2;
    const by = b.box.y + b.box.height / 2;
    return ay - by || a.box.x - b.box.x;
  });
  const rows: OcrWord[][] = [];
  for (const word of sorted) {
    let target = -1;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < rows.length; index += 1) {
      if (!belongsToRow(word, rows[index])) continue;
      const box = unionBox(rows[index]);
      const nextDistance = Math.abs(
        word.box.y + word.box.height / 2 - (box.y + box.height / 2),
      );
      if (nextDistance < distance) {
        target = index;
        distance = nextDistance;
      }
    }
    if (target === -1) rows.push([word]);
    else rows[target].push(word);
  }
  return rows.map((rowWords) => {
    const ordered = [...rowWords].sort((a, b) => a.box.x - b.box.x);
    const text = ordered.map((word) => word.text).join(" ");
    return {
      words: ordered,
      box: unionBox(ordered),
      text,
      summaryLike: /\b(total|subtotal|base|iva)\b/i.test(text),
      productLike: alphaChars(text) >= 3 && ordered.some((word) => isNumericLike(word)),
    } satisfies RecoveryRow;
  });
}

function documentBounds(words: OcrWord[]) {
  const substantial = words.filter((word) => alphaChars(word.text) >= 2 || /\d/.test(word.text));
  const source = substantial.length >= 6 ? substantial : words;
  const left = Math.max(0, Math.min(...source.map((word) => word.box.x)) - 0.012);
  const right = Math.min(1, Math.max(...source.map((word) => word.box.x + word.box.width)) + 0.012);
  return { left, right, width: Math.max(0.001, right - left) };
}

export function selectReceiptRowsForCellRecovery(words: OcrWord[]) {
  const rows = clusterRows(words);
  const headerIndex = rows.findIndex((row) => (
    /descripci[oó]n/i.test(row.text)
    && /(uds|precio|importe)/i.test(row.text)
  ));
  if (headerIndex === -1) return [];

  const afterHeader = rows.slice(headerIndex + 1);
  const firstSummary = afterHeader.findIndex((row) => row.summaryLike);
  const bodyEnd = firstSummary === -1 ? afterHeader.length : Math.min(afterHeader.length, firstSummary + 4);
  return afterHeader
    .slice(0, bodyEnd)
    .filter((row) => row.productLike || row.summaryLike)
    .slice(0, MAX_RECOVERY_ROWS);
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

function horizontallyAdjacent(left: OcrWord, right: OcrWord) {
  const gap = right.box.x - (left.box.x + left.box.width);
  const allowance = Math.max(0.01, Math.max(left.box.height, right.box.height) * 1.5);
  return gap >= -allowance * 0.5 && gap <= allowance;
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
      result.push({
        text: `${firstToken}${secondToken}${thirdToken}`,
        confidence: Math.min(first.confidence, second.confidence, third.confidence),
        box: unionBox([first, second, third]),
      });
      index += 2;
      continue;
    }

    if (
      /^\d{1,6}[,.]$/.test(firstToken)
      && /^\d{2}$/.test(secondToken)
      && horizontallyAdjacent(first, second)
    ) {
      result.push({
        text: `${firstToken}${secondToken}`,
        confidence: Math.min(first.confidence, second.confidence),
        box: unionBox([first, second]),
      });
      index += 1;
      continue;
    }

    if (
      /^\d{1,6}$/.test(firstToken)
      && /^[,.]\d{2}$/.test(secondToken)
      && horizontallyAdjacent(first, second)
    ) {
      result.push({
        text: `${firstToken}${secondToken}`,
        confidence: Math.min(first.confidence, second.confidence),
        box: unionBox([first, second]),
      });
      index += 1;
      continue;
    }

    result.push(first);
  }
  return result;
}

function rowRectangle(
  row: RecoveryRow,
  metadata: OcrImageMetadata,
  band: NumericBand,
  horizontalPad = 0,
): ImageRectangle {
  const verticalPad = Math.max(row.box.height * 1.05, 0.006);
  const topNorm = Math.max(0, row.box.y - verticalPad);
  const bottomNorm = Math.min(1, row.box.y + row.box.height + verticalPad);
  const leftNorm = Math.max(0, band.left - horizontalPad);
  const rightNorm = Math.min(1, band.right + horizontalPad);
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
    CELL_TIMEOUT_MS,
    "ocr_cell_recovery_timeout",
  );
  return parseRectangleTsv((recognition?.data as unknown as Record<string, unknown>)?.tsv, metadata, rectangle);
}

function wordsInBand(row: RecoveryRow, band: NumericBand) {
  return row.words.filter((word) => {
    const center = centerX(word);
    return isNumericLike(word) && center >= band.left && center <= band.right;
  });
}

function chooseVisibleMoney(words: OcrWord[], band: NumericBand) {
  const candidates = coalesceExplicitDecimalTokens(words)
    .filter((word) => word.confidence >= 0.08 && isMoney(word.text))
    .sort((a, b) => {
      const aDistance = Math.abs(centerX(a) - band.center);
      const bDistance = Math.abs(centerX(b) - band.center);
      return aDistance - bDistance || b.confidence - a.confidence;
    });
  if (!candidates.length) return null;
  const distinct = new Set(candidates.map((word) => cleanToken(word.text)));
  if (distinct.size > 1) return null;
  return candidates[0];
}

export function mergeRecoveredNumericCell(
  baseWords: OcrWord[],
  row: RecoveryRow,
  band: NumericBand,
  recovered: OcrWord | null,
) {
  if (!recovered || !isMoney(recovered.text)) return baseWords;
  const kept = baseWords.filter((word) => {
    const x = centerX(word);
    const inBand = x >= band.left && x <= band.right;
    return !(inBand && isNumericLike(word) && verticalOverlap(word.box, row.box) >= 0.25);
  });
  return [...kept, recovered];
}

async function recoverCells(bytes: Uint8Array, metadata: OcrImageMetadata, baseWords: OcrWord[]) {
  const rows = selectReceiptRowsForCellRecovery(baseWords);
  if (!rows.length) return baseWords;
  const bounds = documentBounds(baseWords);
  if (bounds.width < 0.18) return baseWords;
  const numericStart = bounds.left + bounds.width * 0.4;
  const bands = deriveNumericColumnBands(
    rows.flatMap((row) => row.words),
    numericStart,
    Math.min(1, bounds.right + bounds.width * 0.02),
    bounds.width,
  );
  if (bands.length < 3) return baseWords;

  return exclusive(async () => {
    const worker = await withTimeout(getWorker(), CELL_TIMEOUT_MS, "ocr_cell_recovery_worker_timeout");
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: "0123456789,.",
      preserve_interword_spaces: "1",
      classify_bln_numeric_mode: "0",
    });

    let words = baseWords;
    let attemptedCells = 0;
    let recoveredCells = 0;
    let fallbackAttempts = 0;
    let minCellWidth = Number.POSITIVE_INFINITY;
    const horizontalPad = Math.max(0.008, bounds.width * 0.014);

    for (const row of rows) {
      const indices = row.summaryLike ? [bands.length - 1] : [bands.length - 2, bands.length - 1];
      for (const index of indices) {
        const band = bands[index];
        const existing = wordsInBand(row, band);
        const hasReliableMoney = existing.some((word) => isMoney(word.text) && word.confidence >= 0.35);
        const hasSuspicious = existing.some((word) => suspiciousNumeric(word.text));
        if (hasReliableMoney && !hasSuspicious) continue;

        const firstRectangle = rowRectangle(row, metadata, band);
        attemptedCells += 1;
        minCellWidth = Math.min(minCellWidth, firstRectangle.width);
        const firstWords = await recognizeRectangle(worker, bytes, metadata, firstRectangle).catch(() => []);
        let recovered = chooseVisibleMoney(firstWords, band);

        if (!recovered) {
          fallbackAttempts += 1;
          const fallbackRectangle = rowRectangle(row, metadata, band, horizontalPad);
          minCellWidth = Math.min(minCellWidth, fallbackRectangle.width);
          const fallbackWords = await recognizeRectangle(worker, bytes, metadata, fallbackRectangle).catch(() => []);
          recovered = chooseVisibleMoney(fallbackWords, band);
        }

        if (!recovered) continue;
        recoveredCells += 1;
        words = mergeRecoveredNumericCell(words, row, band, recovered);
      }
    }

    if (process.env.VERCEL_ENV === "preview") {
      console.info("ocr-cell-recovery-v4", {
        rows: rows.length,
        numericBands: bands.length,
        attemptedCells,
        recoveredCells,
        fallbackAttempts,
        minCellWidth: Number.isFinite(minCellWidth) ? minCellWidth : null,
      });
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

export class ReceiptCellRecoveryImageOcrProvider implements DocumentOcrProvider {
  constructor(private readonly base: DocumentOcrProvider = new ReceiptRowRefiningImageOcrProvider()) {}

  supports(mimeType: string) {
    return this.base.supports(mimeType);
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }): Promise<DocumentOcrProviderOutput> {
    const base = await this.base.extract(input);
    const metadata = readOcrImageMetadata(input.bytes);
    if (!metadata || base.pages.length !== 1 || !base.pages[0]?.words.length) return base;

    try {
      const words = await recoverCells(input.bytes, metadata, base.pages[0].words);
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
