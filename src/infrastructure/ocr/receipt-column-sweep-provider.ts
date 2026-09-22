import { clusterOcrRows, ocrRowTextBox } from "../../domain/ocr-rows";
import path from "node:path";
import { createWorker, PSM } from "tesseract.js";
import type {
  DocumentOcrProvider,
  DocumentOcrProviderOutput,
} from "../../application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../domain/document-ocr";
import { isReceiptMoney, receiptMoneyKey } from "../../domain/receipt-money";
import { readOcrImageMetadata, type OcrImageMetadata } from "./image-metadata";
import { ReceiptCellRecoveryImageOcrProvider } from "./receipt-cell-recovery-provider";
import { deriveNumericColumnBands } from "./receipt-row-refining-provider";

const INTEGER_TOKEN = /^\d{1,2}$/;
const MAX_SWEEP_ROWS = 12;
const SWEEP_TIMEOUT_MS = 10_000;
const QUEUE_TIMEOUT_MS = 8_000;
const EXTRACTOR_SUFFIX = "+column-sweep-v5";

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

export type SweepRow = {
  words: OcrWord[];
  box: OcrBoundingBox;
  text: string;
  summaryLike: boolean;
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
    await withTimeout(previous, QUEUE_TIMEOUT_MS, "ocr_column_sweep_queue_timeout");
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

function isNumericLike(word: OcrWord) {
  const token = cleanToken(word.text);
  return /\d/.test(token) && /^[\d,./:-]+$/.test(token);
}

function alphaChars(text: string) {
  return (text.match(/\p{L}/gu) ?? []).length;
}

function centerX(word: OcrWord) {
  return word.box.x + word.box.width / 2;
}

function centerY(word: OcrWord) {
  return word.box.y + word.box.height / 2;
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

function horizontalBandOverlap(word: OcrWord, band: NumericBand) {
  const left = Math.max(word.box.x, band.left);
  const right = Math.min(word.box.x + word.box.width, band.right);
  const overlap = Math.max(0, right - left);
  return overlap / Math.max(0.000001, Math.min(word.box.width, band.right - band.left));
}

function isRecoverableCellNoise(word: OcrWord) {
  if (isNumericLike(word)) return true;
  const token = cleanToken(word.text);
  return token.length <= 3
    && !/[\p{L}\p{N}]{2,}/u.test(token)
    && /^[\p{P}\p{S}Iil|]+$/u.test(token);
}

function clusterRows(words: OcrWord[]): SweepRow[] {
  return clusterOcrRows(words).map((rowWords) => {
    const ordered = [...rowWords].sort((a, b) => a.box.x - b.box.x);
    const text = ordered.map((word) => word.text).join(" ");
    return {
      words: ordered,
      box: ocrRowTextBox(ordered),
      text,
      summaryLike: /\b(total|subtotal|base|iva)\b/i.test(text),
    };
  });
}

function findTableHeaderIndex(rows: SweepRow[]) {
  return rows.findIndex((row) => (
    /descripci[oó]n/i.test(row.text)
    && /(uds|precio|importe)/i.test(row.text)
  ));
}

export function selectReceiptRowsForColumnSweep(words: OcrWord[]) {
  const rows = clusterRows(words);
  const headerIndex = findTableHeaderIndex(rows);
  if (headerIndex === -1) return [];

  const afterHeader = rows.slice(headerIndex + 1);
  const firstSummary = afterHeader.findIndex((row) => row.summaryLike);
  const productRows = (firstSummary === -1 ? afterHeader : afterHeader.slice(0, firstSummary))
    .filter((row) => alphaChars(row.text) >= 2 || row.words.some((word) => /\d/.test(word.text)))
    .slice(0, 8);

  const summaryRows = firstSummary === -1
    ? []
    : afterHeader
      .slice(firstSummary, firstSummary + 5)
      .filter((row) => row.summaryLike || alphaChars(row.text) >= 2);

  return [...productRows, ...summaryRows].slice(0, MAX_SWEEP_ROWS);
}

function documentBounds(words: OcrWord[]) {
  const substantial = words.filter((word) => alphaChars(word.text) >= 2 || /\d/.test(word.text));
  const source = substantial.length >= 6 ? substantial : words;
  const left = Math.max(0, Math.min(...source.map((word) => word.box.x)) - 0.012);
  const right = Math.min(1, Math.max(...source.map((word) => word.box.x + word.box.width)) + 0.012);
  return { left, right, width: Math.max(0.001, right - left) };
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

function stripRectangle(
  metadata: OcrImageMetadata,
  band: NumericBand,
  rows: SweepRow[],
  horizontalPad: number,
): ImageRectangle {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const medianHeight = [...rows.map((row) => row.box.height)].sort((a, b) => a - b)[Math.floor(rows.length / 2)]
    ?? first.box.height;
  const topNorm = Math.max(0, first.box.y - Math.max(0.012, medianHeight * 1.5));
  const bottomNorm = Math.min(1, last.box.y + last.box.height + Math.max(0.05, medianHeight * 4.5));
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
    SWEEP_TIMEOUT_MS,
    "ocr_column_sweep_timeout",
  );
  return parseRectangleTsv((recognition?.data as unknown as Record<string, unknown>)?.tsv, metadata, rectangle);
}

function candidateWords(words: OcrWord[], kind: "integer" | "money") {
  const normalized = coalesceExplicitDecimalTokens(words);
  return normalized.filter((word) => {
    if (word.confidence < 0.08) return false;
    return kind === "money" ? isMoney(word.text) : isInteger(word.text);
  });
}

function rowWindow(rows: SweepRow[], index: number) {
  const row = rows[index];
  const center = row.box.y + row.box.height / 2;
  const previous = rows[index - 1];
  const next = rows[index + 1];
  const lower = previous
    ? ((previous.box.y + previous.box.height / 2) + center) / 2
    : Math.max(0, center - Math.max(0.025, row.box.height * 2.5));
  const upper = next
    ? (center + (next.box.y + next.box.height / 2)) / 2
    : Math.min(1, center + Math.max(0.035, row.box.height * 3));
  return { lower, upper, center };
}

function candidateForRow(candidates: OcrWord[], rows: SweepRow[], index: number) {
  const window = rowWindow(rows, index);
  const within = candidates
    .filter((word) => centerY(word) >= window.lower && centerY(word) < window.upper)
    .sort((a, b) => Math.abs(centerY(a) - window.center) - Math.abs(centerY(b) - window.center)
      || b.confidence - a.confidence);
  if (!within.length) return null;
  if (within.length > 1) {
    const firstDistance = Math.abs(centerY(within[0]) - window.center);
    const secondDistance = Math.abs(centerY(within[1]) - window.center);
    if (
      tokenKey(within[0].text) !== tokenKey(within[1].text)
      && secondDistance <= firstDistance + Math.max(0.004, rows[index].box.height * 0.45)
    ) {
      return null;
    }
  }
  return within[0];
}

function existingWordsForCell(
  baseWords: OcrWord[],
  row: SweepRow,
  band: NumericBand,
  kind: "integer" | "money",
) {
  return baseWords.filter((word) => {
    const x = centerX(word);
    if (x < band.left || x > band.right) return false;
    if (verticalOverlap(word.box, row.box) < 0.22) return false;
    return kind === "money" ? isMoney(word.text) : isInteger(word.text);
  });
}

export function chooseColumnSweepCandidate(
  existing: OcrWord[],
  observations: OcrWord[],
  kind: "integer" | "money",
) {
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
      maxConfidence: Math.max(...words.map((word) => word.confidence)),
    }))
    .sort((a, b) => b.support - a.support || b.averageConfidence - a.averageConfidence);

  const best = ranked[0];
  const second = ranked[1];
  const current = [...existing].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  const currentKey = current ? tokenKey(current.text) : null;

  if (second && second.support === best.support && second.key !== best.key) {
    return null;
  }
  if (currentKey === best.key) {
    return null;
  }

  if (current) {
    if (best.support < 2 || best.averageConfidence < 0.12) return null;
    return best.words.sort((a, b) => b.confidence - a.confidence)[0];
  }

  const strongSingle = best.support === 1 && best.maxConfidence >= (kind === "money" ? 0.72 : 0.78);
  if (best.support < 2 && !strongSingle) return null;
  return best.words.sort((a, b) => b.confidence - a.confidence)[0];
}

export function mergeColumnSweepCell(
  baseWords: OcrWord[],
  row: SweepRow,
  band: NumericBand,
  recovered: OcrWord | null,
) {
  if (!recovered || (!isMoney(recovered.text) && !isInteger(recovered.text))) return baseWords;
  const kept = baseWords.filter((word) => {
    const x = centerX(word);
    const inBand = (x >= band.left && x <= band.right) || horizontalBandOverlap(word, band) >= 0.35;
    return !(inBand && isRecoverableCellNoise(word) && verticalOverlap(word.box, row.box) >= 0.22);
  });
  return [...kept, recovered];
}

async function sweepColumns(bytes: Uint8Array, metadata: OcrImageMetadata, baseWords: OcrWord[]) {
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

  return exclusive(async () => {
    const worker = await withTimeout(getWorker(), SWEEP_TIMEOUT_MS, "ocr_column_sweep_worker_timeout");
    const horizontalPad = Math.max(0.01, bounds.width * 0.018);
    const passModes = [PSM.SINGLE_COLUMN, PSM.SPARSE_TEXT];
    const passesByBand: OcrWord[][][] = [];
    let minStripWidth = Number.POSITIVE_INFINITY;

    for (let index = 0; index < bands.length; index += 1) {
      const band = bands[index];
      const kind = index === 0 ? "integer" : "money";
      const rectangle = stripRectangle(metadata, band, rows, horizontalPad);
      minStripWidth = Math.min(minStripWidth, rectangle.width);
      const bandPasses: OcrWord[][] = [];

      for (const mode of passModes) {
        await worker.setParameters({
          tessedit_pageseg_mode: mode,
          tessedit_char_whitelist: kind === "money" ? "0123456789,." : "0123456789",
          preserve_interword_spaces: "1",
          classify_bln_numeric_mode: "1",
        });
        const recognized = await recognizeRectangle(worker, bytes, metadata, rectangle).catch(() => []);
        bandPasses.push(candidateWords(recognized, kind));
      }

      passesByBand.push(bandPasses);
    }

    let words = baseWords;
    let cellsObserved = 0;
    let cellsChanged = 0;
    let consensusReplacements = 0;
    let strongSingleInsertions = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const bandIndices = row.summaryLike ? [bands.length - 1] : [0, bands.length - 2, bands.length - 1];

      for (const bandIndex of bandIndices) {
        const band = bands[bandIndex];
        const kind = bandIndex === 0 ? "integer" : "money";
        const observations = passesByBand[bandIndex]
          .map((candidates) => candidateForRow(candidates, rows, rowIndex))
          .filter((word): word is OcrWord => Boolean(word));
        if (!observations.length) continue;

        cellsObserved += 1;
        const existing = existingWordsForCell(words, row, band, kind);

        if (
          row.summaryLike
          && existing.some((word) => word.confidence >= 0.35)
        ) {
          continue;
        }

        const recovered = chooseColumnSweepCandidate(existing, observations, kind);
        if (!recovered) continue;

        const distinctPassSupport = observations.filter((word) => tokenKey(word.text) === tokenKey(recovered.text)).length;
        if (existing.length) consensusReplacements += 1;
        else if (distinctPassSupport === 1) strongSingleInsertions += 1;

        words = mergeColumnSweepCell(words, row, band, recovered);
        cellsChanged += 1;
      }
    }

    if (process.env.VERCEL_ENV === "preview") {
      console.info("ocr-column-sweep-v5", {
        rows: rows.length,
        numericBands: bands.length,
        passModes: passModes.length,
        passCandidates: passesByBand.map((bandPasses) => bandPasses.map((items) => items.length)),
        cellsObserved,
        cellsChanged,
        consensusReplacements,
        strongSingleInsertions,
        minStripWidth: Number.isFinite(minStripWidth) ? minStripWidth : null,
      });
    }

    return words.sort((a, b) => {
      const ay = centerY(a);
      const by = centerY(b);
      return Math.abs(ay - by) > Math.max(a.box.height, b.box.height) * 0.45
        ? ay - by
        : a.box.x - b.box.x;
    });
  });
}

export class ReceiptColumnSweepImageOcrProvider implements DocumentOcrProvider {
  constructor(private readonly base: DocumentOcrProvider = new ReceiptCellRecoveryImageOcrProvider()) {}

  supports(mimeType: string) {
    return this.base.supports(mimeType);
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }): Promise<DocumentOcrProviderOutput> {
    const base = await this.base.extract(input);
    const metadata = readOcrImageMetadata(input.bytes);
    if (!metadata || base.pages.length !== 1 || !base.pages[0]?.words.length) return base;

    try {
      const words = await sweepColumns(input.bytes, metadata, base.pages[0].words);
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
