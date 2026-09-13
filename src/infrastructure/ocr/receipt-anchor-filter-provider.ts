import type {
  DocumentOcrProvider,
  DocumentOcrProviderOutput,
} from "../../application/document-ocr-service";
import type { OcrBoundingBox, OcrWord } from "../../domain/document-ocr";

const EXTRACTOR_SUFFIX = "+anchor-filter-v11";
const HEADER_ROLE_MIN = 3;
const HORIZONTAL_MARGIN = 0.022;

type ReceiptRow = {
  words: OcrWord[];
  box: OcrBoundingBox;
  text: string;
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

function hasMetadataAnchor(row: ReceiptRow) {
  return /\b(nif|direccion|telefono|pedido|hora|staff|camarero|mesa)\b/.test(normalizedRowText(row));
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

function structuralBounds(rows: ReceiptRow[], headerIndex: number) {
  const header = rows[headerIndex];
  const productRows = rows.slice(headerIndex + 1).filter(isProductLike).slice(0, 10);
  const summaryRows = rows.slice(headerIndex + 1).filter(hasSummaryAnchor).slice(0, 8);
  if (productRows.length < 2 && summaryRows.length < 2) return null;

  const structural = [header, ...productRows, ...summaryRows];
  const left = Math.max(0, Math.min(...structural.map((row) => row.box.x)) - HORIZONTAL_MARGIN);
  const right = Math.min(1, Math.max(...structural.map((row) => row.box.x + row.box.width)) + HORIZONTAL_MARGIN);
  if (right - left < 0.2 || right - left > 0.92) return null;

  const metadataIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => index < headerIndex && index >= Math.max(0, headerIndex - 12) && hasMetadataAnchor(row))
    .map(({ index }) => index);
  const startIndex = metadataIndexes.length
    ? Math.max(0, Math.min(...metadataIndexes) - 2)
    : Math.max(0, headerIndex - 4);

  const summaryIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => index > headerIndex && hasSummaryAnchor(row))
    .map(({ index }) => index);
  const productIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => index > headerIndex && isProductLike(row))
    .map(({ index }) => index);
  const lastStructure = Math.max(
    headerIndex,
    summaryIndexes.length ? Math.max(...summaryIndexes) : -1,
    productIndexes.length ? Math.max(...productIndexes) : -1,
  );
  const endIndex = Math.min(rows.length - 1, lastStructure + 1);

  const selectedRows = rows.slice(startIndex, endIndex + 1)
    .filter((row) => intersectsHorizontalBand(row, left, right));
  if (selectedRows.length < 6) return null;

  const top = Math.max(0, Math.min(...selectedRows.map((row) => row.box.y)) - 0.012);
  const bottom = Math.min(1, Math.max(...selectedRows.map((row) => row.box.y + row.box.height)) + 0.018);
  if (bottom - top < 0.2 || bottom - top > 0.98) return null;
  return { left, right, top, bottom, startIndex, endIndex };
}

export function filterReceiptAnchorWords(words: OcrWord[]): ReceiptAnchorFilterResult | null {
  if (words.length < 12) return null;
  const rows = clusterRows(words);
  const rankedHeaders = rows
    .map((row, index) => ({ row, index, score: headerRoleScore(row) }))
    .filter(({ row, score }) => {
      const roles = headerRoles(row);
      return score >= HEADER_ROLE_MIN && roles.description && (roles.price || roles.amount);
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const header = rankedHeaders[0];
  if (!header) return null;

  const bounds = structuralBounds(rows, header.index);
  if (!bounds) return null;

  const selected = words.filter((word) => {
    const x = centerX(word);
    const y = centerY(word);
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
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

    if (process.env.VERCEL_ENV === "preview") {
      console.info("ocr-anchor-filter-v11", {
        removedWords: filtered.removedWords,
        keptWords: filtered.words.length,
        header: filtered.headerText.slice(0, 80),
        bounds: filtered.bounds,
      });
    }

    return {
      ...base,
      extractor: `${base.extractor}${EXTRACTOR_SUFFIX}`.slice(0, 100),
      warnings: [...new Set([...(base.warnings ?? []), "background_text_filtered"])],
      pages: [{ ...base.pages[0], words: filtered.words }],
    };
  }
}
