import sharp from "sharp";
import type {
  DocumentOcrProvider,
  DocumentOcrProviderOutput,
} from "../../application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../domain/document-ocr";
import { readOcrImageMetadata, type OcrImageMetadata } from "./image-metadata";

const EXTRACTOR_SUFFIX = "+anchor-recrop-v12";
const HEADER_ROLE_MIN = 3;
const HEADER_WINDOW_MAX_ROWS = 3;
const HORIZONTAL_MARGIN = 0.022;
const RECROP_TARGET_MIN_WIDTH = 1_600;
const RECROP_MAX_SCALE = 2;

type ReceiptRow = {
  words: OcrWord[];
  box: OcrBoundingBox;
  text: string;
};

type ReceiptHeaderAnchor = {
  row: ReceiptRow;
  startIndex: number;
  endIndex: number;
  score: number;
};

type ReceiptStructuralBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  startIndex: number;
  endIndex: number;
};

export type ReceiptAnchorFilterResult = {
  words: OcrWord[];
  removedWords: number;
  headerText: string;
  bounds: OcrBoundingBox;
};

function unionBox(words: OcrWord[]): OcrBoundingBox {
  const left = Math.min(...words.map((word) => word.box.x));
  const top = Math.min(...words.map((word) => word.box.y));
  const right = Math.max(...words.map((word) => word.box.x + word.box.width));
  const bottom = Math.max(...words.map((word) => word.box.y + word.box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function centerY(word: OcrWord) {
  return word.box.y + word.box.height / 2;
}

function centerX(word: OcrWord) {
  return word.box.x + word.box.width / 2;
}

function rowOverlap(word: OcrWord, rowWords: OcrWord[]) {
  const row = unionBox(rowWords);
  const top = Math.max(word.box.y, row.y);
  const bottom = Math.min(word.box.y + word.box.height, row.y + row.height);
  const overlap = Math.max(0, bottom - top) / Math.max(0.000001, Math.min(word.box.height, row.height));
  if (overlap >= 0.32) return true;
  return Math.abs(centerY(word) - (row.y + row.height / 2)) <= Math.max(word.box.height, row.height) * 0.62;
}

function clusterRows(words: OcrWord[]) {
  const sorted = [...words].sort((a, b) => centerY(a) - centerY(b) || a.box.x - b.box.x);
  const rows: OcrWord[][] = [];
  for (const word of sorted) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < rows.length; index += 1) {
      if (!rowOverlap(word, rows[index])) continue;
      const row = unionBox(rows[index]);
      const distance = Math.abs(centerY(word) - (row.y + row.height / 2));
      if (distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    }
    if (bestIndex === -1) rows.push([word]);
    else rows[bestIndex].push(word);
  }
  return rows
    .map((rowWords) => {
      const ordered = [...rowWords].sort((a, b) => a.box.x - b.box.x);
      return {
        words: ordered,
        box: unionBox(ordered),
        text: ordered.map((word) => word.text).join(" "),
      } satisfies ReceiptRow;
    })
    .sort((a, b) => a.box.y - b.box.y);
}

function combineRows(rows: ReceiptRow[]) {
  const words = rows.flatMap((row) => row.words).sort((a, b) => a.box.x - b.box.x);
  return {
    words,
    box: unionBox(words),
    text: words.map((word) => word.text).join(" "),
  } satisfies ReceiptRow;
}

function normalizedToken(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizedRowText(row: ReceiptRow) {
  return row.words.map((word) => normalizedToken(word.text)).filter(Boolean).join(" ");
}

function headerRoles(row: ReceiptRow) {
  const tokens = row.words.map((word) => normalizedToken(word.text)).filter(Boolean);
  const joined = tokens.join(" ");
  return {
    description: tokens.some((token) => token.startsWith("descrip")) || joined.includes("descripcion"),
    units: tokens.some((token) => token === "uds" || token === "ud" || token.startsWith("unid")),
    price: tokens.some((token) => token.startsWith("precio")),
    amount: tokens.some((token) => token.startsWith("importe")),
  };
}

function headerRoleScore(row: ReceiptRow) {
  return Object.values(headerRoles(row)).filter(Boolean).length;
}

function findReceiptHeader(rows: ReceiptRow[]): ReceiptHeaderAnchor | null {
  const candidates: ReceiptHeaderAnchor[] = [];
  for (let startIndex = 0; startIndex < rows.length; startIndex += 1) {
    for (
      let endIndex = startIndex;
      endIndex < rows.length && endIndex < startIndex + HEADER_WINDOW_MAX_ROWS;
      endIndex += 1
    ) {
      if (endIndex > startIndex) {
        const previous = rows[endIndex - 1];
        const current = rows[endIndex];
        const gap = current.box.y - (previous.box.y + previous.box.height);
        const maxGap = Math.max(0.018, Math.max(previous.box.height, current.box.height) * 1.7);
        if (gap > maxGap) break;
      }

      const row = combineRows(rows.slice(startIndex, endIndex + 1));
      const roles = headerRoles(row);
      const score = headerRoleScore(row);
      if (score < HEADER_ROLE_MIN || !roles.description || (!roles.price && !roles.amount)) continue;
      candidates.push({ row, startIndex, endIndex, score });
    }
  }

  return candidates.sort((a, b) => (
    b.score - a.score
    || (a.endIndex - a.startIndex) - (b.endIndex - b.startIndex)
    || a.startIndex - b.startIndex
  ))[0] ?? null;
}

function hasMetadataAnchor(row: ReceiptRow) {
  return /\b(nif|direccion|telefono|pedido|hora|staff|camarero|mesa|razon|social)\b/.test(normalizedRowText(row));
}

function hasSummaryAnchor(row: ReceiptRow) {
  return /\b(base|iva|total|subtotal|pendiente|pago|efectivo|tarjeta|terraza|mesa)\b/.test(normalizedRowText(row));
}

function alphaChars(text: string) {
  return (text.match(/\p{L}/gu) ?? []).length;
}

function numericTokens(row: ReceiptRow) {
  return row.words.filter((word) => /\d/.test(word.text)).length;
}

function isProductLike(row: ReceiptRow) {
  return alphaChars(row.text) >= 3 && numericTokens(row) >= 2;
}

function intersectsHorizontalBand(row: ReceiptRow, left: number, right: number) {
  const rowLeft = row.box.x;
  const rowRight = row.box.x + row.box.width;
  return Math.max(0, Math.min(rowRight, right) - Math.max(rowLeft, left)) > 0;
}

function structuralBounds(rows: ReceiptRow[], header: ReceiptHeaderAnchor): ReceiptStructuralBounds | null {
  const productEntries = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => index > header.endIndex && isProductLike(row))
    .slice(0, 12);
  const summaryEntries = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => index > header.endIndex && hasSummaryAnchor(row))
    .slice(0, 10);
  if (productEntries.length < 2 && summaryEntries.length < 2) return null;

  const structural = [
    header.row,
    ...productEntries.map(({ row }) => row),
    ...summaryEntries.map(({ row }) => row),
  ];
  const left = Math.max(0, Math.min(...structural.map((row) => row.box.x)) - HORIZONTAL_MARGIN);
  const right = Math.min(1, Math.max(...structural.map((row) => row.box.x + row.box.width)) + HORIZONTAL_MARGIN);
  if (right - left < 0.2 || right - left > 0.92) return null;

  const metadataIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => (
      index < header.startIndex
      && index >= Math.max(0, header.startIndex - 14)
      && hasMetadataAnchor(row)
      && intersectsHorizontalBand(row, left, right)
    ))
    .map(({ index }) => index);

  let startIndex = metadataIndexes.length
    ? Math.min(...metadataIndexes)
    : Math.max(0, header.startIndex - 2);
  const precedingIndex = startIndex - 1;
  if (
    precedingIndex >= 0
    && intersectsHorizontalBand(rows[precedingIndex], left, right)
    && alphaChars(rows[precedingIndex].text) >= 3
    && rows[precedingIndex].words.some((word) => word.confidence >= 0.45)
  ) {
    startIndex = precedingIndex;
  }

  const lastStructure = Math.max(
    header.endIndex,
    summaryEntries.length ? Math.max(...summaryEntries.map(({ index }) => index)) : -1,
    productEntries.length ? Math.max(...productEntries.map(({ index }) => index)) : -1,
  );
  const endIndex = Math.min(rows.length - 1, lastStructure + 1);

  const selectedRows = rows.slice(startIndex, endIndex + 1)
    .filter((row) => intersectsHorizontalBand(row, left, right));
  if (selectedRows.length < 5) return null;

  const top = Math.max(0, Math.min(...selectedRows.map((row) => row.box.y)) - 0.012);
  const bottom = Math.min(1, Math.max(...selectedRows.map((row) => row.box.y + row.box.height)) + 0.018);
  if (bottom - top < 0.16 || bottom - top > 0.98) return null;
  return { left, right, top, bottom, startIndex, endIndex };
}

function obviousShortNoise(word: OcrWord) {
  if (/\d/.test(word.text)) return false;
  const token = normalizedToken(word.text);
  return token.length <= 2 && word.confidence < 0.55;
}

export function filterReceiptAnchorWords(words: OcrWord[]): ReceiptAnchorFilterResult | null {
  if (words.length < 12) return null;
  const rows = clusterRows(words);
  const header = findReceiptHeader(rows);
  if (!header) return null;

  const bounds = structuralBounds(rows, header);
  if (!bounds) return null;

  const selected = words.filter((word) => {
    const x = centerX(word);
    const y = centerY(word);
    return x >= bounds.left
      && x <= bounds.right
      && y >= bounds.top
      && y <= bounds.bottom
      && !obviousShortNoise(word);
  });
  if (selected.length < 10 || selected.length >= words.length) return null;

  const selectedText = selected.map((word) => normalizedToken(word.text)).join(" ");
  if (!selectedText.includes("descrip") || !/(precio|importe)/.test(selectedText)) return null;

  const removedWords = words.length - selected.length;
  if (removedWords < 2) return null;
  return {
    words: selected.sort((a, b) => {
      const yDelta = a.box.y - b.box.y;
      return Math.abs(yDelta) > 0.006 ? yDelta : a.box.x - b.box.x;
    }),
    removedWords,
    headerText: header.row.text,
    bounds: {
      x: bounds.left,
      y: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
    },
  };
}

function cropRectangle(bounds: OcrBoundingBox, metadata: OcrImageMetadata) {
  const left = Math.max(0, Math.floor(bounds.x * metadata.width));
  const top = Math.max(0, Math.floor(bounds.y * metadata.height));
  const right = Math.min(metadata.width, Math.ceil((bounds.x + bounds.width) * metadata.width));
  const bottom = Math.min(metadata.height, Math.ceil((bounds.y + bounds.height) * metadata.height));
  if (right - left < 64 || bottom - top < 96) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function mapCropWords(words: OcrWord[], bounds: OcrBoundingBox) {
  return words.map((word) => ({
    ...word,
    box: {
      x: bounds.x + word.box.x * bounds.width,
      y: bounds.y + word.box.y * bounds.height,
      width: word.box.width * bounds.width,
      height: word.box.height * bounds.height,
    },
  }));
}

function rereadLooksSafe(words: OcrWord[]) {
  if (words.length < 12) return false;
  const rows = clusterRows(words);
  const header = findReceiptHeader(rows);
  if (!header) return false;
  const following = rows.slice(header.endIndex + 1);
  const productCount = following.filter(isProductLike).length;
  const summaryCount = following.filter(hasSummaryAnchor).length;
  return productCount >= 2 && (summaryCount >= 1 || productCount >= 4);
}

async function rereadReceiptCrop(
  provider: DocumentOcrProvider,
  input: { bytes: Uint8Array; mimeType: string; originalFileName: string },
  bounds: OcrBoundingBox,
) {
  const metadata = readOcrImageMetadata(input.bytes);
  if (!metadata) return null;
  const rectangle = cropRectangle(bounds, metadata);
  if (!rectangle) return null;

  const scale = Math.min(RECROP_MAX_SCALE, Math.max(1, RECROP_TARGET_MIN_WIDTH / rectangle.width));
  let pipeline = sharp(Buffer.from(input.bytes), { failOn: "error" })
    .extract(rectangle)
    .grayscale()
    .normalize()
    .sharpen({ sigma: 0.65, m1: 0.45, m2: 0.9 });
  if (scale > 1.05) {
    pipeline = pipeline.resize(
      Math.max(64, Math.round(rectangle.width * scale)),
      Math.max(96, Math.round(rectangle.height * scale)),
      { fit: "fill", kernel: sharp.kernel.lanczos3 },
    );
  }

  const croppedBytes = await pipeline.png({ compressionLevel: 3 }).toBuffer();
  const reread = await provider.extract({
    bytes: new Uint8Array(croppedBytes),
    mimeType: "image/png",
    originalFileName: `${input.originalFileName}.receipt-crop.png`,
  });
  if (reread.pages.length !== 1 || !reread.pages[0]?.words.length) return null;

  const mapped = mapCropWords(reread.pages[0].words, bounds);
  const filtered = filterReceiptAnchorWords(mapped);
  const words = filtered?.words ?? mapped;
  if (!rereadLooksSafe(words)) return null;
  return { words, warnings: reread.warnings ?? [], extractor: reread.extractor };
}

export class ReceiptAnchorFilteringImageOcrProvider implements DocumentOcrProvider {
  constructor(private readonly base: DocumentOcrProvider) {}

  supports(mimeType: string) {
    return this.base.supports(mimeType);
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }): Promise<DocumentOcrProviderOutput> {
    const base = await this.base.extract(input);
    if (base.pages.length !== 1 || !base.pages[0]?.words.length) return base;
    const filtered = filterReceiptAnchorWords(base.pages[0].words);
    if (!filtered) return base;

    let words = filtered.words;
    let rereadWords = 0;
    let recropUsed = false;
    let rereadWarnings: string[] = [];

    if (!(base.warnings ?? []).includes("orientation_corrected")) {
      try {
        const reread = await rereadReceiptCrop(this.base, input, filtered.bounds);
        if (reread) {
          words = reread.words;
          rereadWords = reread.words.length;
          rereadWarnings = reread.warnings;
          recropUsed = true;
        }
      } catch {
        // The structurally filtered first pass is still safer than reintroducing the photo background.
      }
    }

    if (process.env.VERCEL_ENV === "preview") {
      console.info("ocr-anchor-recrop-v12", {
        removedWords: filtered.removedWords,
        initialKeptWords: filtered.words.length,
        rereadWords,
        recropUsed,
        header: filtered.headerText.slice(0, 80),
        bounds: filtered.bounds,
      });
    }

    return {
      ...base,
      extractor: `${base.extractor}${EXTRACTOR_SUFFIX}`.slice(0, 100),
      warnings: [...new Set([...(base.warnings ?? []), ...rereadWarnings, "background_text_filtered"])],
      pages: [{ ...base.pages[0], words }],
    };
  }
}
