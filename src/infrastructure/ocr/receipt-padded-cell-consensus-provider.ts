import { ocrRowTextBox } from "../../domain/ocr-rows";
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
    await withTimeout(previous, QUEUE_TIMEOUT_MS, "ocr_padded_cell_queue_timeout");
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

function existingWordsForCell(baseWords: OcrWord[], row: SweepRow, band: NumericBand, kind: CellKind) {
  return baseWords.filter((word) => {
    const x = centerX(word);
    if (x < band.left || x > band.right) return false;
    if (verticalOverlap(word.box, row.box) < 0.2) return false;
    return kind === "money" ? isMoney(word.text) : isInteger(word.text);
  });
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

function sameTextRegion(a: OcrWord, b: OcrWord) {
  const overlap = Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x);
  return overlap > Math.min(a.box.width, b.box.width) * 0.35 && verticalOverlap(a.box, b.box) >= 0.25;
}

function mergeDescriptionObservations(baseWords: OcrWord[], observations: OcrWord[][], descriptionRight: number) {
  let words = baseWords;
  for (let variant = 0; variant < observations.length; variant += 1) {
    for (const candidate of observations[variant]) {
      const peers = observations[1 - variant].filter((word) => sameTextRegion(word, candidate));
      const agreement = peers.some((word) => lexicalKey(word.text) === lexicalKey(candidate.text) && word.confidence >= 0.45);
      const conflict = peers.some((word) => lexicalKey(word.text) !== lexicalKey(candidate.text) && word.confidence >= 0.65);
      if (!(agreement && candidate.confidence >= 0.5) && !(candidate.confidence >= 0.85 && !conflict)) continue;
      const existing = words.filter((word) => centerX(word) < descriptionRight && sameTextRegion(word, candidate));
      const strongestExisting = Math.max(0, ...existing.map((word) => word.confidence));
      if (existing.some((word) => lexicalKey(word.text) === lexicalKey(candidate.text))) continue;
      if (existing.length && candidate.confidence < strongestExisting + 0.15) continue;
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
    // A fold elsewhere in the description can lower a whole-line read. Retry
    // unresolved words in their own observed rectangle, using the same pixels.
    for (const uncertain of letters.filter((word) => word.confidence < 0.65).slice(0, 4)) {
      if (!words.includes(uncertain)) continue;
      const agreed = observations.every((variant) => variant.some((word) =>
        sameTextRegion(word, uncertain) && lexicalKey(word.text) === lexicalKey(uncertain.text) && word.confidence >= 0.65));
      if (agreed) continue;
      const inset = Math.max(3, uncertain.box.height * metadata.height * 0.16);
      const x = Math.max(0, Math.floor(uncertain.box.x * metadata.width - inset));
      const y = Math.max(0, Math.floor(uncertain.box.y * metadata.height - inset));
      const endX = Math.min(right, Math.ceil((uncertain.box.x + uncertain.box.width) * metadata.width + inset));
      const endY = Math.min(metadata.height, Math.ceil((uncertain.box.y + uncertain.box.height) * metadata.height + inset));
      const wordObservations: OcrWord[][] = [];
      for (const variant of [0, 1] as const) {
        const prepared = await prepareCell(pages[variant], { left: x, top: y, width: endX - x, height: endY - y }, variant);
        const result = await withTimeout(worker.recognize(prepared.bytes, { rotateRadians: 0 }, { text: true, tsv: true }),
          CELL_TIMEOUT_MS, "ocr_description_word_timeout");
        wordObservations.push(preparedWords(result.data.tsv, prepared, metadata)
          .filter((word) => /\p{L}{2}/u.test(word.text) && sameTextRegion(word, uncertain)));
      }
      words = mergeDescriptionObservations(words, wordObservations, bands[0].left);
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
  const preparedPages = await Promise.all(([0, 1] as const)
    .map((variant) => normalizeReceiptIllumination(bytes, glyphHeight, variant)));

  return exclusive(async () => {
    const worker = await withTimeout(getWorker(), CELL_TIMEOUT_MS, "ocr_padded_cell_worker_timeout");
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
          } catch {
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
      words = mergeColumnSweepCell(words, target.row, target.band, recovered);
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
        summaryRecovered,
        preparationFailures,
        recognitionFailures,
      });
    }

    try {
      return await recoverDescriptions(worker, preparedPages, metadata, rows, bands, words);
    } catch {
      return words;
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
    } catch {
      invalidateWorker();
      return base;
    }
  }
}
