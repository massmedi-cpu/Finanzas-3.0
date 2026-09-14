import path from "node:path";
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
import { deriveNumericColumnBands } from "./receipt-row-refining-provider";

const MONEY_TOKEN = /^\d{1,6}[,.]\d{2}$/;
const INTEGER_TOKEN = /^\d{1,2}$/;
const CELL_TIMEOUT_MS = 8_000;
const QUEUE_TIMEOUT_MS = 8_000;
const EXTRACTOR_SUFFIX = "+row-cell-consensus-v6";
const MAX_TARGET_CELLS = 14;

type Worker = Awaited<ReturnType<typeof createWorker>>;
type ImageRectangle = { left: number; top: number; width: number; height: number };
type NumericBand = ReturnType<typeof deriveNumericColumnBands>[number];
type CellKind = "integer" | "money";
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
  rowIndex: number;
  band: NumericBand;
  bandIndex: number;
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
    await withTimeout(previous, QUEUE_TIMEOUT_MS, "ocr_row_cell_queue_timeout");
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

function unionBox(words: OcrWord[]): OcrBoundingBox {
  const left = Math.min(...words.map((word) => word.box.x));
  const top = Math.min(...words.map((word) => word.box.y));
  const right = Math.max(...words.map((word) => word.box.x + word.box.width));
  const bottom = Math.max(...words.map((word) => word.box.y + word.box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
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

function strongest(words: OcrWord[]) {
  return [...words].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

function cents(text: string) {
  if (!isMoney(text)) return null;
  const normalized = cleanToken(text).replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function integerValue(text: string) {
  if (!isInteger(text)) return null;
  const value = Number(cleanToken(text));
  return Number.isInteger(value) ? value : null;
}

export function productRowArithmeticMismatch(unitText: string, priceText: string, amountText: string) {
  const units = integerValue(unitText);
  const price = cents(priceText);
  const amount = cents(amountText);
  if (units === null || price === null || amount === null) return false;
  return Math.abs(units * price - amount) > 1;
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
  const allowance = Math.max(0.008, Math.max(left.box.height, right.box.height) * 1.25);
  return gap >= -allowance * 0.4 && gap <= allowance;
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

function candidates(words: OcrWord[], kind: CellKind) {
  return coalesceExplicitDecimalTokens(words)
    .filter((word) => word.confidence >= 0.06)
    .filter((word) => kind === "money" ? isMoney(word.text) : isInteger(word.text));
}

export function chooseRowCellConsensus(observations: OcrWord[], kind: CellKind) {
  const valid = observations.filter((word) => kind === "money" ? isMoney(word.text) : isInteger(word.text));
  if (!valid.length) return null;
  const groups = new Map<string, OcrWord[]>();
  for (const word of valid) {
    const key = tokenKey(word.text);
    groups.set(key, [...(groups.get(key) ?? []), word]);
  }
  const ranked = [...groups.entries()]
    .map(([key, words]) => ({
      key,
      words,
      support: words.length,
      averageConfidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length,
    }))
    .sort((a, b) => b.support - a.support || b.averageConfidence - a.averageConfidence);
  const best = ranked[0];
  if (best.support < 2 || best.averageConfidence < 0.08) return null;
  if (ranked[1] && ranked[1].support >= best.support && ranked[1].key !== best.key) return null;
  return [...best.words].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

function cropRectangle(
  metadata: OcrImageMetadata,
  row: SweepRow,
  band: NumericBand,
  variant: 0 | 1,
): ImageRectangle {
  const horizontalPad = variant === 0 ? 0.008 : 0.022;
  const verticalPad = variant === 0
    ? Math.max(0.006, row.box.height * 0.65)
    : Math.max(0.012, row.box.height * 1.25);
  const leftNorm = Math.max(0, band.left - horizontalPad);
  const rightNorm = Math.min(1, band.right + horizontalPad);
  const topNorm = Math.max(0, row.box.y - verticalPad);
  const bottomNorm = Math.min(1, row.box.y + row.box.height + verticalPad);
  const left = Math.floor(leftNorm * metadata.width);
  const right = Math.ceil(rightNorm * metadata.width);
  const top = Math.floor(topNorm * metadata.height);
  const bottom = Math.ceil(bottomNorm * metadata.height);
  return {
    left,
    top,
    width: Math.max(3, right - left),
    height: Math.max(3, bottom - top),
  };
}

async function recognizeCell(
  worker: Worker,
  bytes: Uint8Array,
  metadata: OcrImageMetadata,
  rectangle: ImageRectangle,
  kind: CellKind,
  variant: 0 | 1,
) {
  await worker.setParameters({
    tessedit_pageseg_mode: variant === 0 ? PSM.SINGLE_WORD : PSM.SINGLE_LINE,
    tessedit_char_whitelist: kind === "money" ? "0123456789,." : "0123456789",
    preserve_interword_spaces: "1",
    classify_bln_numeric_mode: "1",
  });
  const recognition = await withTimeout(
    worker.recognize(
      Buffer.from(bytes),
      { rotateRadians: 0, rectangle },
      { text: true, tsv: true },
    ),
    CELL_TIMEOUT_MS,
    "ocr_row_cell_timeout",
  );
  return candidates(
    parseRectangleTsv((recognition?.data as unknown as Record<string, unknown>)?.tsv, metadata, rectangle),
    kind,
  );
}

function targetCells(baseWords: OcrWord[], rows: SweepRow[], bands: NumericBand[]) {
  const targets: CellTarget[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row.summaryLike) {
      const bandIndex = bands.length - 1;
      const existing = existingWordsForCell(baseWords, row, bands[bandIndex], "money");
      if (!existing.length && /\b(total|subtotal)\b/i.test(row.text)) {
        targets.push({ row, rowIndex, band: bands[bandIndex], bandIndex, kind: "money", reason: "summary_missing" });
      }
      continue;
    }

    const unitBand = bands[0];
    const priceBand = bands[bands.length - 2];
    const amountBand = bands[bands.length - 1];
    const unit = strongest(existingWordsForCell(baseWords, row, unitBand, "integer"));
    const price = strongest(existingWordsForCell(baseWords, row, priceBand, "money"));
    const amount = strongest(existingWordsForCell(baseWords, row, amountBand, "money"));

    const missing: Array<[NumericBand, number, CellKind]> = [];
    if (!unit) missing.push([unitBand, 0, "integer"]);
    if (!price) missing.push([priceBand, bands.length - 2, "money"]);
    if (!amount) missing.push([amountBand, bands.length - 1, "money"]);

    if (missing.length) {
      for (const [band, bandIndex, kind] of missing) {
        targets.push({ row, rowIndex, band, bandIndex, kind, reason: "missing" });
      }
      continue;
    }

    if (productRowArithmeticMismatch(unit.text, price.text, amount.text)) {
      targets.push({ row, rowIndex, band: priceBand, bandIndex: bands.length - 2, kind: "money", reason: "arithmetic_mismatch" });
      targets.push({ row, rowIndex, band: amountBand, bandIndex: bands.length - 1, kind: "money", reason: "arithmetic_mismatch" });
    }
  }
  return targets.slice(0, MAX_TARGET_CELLS);
}

async function recoverCells(bytes: Uint8Array, metadata: OcrImageMetadata, baseWords: OcrWord[]) {
  const rows = selectReceiptRowsForColumnSweep(baseWords);
  if (rows.length < 3) return baseWords;
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

  const targets = targetCells(baseWords, rows, bands);
  if (!targets.length) return baseWords;

  return exclusive(async () => {
    const worker = await withTimeout(getWorker(), CELL_TIMEOUT_MS, "ocr_row_cell_worker_timeout");
    let words = baseWords;
    let attemptedCells = 0;
    let observedCells = 0;
    let changedCells = 0;
    let consensusCells = 0;
    let summaryRecovered = 0;
    const reasons: Record<CellTarget["reason"], number> = {
      missing: 0,
      arithmetic_mismatch: 0,
      summary_missing: 0,
    };

    for (const target of targets) {
      attemptedCells += 1;
      reasons[target.reason] += 1;
      const observations: OcrWord[] = [];
      for (const variant of [0, 1] as const) {
        const rectangle = cropRectangle(metadata, target.row, target.band, variant);
        const pass = await recognizeCell(worker, bytes, metadata, rectangle, target.kind, variant).catch(() => []);
        const best = strongest(pass);
        if (best) observations.push(best);
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
      console.info("ocr-row-cell-consensus-v6", {
        rows: rows.length,
        numericBands: bands.length,
        targetCells: targets.length,
        attemptedCells,
        observedCells,
        changedCells,
        consensusCells,
        summaryRecovered,
        reasons,
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

export class ReceiptRowCellConsensusImageOcrProvider implements DocumentOcrProvider {
  constructor(private readonly base: DocumentOcrProvider = new ReceiptColumnSweepImageOcrProvider()) {}

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
