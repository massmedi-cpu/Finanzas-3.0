import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import type {
  DocumentOcrProvider,
  DocumentOcrProviderOutput,
} from "../../application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../domain/document-ocr";
import { readOcrImageMetadata, type OcrImageMetadata } from "./image-metadata";
import {
  ReceiptColumnSweepImageOcrProvider,
  mergeColumnSweepCell,
  selectReceiptRowsForColumnSweep,
  type SweepRow,
} from "./receipt-column-sweep-provider";
import {
  chooseRowCellConsensus,
  productRowArithmeticMismatch,
  ReceiptRowCellConsensusImageOcrProvider,
} from "./receipt-row-cell-consensus-provider";
import { deriveNumericColumnBands } from "./receipt-row-refining-provider";

const MONEY_TOKEN = /^\d{1,6}[,.]\d{2}$/;
const INTEGER_TOKEN = /^\d{1,2}$/;
const CELL_TIMEOUT_MS = 10_000;
const QUEUE_TIMEOUT_MS = 8_000;
const MAX_TARGET_CELLS = 14;
const TARGET_CELL_HEIGHT = 144;
const MIN_SCALE = 2;
const MAX_SCALE = 6;
const EXTRACTOR_SUFFIX = "+upscaled-cell-consensus-v7";

type Worker = Awaited<ReturnType<typeof createWorker>>;
type NumericBand = ReturnType<typeof deriveNumericColumnBands>[number];
type CellKind = "integer" | "money";
type ImageRectangle = { left: number; top: number; width: number; height: number };
type PreparedCell = {
  bytes: Buffer;
  width: number;
  height: number;
  scale: number;
  sourceRectangle: ImageRectangle;
};
type RawTsvWord = {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
};
type CellTarget = {
  row: SweepRow;
  band: NumericBand;
  kind: CellKind;
  reason: "missing" | "arithmetic_mismatch" | "summary_missing";
};

let workerPromise: Promise<Worker> | null = null;
let queueTail: Promise<void> = Promise.resolve();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
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
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  queueTail = previous.then(() => slot);
  try {
    await withTimeout(previous, QUEUE_TIMEOUT_MS, "ocr_upscaled_cell_queue_timeout");
    return await task();
  } finally {
    release();
  }
}

function cleanToken(text: string) {
  return text.replace(/[€\s]/g, "");
}

function tokenKey(text: string) {
  return cleanToken(text).replace(",", ".");
}

function isMoney(text: string) {
  return MONEY_TOKEN.test(cleanToken(text));
}

function isInteger(text: string) {
  return INTEGER_TOKEN.test(cleanToken(text));
}

function centerX(word: OcrWord) {
  return word.box.x + word.box.width / 2;
}

function verticalOverlap(a: OcrBoundingBox, b: OcrBoundingBox) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, bottom - top) / Math.max(0.000001, Math.min(a.height, b.height));
}

function strongest(words: OcrWord[]) {
  return [...words].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

function documentBounds(words: OcrWord[]) {
  const substantial = words.filter((word) => /\p{L}{2,}/u.test(word.text) || /\d/.test(word.text));
  const source = substantial.length >= 6 ? substantial : words;
  const left = Math.max(0, Math.min(...source.map((word) => word.box.x)) - 0.012);
  const right = Math.min(1, Math.max(...source.map((word) => word.box.x + word.box.width)) + 0.012);
  return { left, right, width: Math.max(0.001, right - left) };
}

function existingWordsForCell(baseWords: OcrWord[], row: SweepRow, band: NumericBand, kind: CellKind) {
  return baseWords.filter((word) => {
    const x = centerX(word);
    if (x < band.left || x > band.right) return false;
    if (verticalOverlap(word.box, row.box) < 0.2) return false;
    return kind === "money" ? isMoney(word.text) : isInteger(word.text);
  });
}

export function cellUpscaleFactor(sourceHeight: number) {
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) return MAX_SCALE;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.ceil(TARGET_CELL_HEIGHT / sourceHeight)));
}

function sourceRectangle(
  metadata: OcrImageMetadata,
  row: SweepRow,
  band: NumericBand,
  variant: 0 | 1,
  summaryLike: boolean,
): ImageRectangle {
  const horizontalPad = summaryLike
    ? (variant === 0 ? 0.025 : 0.055)
    : (variant === 0 ? 0.012 : 0.028);
  const verticalPad = variant === 0
    ? Math.max(0.008, row.box.height * 0.8)
    : Math.max(0.016, row.box.height * 1.45);
  const leftNorm = Math.max(0, band.left - horizontalPad);
  const rightNorm = Math.min(1, band.right + horizontalPad);
  const topNorm = Math.max(0, row.box.y - verticalPad);
  const bottomNorm = Math.min(1, row.box.y + row.box.height + verticalPad);
  const left = Math.max(0, Math.floor(leftNorm * metadata.width));
  const right = Math.min(metadata.width, Math.ceil(rightNorm * metadata.width));
  const top = Math.max(0, Math.floor(topNorm * metadata.height));
  const bottom = Math.min(metadata.height, Math.ceil(bottomNorm * metadata.height));
  return {
    left,
    top,
    width: Math.max(3, right - left),
    height: Math.max(3, bottom - top),
  };
}

async function prepareCellImage(bytes: Uint8Array, rectangle: ImageRectangle, variant: 0 | 1): Promise<PreparedCell> {
  const scale = cellUpscaleFactor(rectangle.height);
  const width = Math.max(24, Math.round(rectangle.width * scale));
  const height = Math.max(TARGET_CELL_HEIGHT, Math.round(rectangle.height * scale));
  let pipeline = sharp(Buffer.from(bytes), { failOn: "error" })
    .extract(rectangle)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize();
  if (variant === 1) pipeline = pipeline.sharpen({ sigma: 0.9, m1: 0.8, m2: 1.6 });
  const prepared = await pipeline.png({ compressionLevel: 3 }).toBuffer();
  return { bytes: prepared, width, height, scale, sourceRectangle: rectangle };
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

function preparedWords(tsv: unknown, metadata: OcrImageMetadata, prepared: PreparedCell): OcrWord[] {
  const scaleX = prepared.width / prepared.sourceRectangle.width;
  const scaleY = prepared.height / prepared.sourceRectangle.height;
  return rawTsvWords(tsv).flatMap((word) => {
    const left = prepared.sourceRectangle.left + word.left / scaleX;
    const top = prepared.sourceRectangle.top + word.top / scaleY;
    const width = word.width / scaleX;
    const height = word.height / scaleY;
    const right = Math.min(metadata.width, left + width);
    const bottom = Math.min(metadata.height, top + height);
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
  const allowance = Math.max(0.008, Math.max(left.box.height, right.box.height) * 1.6);
  return gap >= -allowance * 0.5 && gap <= allowance;
}

function unionBox(words: OcrWord[]): OcrBoundingBox {
  const left = Math.min(...words.map((word) => word.box.x));
  const top = Math.min(...words.map((word) => word.box.y));
  const right = Math.max(...words.map((word) => word.box.x + word.box.width));
  const bottom = Math.max(...words.map((word) => word.box.y + word.box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function coalesceExplicitDecimals(words: OcrWord[]) {
  const ordered = [...words].sort((a, b) => a.box.x - b.box.x);
  const result: OcrWord[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const first = ordered[index];
    const second = ordered[index + 1];
    const third = ordered[index + 2];
    const a = cleanToken(first.text);
    const b = second ? cleanToken(second.text) : "";
    const c = third ? cleanToken(third.text) : "";
    if (
      /^\d{1,6}$/.test(a)
      && /^[,.]$/.test(b)
      && /^\d{2}$/.test(c)
      && horizontallyAdjacent(first, second)
      && horizontallyAdjacent(second, third)
    ) {
      result.push({ text: `${a}${b}${c}`, confidence: Math.min(first.confidence, second.confidence, third.confidence), box: unionBox([first, second, third]) });
      index += 2;
      continue;
    }
    if (/^\d{1,6}[,.]$/.test(a) && /^\d{2}$/.test(b) && horizontallyAdjacent(first, second)) {
      result.push({ text: `${a}${b}`, confidence: Math.min(first.confidence, second.confidence), box: unionBox([first, second]) });
      index += 1;
      continue;
    }
    if (/^\d{1,6}$/.test(a) && /^[,.]\d{2}$/.test(b) && horizontallyAdjacent(first, second)) {
      result.push({ text: `${a}${b}`, confidence: Math.min(first.confidence, second.confidence), box: unionBox([first, second]) });
      index += 1;
      continue;
    }
    result.push(first);
  }
  return result;
}

function candidates(words: OcrWord[], kind: CellKind) {
  return coalesceExplicitDecimals(words)
    .filter((word) => word.confidence >= 0.05)
    .filter((word) => kind === "money" ? isMoney(word.text) : isInteger(word.text));
}

async function recognizePreparedCell(
  worker: Worker,
  prepared: PreparedCell,
  metadata: OcrImageMetadata,
  kind: CellKind,
  variant: 0 | 1,
) {
  await worker.setParameters({
    tessedit_pageseg_mode: variant === 0 ? PSM.SINGLE_WORD : PSM.SINGLE_LINE,
    tessedit_char_whitelist: kind === "money" ? "0123456789,." : "0123456789",
    preserve_interword_spaces: "1",
    classify_bln_numeric_mode: "1",
    user_defined_dpi: "300",
  });
  const recognition = await withTimeout(
    worker.recognize(prepared.bytes, { rotateRadians: 0 }, { text: true, tsv: true }),
    CELL_TIMEOUT_MS,
    "ocr_upscaled_cell_timeout",
  );
  return candidates(
    preparedWords((recognition?.data as unknown as Record<string, unknown>)?.tsv, metadata, prepared),
    kind,
  );
}

function targetCells(baseWords: OcrWord[], rows: SweepRow[], bands: NumericBand[]) {
  const targets: CellTarget[] = [];
  for (const row of rows) {
    if (row.summaryLike) {
      const amountBand = bands[bands.length - 1];
      const existing = existingWordsForCell(baseWords, row, amountBand, "money");
      if (!existing.length && /\b(total|subtotal)\b/i.test(row.text)) {
        targets.push({ row, band: amountBand, kind: "money", reason: "summary_missing" });
      }
      continue;
    }

    const unitBand = bands[0];
    const priceBand = bands[bands.length - 2];
    const amountBand = bands[bands.length - 1];
    const unit = strongest(existingWordsForCell(baseWords, row, unitBand, "integer"));
    const price = strongest(existingWordsForCell(baseWords, row, priceBand, "money"));
    const amount = strongest(existingWordsForCell(baseWords, row, amountBand, "money"));

    if (!unit) targets.push({ row, band: unitBand, kind: "integer", reason: "missing" });
    if (!price) targets.push({ row, band: priceBand, kind: "money", reason: "missing" });
    if (!amount) targets.push({ row, band: amountBand, kind: "money", reason: "missing" });

    if (unit && price && amount && productRowArithmeticMismatch(unit.text, price.text, amount.text)) {
      targets.push({ row, band: priceBand, kind: "money", reason: "arithmetic_mismatch" });
      targets.push({ row, band: amountBand, kind: "money", reason: "arithmetic_mismatch" });
    }
  }
  return targets.slice(0, MAX_TARGET_CELLS);
}

async function recoverUpscaledCells(bytes: Uint8Array, metadata: OcrImageMetadata, baseWords: OcrWord[]) {
  const rows = selectReceiptRowsForColumnSweep(baseWords);
  if (rows.length < 3) return baseWords;
  const bounds = documentBounds(baseWords);
  if (bounds.width < 0.18) return baseWords;
  const bands = deriveNumericColumnBands(
    rows.flatMap((row) => row.words),
    bounds.left + bounds.width * 0.4,
    Math.min(1, bounds.right + bounds.width * 0.02),
    bounds.width,
  );
  if (bands.length < 3) return baseWords;
  const targets = targetCells(baseWords, rows, bands);
  if (!targets.length) return baseWords;

  return exclusive(async () => {
    const worker = await withTimeout(getWorker(), CELL_TIMEOUT_MS, "ocr_upscaled_cell_worker_timeout");
    let words = baseWords;
    let attemptedCells = 0;
    let preparedCells = 0;
    let observedCells = 0;
    let changedCells = 0;
    let consensusCells = 0;
    let summaryRecovered = 0;
    let prepFailures = 0;
    let minCropWidth = Number.POSITIVE_INFINITY;
    let minCropHeight = Number.POSITIVE_INFINITY;
    let minScale = Number.POSITIVE_INFINITY;
    let maxScale = 0;
    const reasons: Record<CellTarget["reason"], number> = { missing: 0, arithmetic_mismatch: 0, summary_missing: 0 };

    for (const target of targets) {
      attemptedCells += 1;
      reasons[target.reason] += 1;
      const observations: OcrWord[] = [];
      for (const variant of [0, 1] as const) {
        const rectangle = sourceRectangle(metadata, target.row, target.band, variant, target.row.summaryLike);
        minCropWidth = Math.min(minCropWidth, rectangle.width);
        minCropHeight = Math.min(minCropHeight, rectangle.height);
        try {
          const prepared = await prepareCellImage(bytes, rectangle, variant);
          preparedCells += 1;
          minScale = Math.min(minScale, prepared.scale);
          maxScale = Math.max(maxScale, prepared.scale);
          const pass = await recognizePreparedCell(worker, prepared, metadata, target.kind, variant).catch(() => []);
          const best = strongest(pass);
          if (best) observations.push(best);
        } catch {
          prepFailures += 1;
        }
      }
      if (observations.length) observedCells += 1;
      const recovered = chooseRowCellConsensus(observations, target.kind);
      if (!recovered) continue;
      consensusCells += 1;
      const existing = existingWordsForCell(words, target.row, target.band, target.kind);
      if (existing.some((word) => tokenKey(word.text) === tokenKey(recovered.text))) continue;
      words = mergeColumnSweepCell(words, target.row, target.band, recovered);
      changedCells += 1;
      if (target.reason === "summary_missing") summaryRecovered += 1;
    }

    if (process.env.VERCEL_ENV === "preview") {
      console.info("ocr-upscaled-cell-consensus-v7", {
        rows: rows.length,
        numericBands: bands.length,
        targetCells: targets.length,
        attemptedCells,
        preparedCells,
        observedCells,
        changedCells,
        consensusCells,
        summaryRecovered,
        prepFailures,
        minCropWidth: Number.isFinite(minCropWidth) ? minCropWidth : null,
        minCropHeight: Number.isFinite(minCropHeight) ? minCropHeight : null,
        minScale: Number.isFinite(minScale) ? minScale : null,
        maxScale,
        reasons,
      });
    }

    return words.sort((a, b) => {
      const ay = a.box.y + a.box.height / 2;
      const by = b.box.y + b.box.height / 2;
      return Math.abs(ay - by) > Math.max(a.box.height, b.box.height) * 0.45 ? ay - by : a.box.x - b.box.x;
    });
  });
}

export class ReceiptUpscaledCellConsensusImageOcrProvider implements DocumentOcrProvider {
  constructor(private readonly base: DocumentOcrProvider = new ReceiptRowCellConsensusImageOcrProvider(new ReceiptColumnSweepImageOcrProvider())) {}

  supports(mimeType: string) {
    return this.base.supports(mimeType);
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }): Promise<DocumentOcrProviderOutput> {
    const base = await this.base.extract(input);
    const metadata = readOcrImageMetadata(input.bytes);
    if (!metadata || base.pages.length !== 1 || !base.pages[0]?.words.length) return base;
    try {
      const words = await recoverUpscaledCells(input.bytes, metadata, base.pages[0].words);
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
