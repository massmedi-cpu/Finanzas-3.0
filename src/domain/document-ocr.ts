import { clusterOcrRows } from "./ocr-rows";

export type OcrBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrWord = {
  text: string;
  confidence: number;
  box: OcrBoundingBox;
};

export type OcrAlignment = "left" | "center" | "right";

export type OcrLine = {
  id: string;
  text: string;
  confidence: number;
  box: OcrBoundingBox;
  alignment: OcrAlignment;
  words: OcrWord[];
};

export type OcrPage = {
  pageNumber: number;
  lines: OcrLine[];
  plainText: string;
  layoutText: string;
};

export type OcrSource = "pdf_text" | "image_ocr" | "pdf_ocr" | "hybrid";

export type DocumentOcrResult = {
  contractVersion: 1;
  documentId: string;
  status: "ready" | "needs_review" | "empty";
  source: OcrSource;
  extractor: string;
  extractedAt: string;
  confidence: number | null;
  plainText: string;
  pages: OcrPage[];
  warnings: string[];
  principles: {
    bankSource: "read_only";
    financialWrites: false;
    requiresHumanReview: true;
    preservesGeometry: boolean;
  };
};

const DEFAULT_LAYOUT_COLUMNS = 80;
const LOW_CONFIDENCE = 0.65;
const MAX_WORD_TEXT = 500;
const NUMERIC_STRUCTURE_WARNING = "numeric_structure_unreliable";
const PERIPHERAL_NOISE_WARNING = "peripheral_noise_detected";
const GEOMETRY_WARNING = "geometry_unreliable";

type HorizontalBounds = { left: number; right: number };

function finiteUnit(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`invalid_ocr_${field}`);
  return value;
}

function normalizeText(value: string) {
  if (typeof value !== "string") throw new Error("invalid_ocr_word_text");
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > MAX_WORD_TEXT) throw new Error("invalid_ocr_word_text");
  return normalized;
}

function normalizeWord(word: OcrWord): OcrWord {
  const text = normalizeText(word.text);
  const confidence = finiteUnit(word.confidence, "confidence");
  const x = finiteUnit(word.box.x, "box");
  const y = finiteUnit(word.box.y, "box");
  const width = finiteUnit(word.box.width, "box");
  const height = finiteUnit(word.box.height, "box");
  if (width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) throw new Error("invalid_ocr_box");
  return { text, confidence, box: { x, y, width, height } };
}

function unionBox(words: OcrWord[]): OcrBoundingBox {
  const left = Math.min(...words.map((word) => word.box.x));
  const top = Math.min(...words.map((word) => word.box.y));
  const right = Math.max(...words.map((word) => word.box.x + word.box.width));
  const bottom = Math.max(...words.map((word) => word.box.y + word.box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function lineConfidence(words: OcrWord[]) {
  const weighted = words.reduce(
    (acc, word) => {
      const weight = Math.max(1, word.text.length);
      return { score: acc.score + word.confidence * weight, weight: acc.weight + weight };
    },
    { score: 0, weight: 0 },
  );
  return weighted.weight ? weighted.score / weighted.weight : 0;
}

function verticalOverlap(a: OcrBoundingBox, b: OcrBoundingBox) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, bottom - top);
  return overlap / Math.max(0.000001, Math.min(a.height, b.height));
}

function wordRight(word: OcrWord) {
  return word.box.x + word.box.width;
}

function visibleChars(text: string) {
  return text.replace(/[^\p{L}\p{N}]/gu, "").length;
}

function horizontalBounds(words: OcrWord[]): HorizontalBounds {
  if (!words.length) return { left: 0, right: 1 };
  const substantial = words.filter((word) => visibleChars(word.text) >= 2 || /\d[,.]\d/.test(word.text));
  const source = substantial.length >= 4 ? substantial : words;
  const lefts = source.map((word) => word.box.x).sort((a, b) => a - b);
  const rights = source.map(wordRight).sort((a, b) => a - b);
  const trim = source.length >= 20 ? Math.floor(source.length * 0.05) : 0;
  let left = lefts[Math.min(trim, lefts.length - 1)];
  let right = rights[Math.max(0, rights.length - 1 - trim)];
  if (!Number.isFinite(left) || !Number.isFinite(right) || right - left < 0.18) {
    left = Math.min(...words.map((word) => word.box.x));
    right = Math.max(...words.map(wordRight));
  }
  const width = Math.max(0.001, right - left);
  const margin = Math.min(0.025, width * 0.035);
  return { left: Math.max(0, left - margin), right: Math.min(1, right + margin) };
}

function localBox(box: OcrBoundingBox, bounds: HorizontalBounds) {
  const width = Math.max(0.001, bounds.right - bounds.left);
  const x = (box.x - bounds.left) / width;
  return {
    x: Math.min(1, Math.max(0, x)),
    width: Math.min(1, Math.max(0, box.width / width)),
  };
}

function alignment(box: OcrBoundingBox, bounds: HorizontalBounds): OcrAlignment {
  const local = localBox(box, bounds);
  const center = local.x + local.width / 2;
  if (local.width <= 0.42 && local.x >= 0.56) return "right";
  if (local.width <= 0.62 && center >= 0.39 && center <= 0.61) return "center";
  return "left";
}

function peripheralNoise(word: OcrWord, bounds: HorizontalBounds) {
  if (visibleChars(word.text) > 2) return false;
  const tolerance = Math.max(0.012, (bounds.right - bounds.left) * 0.025);
  return wordRight(word) < bounds.left - tolerance || word.box.x > bounds.right + tolerance;
}

function renderLine(words: OcrWord[], columns: number, bounds: HorizontalBounds) {
  const cells = Array.from({ length: columns }, () => " ");
  let cursor = 0;
  for (const word of words.filter((item) => !peripheralNoise(item, bounds))) {
    const local = localBox(word.box, bounds);
    const desired = Math.round(local.x * Math.max(0, columns - 1));
    const start = Math.max(cursor, Math.min(columns - 1, desired));
    const available = Math.max(0, columns - start);
    if (!available) break;
    const value = word.text.slice(0, available);
    for (let index = 0; index < value.length; index += 1) cells[start + index] = value[index];
    cursor = Math.min(columns, start + value.length + 1);
  }
  return cells.join("").trimEnd();
}

function suspiciousNumericToken(text: string) {
  const token = text.replace(/[€\s]/g, "");
  return /^\d{3,6}$/.test(token) || /^\d{1,6}[,.]\d{3,}$/.test(token);
}

function pageQualityWarnings(page: OcrPage) {
  const warnings: string[] = [];
  const words = page.lines.flatMap((line) => line.words);
  const bounds = horizontalBounds(words);
  const peripheralCount = words.filter((word) => peripheralNoise(word, bounds)).length;
  if (peripheralCount >= 2) warnings.push(PERIPHERAL_NOISE_WARNING);

  const suspiciousFinancialRow = page.lines.some((line) => {
    const numericWords = line.words.filter((word) => /\d/.test(word.text));
    if (numericWords.length < 2) return false;
    return numericWords.some((word) => suspiciousNumericToken(word.text));
  });
  if (suspiciousFinancialRow) warnings.push(NUMERIC_STRUCTURE_WARNING);
  if (warnings.length) warnings.push(GEOMETRY_WARNING);
  return warnings;
}

export function reconstructOcrPage(pageNumber: number, rawWords: OcrWord[], columns = DEFAULT_LAYOUT_COLUMNS): OcrPage {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new Error("invalid_ocr_page_number");
  if (!Number.isSafeInteger(columns) || columns < 40 || columns > 160) throw new Error("invalid_ocr_layout_columns");

  const words = rawWords.map(normalizeWord).sort((a, b) => {
    const centerA = a.box.y + a.box.height / 2;
    const centerB = b.box.y + b.box.height / 2;
    if (Math.abs(centerA - centerB) > Math.max(a.box.height, b.box.height) * 0.45) return centerA - centerB;
    return a.box.x - b.box.x;
  });

  const rows = clusterOcrRows(words);
  const bounds = horizontalBounds(words);
  const lines = rows.map((row, index) => {
    const ordered = [...row].sort((a, b) => a.box.x - b.box.x);
    const box = unionBox(ordered);
    return {
      id: `p${pageNumber}-l${index + 1}`,
      text: ordered.map((word) => word.text).join(" "),
      confidence: lineConfidence(ordered),
      box,
      alignment: alignment(box, bounds),
      words: ordered,
    } satisfies OcrLine;
  });

  return {
    pageNumber,
    lines,
    plainText: lines.map((line) => line.text).join("\n"),
    layoutText: lines.map((line) => renderLine(line.words, columns, bounds)).filter(Boolean).join("\n"),
  };
}

export function buildDocumentOcrResult(input: {
  documentId: string;
  source: OcrSource;
  extractor: string;
  extractedAt: string;
  pages: OcrPage[];
  warnings?: string[];
}): DocumentOcrResult {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.documentId)) {
    throw new Error("invalid_ocr_document_id");
  }
  if (!input.extractor.trim() || input.extractor.length > 100) throw new Error("invalid_ocr_extractor");
  if (Number.isNaN(Date.parse(input.extractedAt))) throw new Error("invalid_ocr_extracted_at");
  if (!input.pages.length) throw new Error("invalid_ocr_pages");

  const pageNumbers = new Set<number>();
  for (const page of input.pages) {
    if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || pageNumbers.has(page.pageNumber)) throw new Error("invalid_ocr_pages");
    pageNumbers.add(page.pageNumber);
  }
  const pages = [...input.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const allLines = pages.flatMap((page) => page.lines);
  const confidence = allLines.length
    ? allLines.reduce((sum, line) => sum + line.confidence, 0) / allLines.length
    : null;
  const warnings = [...new Set((input.warnings ?? []).map((warning) => warning.trim()).filter(Boolean))];
  for (const page of pages) warnings.push(...pageQualityWarnings(page));
  if (!allLines.length) warnings.push("no_text_detected");
  if (confidence !== null && confidence < LOW_CONFIDENCE) warnings.push("low_confidence");
  const uniqueWarnings = [...new Set(warnings)];
  const plainText = pages.map((page) => page.plainText).filter(Boolean).join("\n\n");
  const status = !plainText ? "empty" : uniqueWarnings.length || confidence === null ? "needs_review" : "ready";
  const preservesGeometry = !uniqueWarnings.includes(GEOMETRY_WARNING);

  return {
    contractVersion: 1,
    documentId: input.documentId,
    status,
    source: input.source,
    extractor: input.extractor,
    extractedAt: new Date(input.extractedAt).toISOString(),
    confidence,
    plainText,
    pages,
    warnings: uniqueWarnings,
    principles: {
      bankSource: "read_only",
      financialWrites: false,
      requiresHumanReview: true,
      preservesGeometry,
    },
  };
}