import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import type {
  DocumentOcrProvider,
  DocumentOcrProviderOutput,
} from "../../application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../domain/document-ocr";
import { isReceiptMoney, receiptMoneyKey } from "../../domain/receipt-money";
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

const INTEGER_TOKEN = /^\d{1,2}$/;
const CELL_TIMEOUT_MS = 10_000;
const QUEUE_TIMEOUT_MS = 8_000;
const MAX_TARGET_CELLS = 16;
const TARGET_CELL_HEIGHT = 180;
const MIN_SCALE = 2;
const MAX_SCALE = 7;
const EXTRACTOR_SUFFIX = "+focused-cell-consensus-v8";

type Worker = Awaited<ReturnType<typeof createWorker>>;
type NumericBand = ReturnType<typeof deriveNumericColumnBands>[number];
type CellKind = "integer" | "money";
type Variant = 0 | 1 | 2;
type ImageRectangle = { left: number; top: number; width: number; height: number };
type PreparedCell = {
  bytes: Buffer;
  width: number;
  height: number;
  scale: number;
  sourceRectangle: ImageRectangle;
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
    await withTimeout(previous, QUEUE_TIMEOUT_MS, "ocr_focused_cell_queue_timeout");
    return await task();
  } finally {
    release();
  }
}

function cleanToken(text: string) {
  return text.replace(/[€\s]/g, "");
}

function tokenKey(text: string) {
  return receiptMoneyKey(text) ?? cleanToken(text).replace(",", ".");
}

function isMoney(text: string) {
  return isReceiptMoney(text);
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

export function focusedCellUpscaleFactor(sourceHeight: number) {
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) return MAX_SCALE;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.ceil(TARGET_CELL_HEIGHT / sourceHeight)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function focusedCellRectangle(
  metadata: OcrImageMetadata,
  row: SweepRow,
  band: NumericBand,
  kind: CellKind,
  variant: Variant,
): ImageRectangle {
  const lineHeight = Math.max(10, row.box.height * metadata.height);
  const bandLeft = clamp(Math.floor(band.left * metadata.width), 0, metadata.width - 1);
  const bandRight = clamp(Math.ceil(band.right * metadata.width), bandLeft + 1, metadata.width);
  const bandWidth = Math.max(1, bandRight - bandLeft);
  const center = clamp(Math.round(band.center * metadata.width), bandLeft, bandRight);

  const kindFactor = kind === "integer" ? 2.25 : (row.summaryLike ? 5.0 : 4.25);
  const variantFactor = variant === 0 ? 1 : variant === 1 ? 1.28 : 1.08;
  const desiredWidth = Math.max(kind === "integer" ? 48 : 72, Math.round(lineHeight * kindFactor * variantFactor));
  const width = Math.max(12, Math.min(bandWidth, desiredWidth));
  let left = Math.round(center - width / 2);
  left = clamp(left, bandLeft, Math.max(bandLeft, bandRight - width));

  const rowCenter = (row.box.y + row.box.height / 2) * metadata.height;
  const verticalFactor = variant === 0 ? 1.55 : variant === 1 ? 2.0 : 1.7;
  const desiredHeight = Math.max(36, Math.round(lineHeight * verticalFactor));
  const top = clamp(Math.round(rowCenter - desiredHeight / 2), 0, Math.max(0, metadata.height - desiredHeight));
  const bottom = Math.min(metadata.height, top + desiredHeight);

  return {
    left,
    top,
    width: Math.max(3, Math.min(metadata.width - left, width)),
    height: Math.max(3, bottom - top),
  };
}

async function prepareCellImage(bytes: Uint8Array, rectangle: ImageRectangle, variant: Variant): Promise<PreparedCell> {
  const scale = focusedCellUpscaleFactor(rectangle.height);
  const width = Math.max(96, Math.round(rectangle.width * scale));
  const height = Math.max(TARGET_CELL_HEIGHT, Math.round(rectangle.height * scale));
  let pipeline = sharp(Buffer.from(bytes), { failOn: "error" })
    .extract(rectangle)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize();

  if (variant === 0) {
    pipeline = pipeline.sharpen({ sigma: 0.8, m1: 0.7, m2: 1.4 });
  } else if (variant === 1) {
    pipeline = pipeline.linear(1.22, -16).sharpen({ sigma: 1.0, m1: 0.9, m2: 1.8 });
  } else {
    pipeline = pipeline.threshold(170);
  }

  const prepared = await pipeline.png({ compressionLevel: 3 }).toBuffer();
  return { bytes: prepared, width, height, scale, sourceRectangle: rectangle };
}

function normalizedRecognitionText(text: unknown) {
  return typeof text === "string"
    ? text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function tsvText(tsv: unknown) {
  if (typeof tsv !== "string") return "";
  const tokens: string[] = [];
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const columns = line.split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;
    const token = columns.slice(11).join("\t").trim();
    if (token) tokens.push(token);
  }
  return tokens.join(" ");
}

export function explicitNumericTokens(text: string, kind: CellKind) {
  const normalized = normalizedRecognitionText(text)
    .replace(/\s*([,.])\s*/g, "$1");
  const matches = kind === "money"
    ? [...normalized.matchAll(/(?:^|[^\d])([0-9]{1,6}[,.][0-9]{2})(?!\d)/g)].map((match) => match[1])
    : [...normalized.matchAll(/(?:^|[^\d,.])([0-9]{1,2})(?![\d,.])/g)].map((match) => match[1]);
  return [...new Set(matches.map((token) => cleanToken(token)).filter((token) => kind === "money" ? isMoney(token) : isInteger(token)))];
}

function targetBox(metadata: OcrImageMetadata, rectangle: ImageRectangle): OcrBoundingBox {
  return {
    x: rectangle.left / metadata.width,
    y: rectangle.top / metadata.height,
    width: rectangle.width / metadata.width,
    height: rectangle.height / metadata.height,
  };
}

function recognitionCandidate(
  data: Record<string, unknown>,
  kind: CellKind,
  metadata: OcrImageMetadata,
  rectangle: ImageRectangle,
) {
  const sources = [normalizedRecognitionText(data.text), tsvText(data.tsv)].filter(Boolean);
  const tokens = [...new Set(sources.flatMap((source) => explicitNumericTokens(source, kind)).map(tokenKey))];
  if (tokens.length !== 1) return null;
  const token = tokens[0].replace(".", ",");
  if (kind === "money" && !isMoney(token)) return null;
  if (kind === "integer" && !isInteger(token)) return null;
  const rawConfidence = Number(data.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? clamp(rawConfidence / 100, 0.05, 1)
    : 0.35;
  return {
    text: token,
    confidence,
    box: targetBox(metadata, rectangle),
  } satisfies OcrWord;
}

async function recognizePreparedCell(
  worker: Worker,
  prepared: PreparedCell,
  metadata: OcrImageMetadata,
  kind: CellKind,
  variant: Variant,
) {
  await worker.setParameters({
    tessedit_pageseg_mode: variant === 1 ? PSM.SINGLE_LINE : PSM.SINGLE_WORD,
    tessedit_char_whitelist: kind === "money" ? "0123456789,." : "0123456789",
    preserve_interword_spaces: "1",
    classify_bln_numeric_mode: "1",
    user_defined_dpi: "300",
  });
  const recognition = await withTimeout(
    worker.recognize(prepared.bytes, { rotateRadians: 0 }, { text: true, tsv: true }),
    CELL_TIMEOUT_MS,
    "ocr_focused_cell_timeout",
  );
  return recognitionCandidate(
    (recognition?.data as unknown as Record<string, unknown>) ?? {},
    kind,
    metadata,
    prepared.sourceRectangle,
  );
}

function targetCells(baseWords: OcrWord[], rows: SweepRow[], bands: NumericBand[]) {
  const targets: CellTarget[] = [];
  for (const row of rows) {
    if (row.summaryLike) {
      const amountBand = bands[bands.length - 1];
      const existing = existingWordsForCell(baseWords, row, amountBand, "money");
      if (!existing.length && /\b(total|subtotal|base|iva)\b/i.test(row.text)) {
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

async function recoverFocusedCells(bytes: Uint8Array, metadata: OcrImageMetadata, baseWords: OcrWord[]) {
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
    const worker = await withTimeout(getWorker(), CELL_TIMEOUT_MS, "ocr_focused_cell_worker_timeout");
    let words = baseWords;
    let attemptedCells = 0;
    let preparedCells = 0;
    let observedCells = 0;
    let changedCells = 0;
    let consensusCells = 0;
    let summaryRecovered = 0;
    let prepFailures = 0;
    let minCropWidth = Number.POSITIVE_INFINITY;
    let maxCropWidth = 0;
    let minCropHeight = Number.POSITIVE_INFINITY;
    let maxCropHeight = 0;
    let minScale = Number.POSITIVE_INFINITY;
    let maxScale = 0;
    const reasons: Record<CellTarget["reason"], number> = { missing: 0, arithmetic_mismatch: 0, summary_missing: 0 };

    for (const target of targets) {
      attemptedCells += 1;
      reasons[target.reason] += 1;
      const observations: OcrWord[] = [];

      for (const variant of [0, 1, 2] as const) {
        const rectangle = focusedCellRectangle(metadata, target.row, target.band, target.kind, variant);
        minCropWidth = Math.min(minCropWidth, rectangle.width);
        maxCropWidth = Math.max(maxCropWidth, rectangle.width);
        minCropHeight = Math.min(minCropHeight, rectangle.height);
        maxCropHeight = Math.max(maxCropHeight, rectangle.height);
        try {
          const prepared = await prepareCellImage(bytes, rectangle, variant);
          preparedCells += 1;
          minScale = Math.min(minScale, prepared.scale);
          maxScale = Math.max(maxScale, prepared.scale);
          const candidate = await recognizePreparedCell(worker, prepared, metadata, target.kind, variant).catch(() => null);
          if (candidate) observations.push(candidate);
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
      console.info("ocr-focused-cell-consensus-v8", {
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
        maxCropWidth,
        minCropHeight: Number.isFinite(minCropHeight) ? minCropHeight : null,
        maxCropHeight,
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

export class ReceiptFocusedCellConsensusImageOcrProvider implements DocumentOcrProvider {
  constructor(
    private readonly base: DocumentOcrProvider = new ReceiptRowCellConsensusImageOcrProvider(
      new ReceiptColumnSweepImageOcrProvider(),
    ),
  ) {}

  supports(mimeType: string) {
    return this.base.supports(mimeType);
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }): Promise<DocumentOcrProviderOutput> {
    const base = await this.base.extract(input);
    const metadata = readOcrImageMetadata(input.bytes);
    if (!metadata || base.pages.length !== 1 || !base.pages[0]?.words.length) return base;
    try {
      const words = await recoverFocusedCells(input.bytes, metadata, base.pages[0].words);
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
