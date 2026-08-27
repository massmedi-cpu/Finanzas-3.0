import {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
  type OcrPassEvidence,
} from "./ticket-ocr";
import {
  parseReceiptLayout,
  receiptLayoutToText,
  type ReceiptLayout,
  type ReceiptLineItem,
  type ReceiptSummaryLine,
  type ReceiptUnparsedRow,
} from "./receipt-layout";
import { validateReceiptFinancials } from "./receipt-financial-validator";
import { RECEIPT_OCR_METHOD_PREFIX } from "./receipt-ocr-revision";

export {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
} from "./ticket-ocr";

export { validateReceiptFinancials } from "./receipt-financial-validator";
export { RECEIPT_OCR_METHOD_PREFIX, RECEIPT_OCR_REVISION, isCurrentReceiptOcrMethod } from "./receipt-ocr-revision";

type Point = { x: number; y: number };
type PaddleItem = { poly?: unknown; text?: unknown; score?: unknown };
type PaddleResult = {
  image?: { width?: unknown; height?: unknown };
  items?: PaddleItem[];
  metrics?: { detMs?: unknown; recMs?: unknown; totalMs?: unknown; detectedBoxes?: unknown; recognizedCount?: unknown };
  runtime?: unknown;
};

type PaddleOcrEngine = {
  predict: (input: Blob | HTMLCanvasElement, params?: Record<string, unknown>) => Promise<PaddleResult[]>;
};

type Box = {
  text: string;
  score: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type VisualRow = {
  boxes: Box[];
  text: string;
  score: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  height: number;
};

type VisualLayout = {
  version: 1;
  engine: "PaddleOCR.js";
  model: "PP-OCRv5";
  language: "es";
  sourceWidth: number;
  sourceHeight: number;
  bounds: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  lines: Array<{
    text: string;
    score: number;
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
};

const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const elapsed = (started: number) => Math.round((now() - started) * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const cleanSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointsFromPoly(poly: unknown): Point[] {
  if (!Array.isArray(poly)) return [];
  const nested = poly
    .filter((value) => Array.isArray(value) && value.length >= 2)
    .map((value) => ({ x: Number((value as unknown[])[0]), y: Number((value as unknown[])[1]) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (nested.length >= 2) return nested;
  const flat = poly.map(Number).filter(Number.isFinite);
  const points: Point[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) points.push({ x: flat[index], y: flat[index + 1] });
  return points;
}

function boxFromItem(item: PaddleItem): Box | null {
  const text = String(item.text ?? "").replace(/\r?\n/g, " ").trim();
  if (!text) return null;
  const points = pointsFromPoly(item.poly);
  if (points.length < 2) return null;
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  const rawScore = numberValue(item.score) ?? 0;
  const score = rawScore <= 1 ? rawScore * 100 : rawScore;
  return {
    text,
    score: clamp(score, 0, 100),
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function verticalOverlap(a: Box, row: VisualRow) {
  const overlap = Math.max(0, Math.min(a.bottom, row.bottom) - Math.max(a.top, row.top));
  return overlap / Math.max(1, Math.min(a.height, row.height));
}

function rowText(boxes: Box[]) {
  const ordered = [...boxes].sort((a, b) => a.left - b.left);
  let output = "";
  let previous: Box | null = null;
  for (const box of ordered) {
    if (!previous) output = box.text;
    else {
      const gap = Math.max(0, box.left - previous.right);
      const reference = Math.max(1, (box.height + previous.height) / 2);
      output += gap >= reference * 3 ? "    " : gap >= reference * 1.2 ? "  " : " ";
      output += box.text;
    }
    previous = box;
  }
  return output.trim();
}

function rowFromBoxes(boxes: Box[]): VisualRow {
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  const weight = boxes.reduce((sum, box) => sum + Math.max(1, box.text.length), 0);
  const score = boxes.reduce((sum, box) => sum + box.score * Math.max(1, box.text.length), 0) / Math.max(1, weight);
  return { boxes: [...boxes].sort((a, b) => a.left - b.left), text: rowText(boxes), score, left, top, right, bottom, height: bottom - top };
}

function groupRows(boxes: Box[]) {
  const rows: VisualRow[] = [];
  for (const box of [...boxes].sort((a, b) => a.top - b.top || a.left - b.left)) {
    let target = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = Math.max(0, rows.length - 5); index < rows.length; index += 1) {
      const row = rows[index];
      const center = (row.top + row.bottom) / 2;
      const distance = Math.abs(box.centerY - center);
      const tolerance = Math.max(4, Math.min(box.height, row.height) * 0.58);
      if (verticalOverlap(box, row) >= 0.55 || distance <= tolerance) {
        if (distance < bestDistance) { target = index; bestDistance = distance; }
      }
    }
    if (target < 0) rows.push(rowFromBoxes([box]));
    else rows[target] = rowFromBoxes([...rows[target].boxes, box]);
  }
  return rows.sort((a, b) => a.top - b.top || a.left - b.left);
}

function visualBounds(boxes: Box[], sourceWidth: number, sourceHeight: number) {
  const rawLeft = Math.min(...boxes.map((box) => box.left));
  const rawTop = Math.min(...boxes.map((box) => box.top));
  const rawRight = Math.max(...boxes.map((box) => box.right));
  const rawBottom = Math.max(...boxes.map((box) => box.bottom));
  const contentWidth = Math.max(1, rawRight - rawLeft);
  const contentHeight = Math.max(1, rawBottom - rawTop);
  const left = clamp(rawLeft - contentWidth * 0.055, 0, sourceWidth);
  const top = clamp(rawTop - contentHeight * 0.045, 0, sourceHeight);
  const right = clamp(rawRight + contentWidth * 0.055, left + 1, sourceWidth);
  const bottom = clamp(rawBottom + contentHeight * 0.055, top + 1, sourceHeight);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function makeVisualLayout(boxes: Box[], sourceWidth: number, sourceHeight: number): VisualLayout {
  const bounds = visualBounds(boxes, sourceWidth, sourceHeight);
  return {
    version: 1,
    engine: "PaddleOCR.js",
    model: "PP-OCRv5",
    language: "es",
    sourceWidth,
    sourceHeight,
    bounds,
    lines: boxes
      .map((box) => ({
        text: box.text,
        score: Math.round(box.score * 10) / 10,
        left: ((box.left - bounds.left) / bounds.width) * 100,
        top: ((box.top - bounds.top) / bounds.height) * 100,
        width: (box.width / bounds.width) * 100,
        height: (box.height / bounds.height) * 100,
      }))
      .sort((a, b) => a.top - b.top || a.left - b.left),
  };
}

function monospacedLayout(rows: VisualRow[], bounds: VisualLayout["bounds"]) {
  const columns = 92;
  const lines: string[] = [];
  for (const row of rows) {
    const chars = Array.from({ length: columns }, () => " ");
    for (const box of row.boxes) {
      const position = clamp(Math.round(((box.left - bounds.left) / bounds.width) * (columns - 1)), 0, columns - 1);
      let cursor = position;
      while (cursor < columns && chars[cursor] !== " ") cursor += 1;
      if (cursor >= columns) cursor = Math.min(columns - 1, position + 1);
      for (const character of box.text) {
        if (cursor >= columns) break;
        chars[cursor] = character;
        cursor += 1;
      }
    }
    lines.push(chars.join("").replace(/\s+$/g, ""));
  }
  return lines.join("\n").trim();
}

function parseMoney(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.+-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function itemArithmeticValid(quantity: string, unitPrice: string, total: string) {
  const q = parseMoney(quantity); const unit = parseMoney(unitPrice); const sum = parseMoney(total);
  if (q === null || unit === null || sum === null || q <= 0 || unit < 0 || sum < 0) return false;
  return Math.abs(q * unit - sum) <= Math.max(0.03, Math.abs(sum) * 0.01);
}

function strictReceiptLayout(rows: VisualRow[]): ReceiptLayout | null {
  const tableHeader = rows.findIndex((row) => {
    const key = row.text.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return key.includes("DESCRIP") && key.includes("PRECI") && (key.includes("IMPORTE") || key.includes("TOTAL") || key.includes("UDS"));
  });
  if (tableHeader < 0) return null;

  const header = rows.slice(0, tableHeader).map((row) => cleanSpaces(row.text)).filter(Boolean);
  const items: ReceiptLineItem[] = [];
  const summary: ReceiptSummaryLine[] = [];
  const footer: string[] = [];
  const unparsedBody: ReceiptUnparsedRow[] = [];
  const itemPattern = /^(.+?)\s+(\d{1,3}(?:[.,]\d+)?)\s+(\d{1,7}[.,]\d{2})\s+(\d{1,7}[.,]\d{2})(?:\s*(?:EUR|€))?$/i;
  const summaryLabel = /\b(base(?:\s+imponible)?|subtotal|iva|total(?:\s+a\s+pagar)?|importe\s+total)\b/i;
  let summaryStarted = false;

  for (const row of rows.slice(tableHeader + 1)) {
    const text = cleanSpaces(row.text);
    if (!text) continue;
    const summaryMatch = text.match(summaryLabel);
    const amounts = text.match(/\d{1,7}[.,]\d{2}\b/g) || [];
    if (summaryMatch && amounts.length) {
      summaryStarted = true;
      summary.push({ label: summaryMatch[1], value: amounts.at(-1)!, top: row.top });
      continue;
    }
    if (summaryStarted || /\b(PAGADO|PENDIENTE|GRACIAS|MESA|TERRAZA|POWERED)\b/i.test(text)) {
      summaryStarted = true;
      footer.push(text);
      continue;
    }
    const item = text.match(itemPattern);
    if (item && /\p{L}[\p{L}\d]{1,}/u.test(item[1]) && itemArithmeticValid(item[2], item[3], item[4])) {
      items.push({
        description: item[1].trim(),
        quantity: item[2].replace(".", ","),
        unitPrice: item[3].replace(".", ","),
        total: item[4].replace(".", ","),
        confidence: Math.round(row.score * 10) / 10,
        top: row.top,
        bottom: row.bottom,
        sourceLine: row.text,
      });
    } else {
      unparsedBody.push({ text: row.text, top: row.top, bottom: row.bottom, confidence: Math.round(row.score * 10) / 10 });
    }
  }

  return { header, items, summary, footer, unparsedBody, source: "geometry_tsv" };
}

function chooseReceiptLayout(rows: VisualRow[], rawText: string) {
  const geometric = strictReceiptLayout(rows);
  const text = parseReceiptLayout(rawText);
  if (!geometric) return text.items.length || (text.unparsedBody?.length || 0) ? text : null;
  const geometricScore = geometric.items.length * 10 - (geometric.unparsedBody?.length || 0) * 2 + geometric.summary.length * 3;
  const textScore = text.items.length * 10 - (text.unparsedBody?.length || 0) * 2 + text.summary.length * 3;
  return geometricScore >= textScore ? geometric : text;
}

function averageConfidence(boxes: Box[]) {
  const weight = boxes.reduce((sum, box) => sum + Math.max(1, box.text.length), 0);
  return boxes.reduce((sum, box) => sum + box.score * Math.max(1, box.text.length), 0) / Math.max(1, weight);
}

/**
 * Canonical receipt OCR based on PP-OCRv5 geometry.
 *
 * There is deliberately one recognition pass over the original image. No
 * thresholded copy, no second OCR engine and no text invented from a merchant
 * dictionary. The PaddleOCR line polygons are preserved and are the source of
 * the reconstructed visual ticket.
 */
export async function recognizeTicketImage(
  file: File,
  engine: PaddleOcrEngine,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = "receipt",
): Promise<ImageOcrResult> {
  const started = now();
  onProgress(0.08, "Leyendo el original con PP-OCRv5");
  const results = await engine.predict(file, {
    textRecScoreThresh: 0,
    textDetMaxSideLimit: 4000,
  });
  const result = results?.[0];
  if (!result) throw new Error("PP-OCRv5 no devolvió resultado");

  const boxes = (result.items || []).map(boxFromItem).filter((box): box is Box => Boolean(box));
  if (!boxes.length) throw new Error("PP-OCRv5 no detectó texto en la imagen");
  onProgress(0.72, "Ordenando líneas por su posición real");

  const rows = groupRows(boxes);
  const sourceWidth = Math.max(1, numberValue(result.image?.width) || Math.ceil(Math.max(...boxes.map((box) => box.right))));
  const sourceHeight = Math.max(1, numberValue(result.image?.height) || Math.ceil(Math.max(...boxes.map((box) => box.bottom))));
  const visualLayout = makeVisualLayout(boxes, sourceWidth, sourceHeight);
  const rawText = rows.map((row) => row.text).join("\n").trim();
  const normalizedText = normalizeOcrText(rawText);
  const layoutText = monospacedLayout(rows, visualLayout.bounds) || preserveOcrLayout(rawText);
  const receiptLayout = chooseReceiptLayout(rows, rawText);
  const validation = validateReceiptFinancials(receiptLayout, [rawText]);
  onProgress(0.86, "Validando fecha, comercio e importes");

  const inferred = inferDocumentMetadata(rawText, hint);
  const metadata: DocumentMetadata = {
    ...inferred,
    amount: validation.printedTotal ?? inferred.amount,
    lines: receiptLayout ? receiptLayoutToText(receiptLayout).split(/\r?\n/).filter(Boolean) : inferred.lines,
  };
  const confidence = Math.round(averageConfidence(boxes) * 10) / 10;
  const sdkMetrics = result.metrics || {};
  const totalMs = numberValue(sdkMetrics.totalMs) ?? elapsed(started);
  const metrics = {
    preprocessMs: 0,
    primaryMs: Math.round(totalMs * 10) / 10,
    secondaryMs: 0,
    reconstructionMs: Math.max(0, elapsed(started) - totalMs),
    totalMs: elapsed(started),
  };
  const pass: OcrPassEvidence & Record<string, unknown> = {
    variant: "ppocrv5_es_geometry",
    confidence,
    score: confidence,
    rawText,
    normalizedText,
    durationMs: metrics.primaryMs,
    visualLayout,
    sdkMetrics,
    runtime: result.runtime ?? null,
  };

  onProgress(0.97, validation.status === "complete" ? "Ticket validado" : "Conservando líneas para revisión");
  return {
    text: rawText,
    rawText,
    normalizedText,
    layoutText,
    tsv: "",
    confidence,
    method: `${RECEIPT_OCR_METHOD_PREFIX}ppocrv5_es_geometry`,
    passes: [pass],
    receiptLayout,
    metadata,
    validation,
    metrics,
    deskewAngle: 0,
    perspectiveCorrected: false,
  };
}
