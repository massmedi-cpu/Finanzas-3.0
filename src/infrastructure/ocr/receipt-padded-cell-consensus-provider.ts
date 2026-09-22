import { clusterOcrRows, ocrRowTextBox } from "../../domain/ocr-rows";
import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import type {
  DocumentOcrProvider,
  DocumentOcrProviderOutput,
} from "../../application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../domain/document-ocr";
import { readOcrImageMetadata, type OcrImageMetadata } from "./image-metadata";
import { normalizeReceiptIllumination } from "./receipt-illumination";
import {
  mergeColumnSweepCell,
  selectReceiptRowsForColumnSweep,
  type SweepRow,
} from "./receipt-column-sweep-provider";
import {
  focusedCellRectangle,
  ReceiptFocusedCellConsensusImageOcrProvider,
} from "./receipt-focused-cell-consensus-provider";
import { productRowArithmeticMismatch } from "./receipt-row-cell-consensus-provider";
import { deriveNumericColumnBands } from "./receipt-row-refining-provider";

const MONEY_TOKEN = /^\d{1,6}[,.]\d{2}$/;
const INTEGER_TOKEN = /^\d{1,2}$/;
const CELL_TIMEOUT_MS = 8_000;
const QUEUE_TIMEOUT_MS = 8_000;
const MAX_TARGET_CELLS = 24;
const TARGET_CONTENT_HEIGHT = 48;
const MIN_SCALE = 1;
const MAX_SCALE = 3;
const HORIZONTAL_PADDING = 8;
const VERTICAL_PADDING = 8;
const EXTRACTOR_SUFFIX = "+padded-cell-consensus-v22";

type Worker = Awaited<ReturnType<typeof createWorker>>;
type NumericBand = ReturnType<typeof deriveNumericColumnBands>[number];
type CellKind = "integer" | "money";
type PreparedVariant = 0 | 1;
type SegmentationName = "single_word" | "single_line" | "raw_line";
type ImageRectangle = { left: number; top: number; width: number; height: number };
type CellTarget = {
  row: SweepRow;
  band: NumericBand;
  kind: CellKind;
  reason: "missing" | "arithmetic_mismatch" | "summary_missing" | "low_confidence";
};

type PreparedCell = {
  bytes: Buffer;
  sourceRectangle: ImageRectangle;
  contentWidth: number;
  contentHeight: number;
  paddedWidth: number;
  paddedHeight: number;
  scale: number;
};

export type PaddedRecognitionObservation = {
  word: OcrWord;
  variant: PreparedVariant;
  segmentation: SegmentationName;
};

type RecognitionSignals = {
  observation: PaddedRecognitionObservation | null;
  hasDigits: boolean;
  hasExplicitDecimal: boolean;
  hasBareDigits: boolean;
};

class PaddedCellTimeoutError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

let workerPromise: Promise<Worker> | null = null;
let queueTail: Promise<void> = Promise.resolve();
let pipelineTail: Promise<void> = Promise.resolve();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PaddedCellTimeoutError(label)), timeoutMs);
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
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  queueTail = previous.then(() => slot);
  try {
    await withTimeout(previous, QUEUE_TIMEOUT_MS, "ocr_padded_cell_queue_timeout");
    return await task();
  } finally {
    release();
  }
}

async function exclusivePipeline<T>(task: () => Promise<T>) {
  const previous = pipelineTail.catch(() => undefined);
  let release!: () => void;
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  pipelineTail = previous.then(() => slot);
  await previous;
  try {
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

function suspiciousNumericToken(text: string) {
  const token = cleanToken(text);
  return /^\d{3,6}$/.test(token) || /^\d{1,6}[,.]\d{3,}$/.test(token);
}

function centerX(word: OcrWord) {
  return word.box.x + word.box.width / 2;
}

function isolatedShortNumericRowsAfterTotal(words: OcrWord[]) {
  const rows = clusterOcrRows(words);
  const totalIndex = rows.findIndex((row) => row.some((word) => /^total$/i.test(cleanToken(word.text))));
  if (totalIndex < 0) return 0;
  return rows.slice(totalIndex + 1).filter((row) => (
    row.length === 1
    && /^\d{1,2}$/.test(cleanToken(row[0].text))
  )).length;
}

function verticalOverlap(a: OcrBoundingBox, b: OcrBoundingBox) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, bottom - top) / Math.max(0.000001, Math.min(a.height, b.height));
}

function strongest(words: OcrWord[]) {
  return [...words].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

function existingWordsForCell(baseWords: OcrWord[], row: SweepRow, band: NumericBand, kind: CellKind) {
  return baseWords.filter((word) => {
    const x = centerX(word);
    if (x < band.left || x > band.right) return false;
    if (verticalOverlap(word.box, row.box) < 0.2) return false;
    return kind === "money" ? isMoney(word.text) : isInteger(word.text);
  });
}

function horizontalOverlapWithBand(word: OcrWord, band: NumericBand) {
  const left = Math.max(word.box.x, band.left);
  const right = Math.min(word.box.x + word.box.width, band.right);
  const overlap = Math.max(0, right - left);
  return overlap / Math.max(0.000001, Math.min(word.box.width, band.right - band.left));
}

function numericOrGlyphNoise(word: OcrWord) {
  const token = cleanToken(word.text);
  if (!token) return true;
  if (/\d/.test(token) && /^[\d,./:-]+$/.test(token)) return true;
  return token.length <= 2
    && !/[\p{L}\p{N}]{2,}/u.test(token)
    && /^[\p{P}\p{S}Iil|]+$/u.test(token);
}

function rowContainsWord(row: SweepRow, word: OcrWord) {
  if (verticalOverlap(word.box, row.box) >= 0.2) return true;
  const rowCenter = row.box.y + row.box.height / 2;
  const wordCenter = word.box.y + word.box.height / 2;
  return Math.abs(rowCenter - wordCenter) <= Math.max(row.box.height, word.box.height) * 0.55;
}

function cleanCanonicalCell(
  words: OcrWord[],
  row: SweepRow,
  band: NumericBand,
  kind: CellKind,
  removed: Set<OcrWord>,
) {
  const candidates = words.filter((word) => (
    !removed.has(word)
    && rowContainsWord(row, word)
    && (centerX(word) >= band.left && centerX(word) <= band.right
      || horizontalOverlapWithBand(word, band) >= 0.3)
  ));
  const valid = candidates.filter((word) => kind === "money" ? isMoney(word.text) : isInteger(word.text));
  if (!valid.length) return null;
  const keep = strongest(valid);
  if (!keep) return null;

  for (const candidate of candidates) {
    if (candidate === keep) continue;
    if ((kind === "money" ? isMoney(candidate.text) : isInteger(candidate.text))
      || suspiciousNumericToken(candidate.text)
      || numericOrGlyphNoise(candidate)) {
      removed.add(candidate);
    }
  }
  return keep;
}

/**
 * Final structural guard for receipt tables. It never invents values: it only removes
 * competing numeric/glyph residue after a valid cell is already present in that row/band.
 * It also discards isolated short numeric debris after the printed Total and tiny orphan
 * rows between the final complete product row and the summary block.
 */
export function finalizeReceiptTableWords(
  baseWords: OcrWord[],
  rows: SweepRow[],
  bands: NumericBand[],
) {
  if (rows.length < 3 || bands.length < 3) return baseWords;
  const removed = new Set<OcrWord>();
  const unitBand = bands[0];
  const priceBand = bands[bands.length - 2];
  const amountBand = bands[bands.length - 1];
  const productRows = rows.filter((row) => !row.summaryLike);
  const summaryRows = rows.filter((row) => row.summaryLike);

  let lastCompleteProductBottom = -1;
  for (const row of productRows) {
    const unit = cleanCanonicalCell(baseWords, row, unitBand, "integer", removed);
    const price = cleanCanonicalCell(baseWords, row, priceBand, "money", removed);
    const amount = cleanCanonicalCell(baseWords, row, amountBand, "money", removed);
    const hasCompleteNumericShape = Boolean(unit && (price || amount));

    if (hasCompleteNumericShape) {
      lastCompleteProductBottom = Math.max(lastCompleteProductBottom, row.box.y + row.box.height);
      const numericLeft = unitBand.left;
      const numericRight = amountBand.right;
      for (const word of baseWords) {
        if (removed.has(word) || !rowContainsWord(row, word)) continue;
        const x = centerX(word);
        if (x < numericLeft || x > numericRight) continue;
        const belongsToKnownBand = [unitBand, priceBand, amountBand].some((band) => (
          (x >= band.left && x <= band.right) || horizontalOverlapWithBand(word, band) >= 0.3
        ));
        if (!belongsToKnownBand && (numericOrGlyphNoise(word) || suspiciousNumericToken(word.text))) {
          removed.add(word);
        }
      }
    }
  }

  for (const row of summaryRows) {
    const summaryBand = summaryRecoveryBand(row, amountBand);
    const amount = cleanCanonicalCell(baseWords, row, summaryBand, "money", removed);
    if (!amount) continue;
    for (const word of baseWords) {
      if (removed.has(word) || !rowContainsWord(row, word) || word === amount) continue;
      if (centerX(word) < Math.min(summaryBand.left, amountBand.left) - 0.03) continue;
      if (numericOrGlyphNoise(word) || suspiciousNumericToken(word.text)) removed.add(word);
    }
  }

  const firstSummaryTop = summaryRows.length
    ? Math.min(...summaryRows.map((row) => row.box.y))
    : Number.POSITIVE_INFINITY;
  if (lastCompleteProductBottom >= 0 && Number.isFinite(firstSummaryTop)) {
    const clustered = clusterOcrRows(baseWords.filter((word) => !removed.has(word)));
    for (const clusteredRow of clustered) {
      const rowBox = ocrRowTextBox(clusteredRow);
      if (rowBox.y <= lastCompleteProductBottom || rowBox.y >= firstSummaryTop) continue;
      const joined = clusteredRow.map((word) => cleanToken(word.text)).join("");
      const letters = (joined.match(/\p{L}/gu) ?? []).length;
      const hasMoney = clusteredRow.some((word) => isMoney(word.text));
      const hasUsefulInteger = clusteredRow.some((word) => isInteger(word.text));
      if (!hasMoney && !hasUsefulInteger && letters > 0 && letters <= 3) {
        clusteredRow.forEach((word) => removed.add(word));
      } else if (!hasMoney && letters === 0 && clusteredRow.every((word) => numericOrGlyphNoise(word))) {
        clusteredRow.forEach((word) => removed.add(word));
      }
    }
  }

  const remaining = baseWords.filter((word) => !removed.has(word));
  const clustered = clusterOcrRows(remaining);
  const totalRowIndex = clustered.findIndex((row) => row.some((word) => /^total:?$/i.test(cleanToken(word.text))));
  if (totalRowIndex >= 0) {
    for (const row of clustered.slice(totalRowIndex + 1)) {
      const text = row.map((word) => cleanToken(word.text)).join("");
      const hasMeaningfulLetters = (text.match(/\p{L}/gu) ?? []).length >= 2;
      const hasMoney = row.some((word) => isMoney(word.text));
      if (!hasMeaningfulLetters && !hasMoney && row.every((word) => numericOrGlyphNoise(word))) {
        row.forEach((word) => removed.add(word));
      }
    }
  }

  return baseWords.filter((word) => !removed.has(word));
}

function documentBounds(words: OcrWord[]) {
  const substantial = words.filter((word) => /\p{L}{2,}/u.test(word.text) || /\d/.test(word.text));
  const source = substantial.length >= 6 ? substantial : words;
  const left = Math.max(0, Math.min(...source.map((word) => word.box.x)) - 0.012);
  const right = Math.min(1, Math.max(...source.map((word) => word.box.x + word.box.width)) + 0.012);
  return { left, right, width: Math.max(0.001, right - left) };
}

function targetBox(metadata: OcrImageMetadata, rectangle: ImageRectangle): OcrBoundingBox {
  return {
    x: rectangle.left / metadata.width,
    y: rectangle.top / metadata.height,
    width: rectangle.width / metadata.width,
    height: rectangle.height / metadata.height,
  };
}

export function paddedCellScale(sourceHeight: number) {
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) return MAX_SCALE;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, TARGET_CONTENT_HEIGHT / sourceHeight));
}

export function paddedCellDimensions(sourceWidth: number, sourceHeight: number) {
  const scale = paddedCellScale(sourceHeight);
  const contentWidth = Math.max(1, Math.round(Math.max(1, sourceWidth) * scale));
  const contentHeight = Math.max(1, Math.round(Math.max(1, sourceHeight) * scale));
  return {
    scale,
    contentWidth,
    contentHeight,
    paddedWidth: contentWidth + HORIZONTAL_PADDING * 2,
    paddedHeight: contentHeight + VERTICAL_PADDING * 2,
    horizontalPadding: HORIZONTAL_PADDING,
    verticalPadding: VERTICAL_PADDING,
  };
}

export function paddedFocusedCellRectangle(
  metadata: OcrImageMetadata,
  row: SweepRow,
  band: NumericBand,
  kind: CellKind,
  variant: PreparedVariant,
): ImageRectangle {
  const initial = focusedCellRectangle(metadata, row, band, kind, variant);
  // The historical 1.55x/2x vertical expansion can include the adjacent line.
  // Prefer glyphs inside this column; fall back to other numbers on the same
  // baseline when this cell was missed. Horizontal V20 band limits stay intact.
  const normalNumbers = row.words.filter((word) => /\d/.test(word.text)
    && word.box.height >= row.box.height * 0.45
    && word.box.height <= row.box.height * 1.7);
  const inColumn = normalNumbers.filter((word) => centerX(word) >= band.left && centerX(word) <= band.right);
  const referenceWords = inColumn.length ? inColumn : row.summaryLike ? [] : normalNumbers;
  const reference = referenceWords.length ? ocrRowTextBox(referenceWords) : row.box;
  const padding = Math.max(2, reference.height * metadata.height * 0.18);
  const top = Math.max(0, Math.floor(reference.y * metadata.height - padding));
  const bottom = Math.min(metadata.height, Math.ceil((reference.y + reference.height) * metadata.height + padding));
  const rectangle = { ...initial, top, height: Math.max(3, bottom - top) };
  if (kind !== "money") return rectangle;

  // Keep enough source pixels around the monetary glyphs to preserve punctuation, but never let
  // the recovery crop cross into a neighbouring numeric band. The V19 real replay showed that
  // cross-column contamination yields digit reads without a trustworthy single monetary token.
  const lineHeight = Math.max(10, row.box.height * metadata.height);
  const margin = Math.max(6, Math.round(lineHeight * (row.summaryLike ? 0.8 : 0.55)));
  const bandLeft = Math.max(0, Math.floor(band.left * metadata.width));
  const bandRight = Math.min(metadata.width, Math.ceil(band.right * metadata.width));
  const left = row.summaryLike ? bandLeft : Math.max(bandLeft, rectangle.left - margin);
  const right = row.summaryLike ? bandRight : Math.min(bandRight, rectangle.left + rectangle.width + margin);
  return {
    left,
    top: rectangle.top,
    width: Math.max(3, right - left),
    height: rectangle.height,
  };
}

async function prepareCell(
  bytes: Uint8Array,
  rectangle: ImageRectangle,
  variant: PreparedVariant,
): Promise<PreparedCell> {
  const dimensions = paddedCellDimensions(rectangle.width, rectangle.height);
  const pipeline = sharp(Buffer.from(bytes), { failOn: "error" })
    .extract(rectangle)
    .resize(dimensions.contentWidth, dimensions.contentHeight, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });

  const prepared = await pipeline
    .extend({
      top: VERTICAL_PADDING,
      bottom: VERTICAL_PADDING,
      left: HORIZONTAL_PADDING,
      right: HORIZONTAL_PADDING,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png({ compressionLevel: 3 })
    .toBuffer();

  return {
    bytes: prepared,
    sourceRectangle: rectangle,
    contentWidth: dimensions.contentWidth,
    contentHeight: dimensions.contentHeight,
    paddedWidth: dimensions.paddedWidth,
    paddedHeight: dimensions.paddedHeight,
    scale: dimensions.scale,
  };
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

function preparedWords(tsv: unknown, prepared: PreparedCell, metadata: OcrImageMetadata): OcrWord[] {
  if (typeof tsv !== "string") return [];
  const rectangle = prepared.sourceRectangle;
  const scaleX = prepared.contentWidth / rectangle.width;
  const scaleY = prepared.contentHeight / rectangle.height;
  return tsv.split(/\r?\n/).slice(1).flatMap((line) => {
    const values = line.split("\t");
    if (values[0] !== "5" || values.length < 12) return [];
    const text = values.slice(11).join("\t").trim();
    const [x, y, width, height, confidence] = values.slice(6, 11).map(Number);
    if (!text || ![x, y, width, height, confidence].every(Number.isFinite) || width <= 0 || height <= 0) return [];
    const left = Math.max(0, (x - HORIZONTAL_PADDING) / scaleX);
    const top = Math.max(0, (y - VERTICAL_PADDING) / scaleY);
    const right = Math.min(rectangle.width, (x + width - HORIZONTAL_PADDING) / scaleX);
    const bottom = Math.min(rectangle.height, (y + height - VERTICAL_PADDING) / scaleY);
    if (right <= left || bottom <= top) return [];
    return [{ text, confidence: Math.max(0, Math.min(1, confidence / 100)), box: {
      x: (rectangle.left + left) / metadata.width,
      y: (rectangle.top + top) / metadata.height,
      width: (right - left) / metadata.width,
      height: (bottom - top) / metadata.height,
    } }];
  });
}

export function paddedExplicitNumericTokens(text: string, kind: CellKind) {
  const normalized = normalizedRecognitionText(text).replace(/\s*([,.])\s*/g, "$1");
  const matches = kind === "money"
    ? [...normalized.matchAll(/(?:^|[^\d])([0-9]{1,6}[,.][0-9]{2})(?!\d)/g)].map((match) => match[1])
    : [...normalized.matchAll(/(?:^|[^\d,.])([0-9]{1,2})(?![\d,.])/g)].map((match) => match[1]);
  return [...new Set(matches
    .map((token) => cleanToken(token))
    .filter((token) => kind === "money" ? isMoney(token) : isInteger(token)))];
}

function recognitionSignals(
  data: Record<string, unknown>,
  kind: CellKind,
  metadata: OcrImageMetadata,
  rectangle: ImageRectangle,
  variant: PreparedVariant,
  segmentation: SegmentationName,
  prepared: PreparedCell,
): RecognitionSignals {
  const sources = [normalizedRecognitionText(data.text), tsvText(data.tsv)].filter(Boolean);
  const joined = sources.join(" ");
  const tokens = [...new Set(sources
    .flatMap((source) => paddedExplicitNumericTokens(source, kind))
    .map(tokenKey))];
  const hasDigits = /\d/.test(joined);
  const hasExplicitDecimal = kind === "money" && /\d\s*[,.]\s*\d{2}/.test(joined);
  const hasBareDigits = kind === "money" && /(?:^|\D)\d{3,6}(?:\D|$)/.test(joined);
  if (tokens.length !== 1) {
    return { observation: null, hasDigits, hasExplicitDecimal, hasBareDigits };
  }
  const token = tokens[0].replace(".", ",");
  if (kind === "money" ? !isMoney(token) : !isInteger(token)) {
    return { observation: null, hasDigits, hasExplicitDecimal, hasBareDigits };
  }
  const rawConfidence = Number(data.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.max(0.05, Math.min(1, rawConfidence / 100))
    : 0.3;
  const matchingWords = preparedWords(data.tsv, prepared, metadata)
    .filter((word) => tokenKey(word.text) === tokenKey(token));
  return {
    observation: {
      word: { text: token, confidence, box: matchingWords.length === 1
        ? matchingWords[0].box : targetBox(metadata, rectangle) },
      variant,
      segmentation,
    },
    hasDigits,
    hasExplicitDecimal,
    hasBareDigits,
  };
}

export function choosePaddedNumericConsensus(
  observations: PaddedRecognitionObservation[],
  kind: CellKind,
) {
  const valid = observations.filter(({ word }) => word.confidence >= 0.65
    && (kind === "money" ? isMoney(word.text) : isInteger(word.text)));
  if (!valid.length) return null;
  const groups = new Map<string, PaddedRecognitionObservation[]>();
  for (const observation of valid) {
    const key = tokenKey(observation.word.text);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const ranked = [...groups.entries()].map(([key, group]) => {
    const variants = new Set(group.map((item) => item.variant));
    const segmentations = new Set(group.map((item) => item.segmentation));
    const averageConfidence = group.reduce((sum, item) => sum + item.word.confidence, 0) / group.length;
    return { key, group, variants: variants.size, segmentations: segmentations.size, averageConfidence };
  }).sort((a, b) => (
    b.variants - a.variants
    || b.group.length - a.group.length
    || b.segmentations - a.segmentations
    || b.averageConfidence - a.averageConfidence
  ));
  const best = ranked[0];
  const hasIndependentPreprocessingConsensus = best.variants >= 2 && best.group.length >= 2;
  const hasStrongSegmentationConsensus = best.group.length >= 3
    && best.segmentations >= 3
    && best.averageConfidence >= 0.55;
  if (!hasIndependentPreprocessingConsensus && !hasStrongSegmentationConsensus) return null;
  const conflicting = ranked[1];
  if (conflicting && conflicting.variants >= best.variants && conflicting.group.length >= best.group.length) return null;
  return [...best.group].sort((a, b) => b.word.confidence - a.word.confidence)[0]?.word ?? null;
}

const SEGMENTATIONS = [
  { name: "single_word", mode: PSM.SINGLE_WORD },
  { name: "single_line", mode: PSM.SINGLE_LINE },
  { name: "raw_line", mode: PSM.RAW_LINE },
] as const;

async function recognizePrepared(
  worker: Worker,
  prepared: PreparedCell,
  metadata: OcrImageMetadata,
  kind: CellKind,
  variant: PreparedVariant,
  segmentation: (typeof SEGMENTATIONS)[number],
) {
  await worker.setParameters({
    tessedit_pageseg_mode: segmentation.mode,
    tessedit_char_whitelist: "",
    preserve_interword_spaces: "1",
    classify_bln_numeric_mode: "0",
    user_defined_dpi: "300",
  });
  const recognition = await withTimeout(
    worker.recognize(prepared.bytes, { rotateRadians: 0 }, { text: true, tsv: true }),
    CELL_TIMEOUT_MS,
    "ocr_padded_cell_timeout",
  );
  return recognitionSignals(
    (recognition?.data as unknown as Record<string, unknown>) ?? {},
    kind,
    metadata,
    prepared.sourceRectangle,
    variant,
    segmentation.name,
    prepared,
  );
}

const lexicalKey = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

function oneEditApart(a: string, b: string) {
  if (!a || !b || Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  let left = 0;
  let right = 0;
  let edits = 0;
  while (left < a.length && right < b.length) {
    if (a[left] === b[right]) {
      left += 1;
      right += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) left += 1;
    else if (b.length > a.length) right += 1;
    else {
      left += 1;
      right += 1;
    }
  }
  if (left < a.length || right < b.length) edits += 1;
  return edits <= 1;
}

function sameTextRegion(a: OcrWord, b: OcrWord) {
  const overlap = Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x);
  return overlap > Math.min(a.box.width, b.box.width) * 0.35 && verticalOverlap(a.box, b.box) >= 0.25;
}

export function mergeDescriptionObservations(baseWords: OcrWord[], observations: OcrWord[][], descriptionRight: number) {
  let words = baseWords;
  for (let variant = 0; variant < observations.length; variant += 1) {
    for (const candidate of observations[variant]) {
      const candidateKey = lexicalKey(candidate.text);
      const peers = observations[1 - variant].filter((word) => sameTextRegion(word, candidate));
      const agreeingPeers = peers.filter((word) => lexicalKey(word.text) === candidateKey && word.confidence >= 0.45);
      const agreement = agreeingPeers.length > 0;
      const conflict = peers.some((word) => lexicalKey(word.text) !== candidateKey && word.confidence >= 0.65);
      if (!(agreement && candidate.confidence >= 0.5) && !(candidate.confidence >= 0.85 && !conflict)) continue;
      const existing = words.filter((word) => centerX(word) < descriptionRight && sameTextRegion(word, candidate));
      if (existing.some((word) => lexicalKey(word.text) === candidateKey)) continue;

      const strongest = [...existing].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
      const strongestExisting = strongest?.confidence ?? 0;
      const consensusFloor = agreement
        ? Math.min(candidate.confidence, ...agreeingPeers.map((word) => word.confidence))
        : 0;
      const closeIndependentCorrection = Boolean(
        strongest
        && candidateKey.length >= 4
        && lexicalKey(strongest.text).length >= 4
        && oneEditApart(candidateKey, lexicalKey(strongest.text))
        && consensusFloor >= 0.55
        && !conflict
      );

      // Two independently preprocessed reads may correct a one-character OCR substitution even
      // when the first pass was overconfident. Larger lexical changes still require the historical
      // confidence gain so we never turn description recovery into dictionary-style guessing.
      if (existing.length && !closeIndependentCorrection && candidate.confidence < strongestExisting + 0.15) continue;
      words = words.filter((word) => !existing.includes(word));
      words.push(candidate);
    }
  }
  return words;
}

async function recoverDescriptions(
  worker: Worker, pages: Buffer[], metadata: OcrImageMetadata,
  rows: SweepRow[], bands: NumericBand[], baseWords: OcrWord[],
) {
  let words = [...baseWords];
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: "",
    classify_bln_numeric_mode: "0", user_defined_dpi: "300" });
  for (const row of rows) {
    if (row.summaryLike) break;
    const letters = row.words.filter((word) => /\p{L}{2}/u.test(word.text) && centerX(word) < bands[0].left);
    if (!letters.length) continue;
    const box = ocrRowTextBox(letters);
    const padding = Math.max(3, box.height * metadata.height * 0.2);
    const left = Math.max(0, Math.floor(box.x * metadata.width - padding));
    const top = Math.max(0, Math.floor(box.y * metadata.height - padding));
    const right = Math.min(metadata.width, Math.floor(bands[0].left * metadata.width));
    const bottom = Math.min(metadata.height, Math.ceil((box.y + box.height) * metadata.height + padding));
    if (right - left < 16 || bottom - top < 8) continue;
    const observations: OcrWord[][] = [];
    for (const variant of [0, 1] as const) {
      const prepared = await prepareCell(pages[variant], { left, top, width: right - left, height: bottom - top }, variant);
      const result = await withTimeout(worker.recognize(prepared.bytes, { rotateRadians: 0 }, { text: true, tsv: true }),
        CELL_TIMEOUT_MS, "ocr_description_timeout");
      observations.push(preparedWords(result.data.tsv, prepared, metadata)
        .filter((word) => /\p{L}{2}/u.test(word.text)));
    }
    words = mergeDescriptionObservations(words, observations, bands[0].left);
    const numberHeights = row.words.filter((word) => /\d/.test(word.text))
      .map((word) => word.box.height).sort((a, b) => a - b);
    const lineHeight = numberHeights[Math.floor(numberHeights.length / 2)];
    if (lineHeight) {
      words = words.filter((word) => !(row.words.includes(word) && /^[|_—-]+$/.test(word.text)
        && word.box.height > lineHeight * 1.7));
    }
    // Whole-line OCR can be confidently wrong on a single folded/blurred word. Any lexical
    // token not independently confirmed by both normalized variants gets one isolated retry.
    // This remains evidence-based: the replacement still needs cross-variant agreement and
    // mergeDescriptionObservations refuses larger lexical rewrites without a confidence gain.
    const retryCandidates = letters
      .filter((word) => lexicalKey(word.text).length >= 4)
      .filter((word) => !observations.every((variant) => variant.some((candidate) =>
        sameTextRegion(candidate, word)
        && lexicalKey(candidate.text) === lexicalKey(word.text)
        && candidate.confidence >= 0.65)))
      .sort((a, b) => a.confidence - b.confidence || lexicalKey(b.text).length - lexicalKey(a.text).length)
      .slice(0, 2);

    for (const uncertain of retryCandidates) {
      if (!words.includes(uncertain)) continue;
      const inset = Math.max(3, uncertain.box.height * metadata.height * 0.22);
      const x = Math.max(0, Math.floor(uncertain.box.x * metadata.width - inset));
      const y = Math.max(0, Math.floor(uncertain.box.y * metadata.height - inset));
      const endX = Math.min(right, Math.ceil((uncertain.box.x + uncertain.box.width) * metadata.width + inset));
      const endY = Math.min(metadata.height, Math.ceil((uncertain.box.y + uncertain.box.height) * metadata.height + inset));
      if (endX - x < 8 || endY - y < 6) continue;
      const wordObservations: OcrWord[][] = [];
      for (const variant of [0, 1] as const) {
        const prepared = await prepareCell(pages[variant], { left: x, top: y, width: endX - x, height: endY - y }, variant);
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_WORD,
          tessedit_char_whitelist: "",
          classify_bln_numeric_mode: "0",
          user_defined_dpi: "300",
        });
        const result = await withTimeout(worker.recognize(prepared.bytes, { rotateRadians: 0 }, { text: true, tsv: true }),
          CELL_TIMEOUT_MS, "ocr_description_word_timeout");
        wordObservations.push(preparedWords(result.data.tsv, prepared, metadata)
          .filter((word) => /\p{L}{2}/u.test(word.text) && sameTextRegion(word, uncertain)));
      }
      words = mergeDescriptionObservations(words, wordObservations, bands[0].left);
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist: "",
        classify_bln_numeric_mode: "0",
        user_defined_dpi: "300",
      });
    }
  }
  return words;
}

export function summaryRecoveryBand(row: SweepRow, amountBand: NumericBand): NumericBand {
  if (!row.summaryLike) return amountBand;
  const labels = row.words.filter((word) => /\b(total|subtotal|base|iva)\b/i.test(word.text));
  if (!labels.length) return amountBand;
  const labelRight = Math.max(...labels.map((word) => word.box.x + word.box.width));
  // Summary lines have one amount, which can be printed much larger than the
  // product prices. Reserve the pixels after its label, never another column.
  const left = Math.min(amountBand.left, labelRight + row.box.height * 0.8);
  return { ...amountBand, left, center: (left + amountBand.right) / 2 };
}

function targetCells(baseWords: OcrWord[], rows: SweepRow[], bands: NumericBand[]) {
  const targets: CellTarget[] = [];
  const seen = new Set<string>();
  const push = (target: CellTarget) => {
    const key = `${target.row.box.y.toFixed(5)}:${target.band.center.toFixed(5)}:${target.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push(target);
    }
  };

  let passedSummary = false;
  for (const row of rows) {
    if (row.summaryLike) {
      passedSummary = true;
      const amountBand = summaryRecoveryBand(row, bands[bands.length - 1]);
      const existing = existingWordsForCell(baseWords, row, amountBand, "money");
      if (!existing.length && /\b(total|subtotal|base|iva)\b/i.test(row.text)) {
        push({ row, band: amountBand, kind: "money", reason: "summary_missing" });
      }
      continue;
    }
    if (passedSummary) continue;

    const unitBand = bands[0];
    const priceBand = bands[bands.length - 2];
    const amountBand = bands[bands.length - 1];
    const unit = strongest(existingWordsForCell(baseWords, row, unitBand, "integer"));
    const price = strongest(existingWordsForCell(baseWords, row, priceBand, "money"));
    const amount = strongest(existingWordsForCell(baseWords, row, amountBand, "money"));

    if (!unit) push({ row, band: unitBand, kind: "integer", reason: "missing" });
    if (!price) push({ row, band: priceBand, kind: "money", reason: "missing" });
    if (!amount) push({ row, band: amountBand, kind: "money", reason: "missing" });
    if (price && price.confidence < 0.75) push({ row, band: priceBand, kind: "money", reason: "low_confidence" });
    if (amount && amount.confidence < 0.75) push({ row, band: amountBand, kind: "money", reason: "low_confidence" });
    if (unit && price && amount && productRowArithmeticMismatch(unit.text, price.text, amount.text)) {
      push({ row, band: priceBand, kind: "money", reason: "arithmetic_mismatch" });
      push({ row, band: amountBand, kind: "money", reason: "arithmetic_mismatch" });
    }
  }
  return targets.slice(0, MAX_TARGET_CELLS);
}

async function recoverPaddedCells(bytes: Uint8Array, metadata: OcrImageMetadata, baseWords: OcrWord[]) {
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
  const uncertainDescription = rows.some((row) => !row.summaryLike && row.words.some((word) =>
    centerX(word) < bands[0].left && /\p{L}{2}/u.test(word.text) && word.confidence < 0.8));
  if (!targets.length && !uncertainDescription) return baseWords;

  const heights = rows.flatMap((row) => row.words)
    .filter((word) => word.confidence >= 0.5 && word.text.length >= 3)
    .map((word) => word.box.height * metadata.height).sort((a, b) => a - b);
  const glyphHeight = heights[Math.floor(heights.length / 2)] ?? 30;
  // Estimate paper brightness with full-image context, before cutting the cells.
  // Normalizing each tiny crop independently mistakes its edges for characters.
  // Keep full-image normalization sequential: both variants at once multiply peak RAW-buffer memory.
  const preparedPages = [
    await normalizeReceiptIllumination(bytes, glyphHeight, 0),
    await normalizeReceiptIllumination(bytes, glyphHeight, 1),
  ];

  return exclusive(async () => {
    const worker = await withTimeout(getWorker(), CELL_TIMEOUT_MS, "ocr_padded_cell_worker_timeout");
    try {
      let words = baseWords;
    let attemptedCells = 0;
    let preparedVariants = 0;
    let recognitionAttempts = 0;
    let digitReads = 0;
    let explicitDecimalReads = 0;
    let bareDigitReads = 0;
    let observedCells = 0;
    let consensusCells = 0;
    let changedCells = 0;
    let noiseWordsRemoved = 0;
    let summaryRecovered = 0;
    let preparationFailures = 0;
    let recognitionFailures = 0;

    for (const target of targets) {
      attemptedCells += 1;
      const observations: PaddedRecognitionObservation[] = [];
      for (const variant of [0, 1] as const) {
        const rectangle = paddedFocusedCellRectangle(metadata, target.row, target.band, target.kind, variant);
        let prepared: PreparedCell;
        try {
          prepared = await prepareCell(preparedPages[variant], rectangle, variant);
          preparedVariants += 1;
        } catch {
          preparationFailures += 1;
          continue;
        }

        for (const segmentation of SEGMENTATIONS) {
          recognitionAttempts += 1;
          try {
            const signals = await recognizePrepared(worker, prepared, metadata, target.kind, variant, segmentation);
            if (signals.hasDigits) digitReads += 1;
            if (signals.hasExplicitDecimal) explicitDecimalReads += 1;
            if (signals.hasBareDigits) bareDigitReads += 1;
            if (signals.observation) observations.push(signals.observation);
          } catch (error) {
            if (error instanceof PaddedCellTimeoutError) throw error;
            recognitionFailures += 1;
          }
        }
      }

      if (observations.length) observedCells += 1;
      const recovered = choosePaddedNumericConsensus(observations, target.kind);
      if (!recovered) continue;
      consensusCells += 1;
      const existing = existingWordsForCell(words, target.row, target.band, target.kind);
      if (existing.some((word) => tokenKey(word.text) === tokenKey(recovered.text))) continue;
      const beforeMergeCount = words.length;
      words = mergeColumnSweepCell(words, target.row, target.band, recovered);
      noiseWordsRemoved += Math.max(0, beforeMergeCount + 1 - words.length);
      changedCells += 1;
      if (target.reason === "summary_missing") summaryRecovered += 1;
    }

    if (process.env.VERCEL_ENV === "preview") {
      console.info("ocr-padded-cell-consensus-v22", {
        rows: rows.length,
        numericBands: bands.length,
        targetCells: targets.length,
        attemptedCells,
        preparedVariants,
        recognitionAttempts,
        digitReads,
        explicitDecimalReads,
        bareDigitReads,
        observedCells,
        consensusCells,
        changedCells,
        noiseWordsRemoved,
        summaryRecovered,
        preparationFailures,
        recognitionFailures,
      });
    }

      let finalWords = words;
      try {
        finalWords = await recoverDescriptions(worker, preparedPages, metadata, rows, bands, words);
      } catch (error) {
        if (error instanceof PaddedCellTimeoutError) throw error;
      }
      const beforeStructuralCleanup = finalWords.length;
      finalWords = finalizeReceiptTableWords(finalWords, rows, bands);
      const structuralNoiseRemoved = beforeStructuralCleanup - finalWords.length;
      if (process.env.VERCEL_ENV === "preview") {
        console.info("ocr-padded-final-v22", {
          finalWords: finalWords.length,
          structuralNoiseRemoved,
          suspiciousNumericTokens: finalWords.filter((word) => suspiciousNumericToken(word.text)).length,
          isolatedShortNumericRowsAfterTotal: isolatedShortNumericRowsAfterTotal(finalWords),
          veryShortLowConfidenceGlyphs: finalWords.filter((word) => (
            cleanToken(word.text).length <= 1
            && !/\d/.test(word.text)
            && word.confidence < 0.55
          )).length,
        });
      }
      return finalWords;
    } finally {
      // Do not retain a second Tesseract worker alongside the base OCR worker between requests.
      await terminateOwnedWorker(worker);
    }
  });
}

export class ReceiptPaddedCellConsensusImageOcrProvider implements DocumentOcrProvider {
  constructor(
    private readonly base: DocumentOcrProvider = new ReceiptFocusedCellConsensusImageOcrProvider(),
  ) {}

  supports(mimeType: string) {
    return this.base.supports(mimeType);
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }): Promise<DocumentOcrProviderOutput> {
    // Serialize the whole image pipeline per process. This prevents request A's V22 worker and
    // request B's base worker/full-image normalization from overlapping in memory.
    return exclusivePipeline(async () => {
      const base = await this.base.extract(input);
      const metadata = readOcrImageMetadata(input.bytes);
      if (!metadata || base.pages.length !== 1 || !base.pages[0]?.words.length
        || (base.warnings ?? []).includes("orientation_corrected")) return base;
      try {
        const words = await recoverPaddedCells(input.bytes, metadata, base.pages[0].words);
        return {
          ...base,
          extractor: `${base.extractor}${EXTRACTOR_SUFFIX}`.slice(0, 100),
          pages: [{ ...base.pages[0], words }],
        };
      } catch (error) {
        // Queue timeout means a previous request still owns the shared padded worker.
        if (!(error instanceof PaddedCellTimeoutError && error.code === "ocr_padded_cell_queue_timeout")) {
          invalidateWorker();
        }
        return base;
      }
    });
  }
}
