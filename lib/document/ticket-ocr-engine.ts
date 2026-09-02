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
import { prepareReceiptImage } from "./receipt-image-preprocessor";

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
  model: "PP-OCRv6";
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
  const text = String(item.text ?? "").replace(/\r?\n/g, " ").normalize("NFKC").trim();
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

function replacementWithOriginalCase(original: string, replacement: string) {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original === original.toLowerCase()) return replacement.toLowerCase();
  return replacement;
}

/**
 * Corrige únicamente lecturas inequívocas. La evidencia literal del motor se
 * conserva antes de aplicar estas correcciones, de modo que nunca se oculta lo
 * que PP-OCRv6 leyó realmente.
 */
function correctTrustedReceiptText(value: string) {
  return value
    .replace(/\bPovered(?=\s+by\b)/giu, (match) => replacementWithOriginalCase(match, "Powered"))
    .replace(/\bgamarero\.com\b/giu, (match) => replacementWithOriginalCase(match, "qamarero.com"))
    .replace(/\bTOTALA\b/giu, (match) => replacementWithOriginalCase(match, "TOTAL A"));
}

function metadataTextFromRows(rows: VisualRow[], sourceWidth: number) {
  const lines = rows.map((row) => row.text);
  const first = rows[0];
  const continuation = rows[1];
  if (!first || !continuation || !/^\p{L}$/u.test(continuation.text) || first.text.length < 3) return lines.join("\n");

  const firstCenter = (first.left + first.right) / 2;
  const continuationCenter = (continuation.left + continuation.right) / 2;
  const gap = continuation.top - first.bottom;
  const referenceHeight = Math.max(first.height, continuation.height);
  const visuallyWrapped = Math.abs(firstCenter - continuationCenter) <= Math.max(sourceWidth * 0.08, first.height * 1.2)
    && gap >= -referenceHeight * 0.35
    && gap <= referenceHeight * 0.55
    && continuation.height >= first.height * 0.55;
  if (!visuallyWrapped) return lines.join("\n");
  return [`${first.text}${continuation.text}`, ...lines.slice(2)].join("\n");
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

function normalizedKey(value: string) {
  return value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isReceiptTableHeader(row: VisualRow) {
  const key = normalizedKey(row.text);
  return key.includes("DESCRIP") && key.includes("PRECI") && (key.includes("IMPORTE") || key.includes("TOTAL") || key.includes("UDS"));
}

function isFinancialSummaryRow(row: VisualRow) {
  const key = cleanSpaces(normalizedKey(row.text));
  return /\b(BASE(?:\s+IMPONIBLE)?|SUBTOTAL|TOTAL\s+IVA|IVA|IMPORTE\s+(?:IVA|TOTAL)|EFECTIVO|TARJETA)\b/i.test(key)
    || /\bTOTAL\s*A?\s*PAGAR\b/i.test(key)
    || /^\s*TOTAL\b/i.test(key);
}

function obviousRecognitionNoise(box: Box) {
  const visible = box.text.replace(/\s/g, "");
  if (!visible) return true;
  if (box.score < 20) return true;

  const latinLetters = (visible.match(/\p{Script=Latin}/gu) || []).length;
  const unsupportedCjk = (visible.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
  if (unsupportedCjk > 0 && latinLetters === 0) return true;

  const digits = (visible.match(/\d/g) || []).length;
  const letters = (visible.match(/\p{L}/gu) || []).length;
  const symbols = Math.max(0, visible.length - digits - letters);
  if (visible.length >= 18 && digits / visible.length >= 0.78 && symbols <= 5 && box.score < 65) return true;
  if (box.score < 35 && visible.length >= 5 && (letters + digits) / visible.length < 0.65) return true;
  return false;
}

function filterReceiptBoxes(boxes: Box[], sourceWidth: number, sourceHeight: number) {
  const rows = groupRows(boxes);
  const tableIndex = rows.findIndex(isReceiptTableHeader);
  const protectedFinancialBoxes = new Set(
    rows.filter(isFinancialSummaryRow).flatMap((row) => row.boxes),
  );
  let corridor: { left: number; right: number } | null = null;
  let bottomLimit = sourceHeight;

  if (tableIndex >= 0) {
    const table = rows[tableIndex];
    const width = Math.max(1, table.right - table.left);
    const margin = Math.max(width * 0.16, sourceWidth * 0.025);
    corridor = {
      left: clamp(table.left - margin, 0, sourceWidth),
      right: clamp(table.right + margin, 0, sourceWidth),
    };

    const footerRows = rows.slice(tableIndex + 1).filter((row) => isFinancialSummaryRow(row) || /\b(PENDIENTE|PAGADO|GRACIAS)\b/i.test(normalizedKey(row.text)));
    const lastFooter = footerRows.at(-1);
    if (lastFooter) bottomLimit = Math.min(sourceHeight, lastFooter.bottom + Math.max(lastFooter.height * 4, sourceHeight * 0.045));
  }

  const accepted: Box[] = [];
  const discarded: Box[] = [];
  for (const box of boxes) {
    const protectedFinancial = protectedFinancialBoxes.has(box) && box.score >= 35;
    let reject = protectedFinancial ? false : obviousRecognitionNoise(box);
    if (!reject && corridor) {
      const overlap = Math.max(0, Math.min(box.right, corridor.right) - Math.max(box.left, corridor.left));
      const overlapRatio = overlap / Math.max(1, box.width);
      const semantic = protectedFinancial || /\b(DESCRIP|UDS|PRECIO|IMPORTE|TOTAL|BASE|IVA|FECHA|HORA|TELEFONO|TELÉFONO|PEDIDO|DIRECCION|DIRECCIÓN|PENDIENTE|PAGADO)\b/i.test(normalizedKey(box.text));
      if (overlapRatio < 0.28 && !semantic) reject = true;
      if (box.top > bottomLimit && !semantic) reject = true;
    }
    (reject ? discarded : accepted).push(box);
  }
  return { accepted: accepted.length ? accepted : boxes, discarded };
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
    model: "PP-OCRv6",
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
  const tableHeader = rows.findIndex(isReceiptTableHeader);
  if (tableHeader < 0) return null;

  const header = rows.slice(0, tableHeader).map((row) => cleanSpaces(row.text)).filter(Boolean);
  const items: ReceiptLineItem[] = [];
  const summary: ReceiptSummaryLine[] = [];
  const footer: string[] = [];
  const unparsedBody: ReceiptUnparsedRow[] = [];
  const itemPattern = /^(.+?)\s+(\d{1,3}(?:[.,]\d+)?)\s+(\d{1,7}[.,]\d{2})\s+(\d{1,7}[.,]\d{2})(?:\s*(?:EUR|€))?$/i;
  const summaryLabel = /\b(base(?:\s+imponible)?|subtotal|total\s+iva|iva|total(?:\s+a\s+pagar)?|importe\s+total)\b/i;
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

function chooseReceiptLayout(rows: VisualRow[], text: string) {
  const geometric = strictReceiptLayout(rows);
  const parsed = parseReceiptLayout(text);
  if (!geometric) return parsed.items.length || (parsed.unparsedBody?.length || 0) ? parsed : null;
  const geometricScore = geometric.items.length * 10 - (geometric.unparsedBody?.length || 0) * 2 + geometric.summary.length * 3;
  const textScore = parsed.items.length * 10 - (parsed.unparsedBody?.length || 0) * 2 + parsed.summary.length * 3;
  return geometricScore >= textScore ? geometric : parsed;
}

function averageConfidence(boxes: Box[]) {
  const weight = boxes.reduce((sum, box) => sum + Math.max(1, box.text.length), 0);
  return boxes.reduce((sum, box) => sum + box.score * Math.max(1, box.text.length), 0) / Math.max(1, weight);
}

/**
 * Canonical receipt OCR based on PP-OCRv6 geometry.
 *
 * A single recognition pass is preserved. When a paper contour can be detected
 * safely, PP-OCRv6 receives the rectified grayscale receipt instead of the full
 * camera frame. Literal recognition evidence is retained separately from the
 * trusted text used by the UI and financial parser.
 */
export async function recognizeTicketImage(
  file: File,
  engine: PaddleOcrEngine,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = "receipt",
): Promise<ImageOcrResult> {
  const started = now();
  let input: Blob | HTMLCanvasElement = file;
  let preprocessMs = 0;
  let deskewAngle = 0;
  let perspectiveCorrected = false;
  let paperDetected = false;

  onProgress(0.04, "Detectando el papel y aislando el fondo");
  try {
    const preprocessStarted = now();
    const prepared = await prepareReceiptImage(file);
    if (prepared.paperDetected) {
      input = prepared.grayscale;
      preprocessMs = prepared.durationMs || elapsed(preprocessStarted);
      deskewAngle = prepared.deskewAngle;
      perspectiveCorrected = prepared.perspectiveCorrected;
      paperDetected = true;
    }
  } catch {
    input = file;
    preprocessMs = 0;
  }

  onProgress(0.12, paperDetected ? "Leyendo solo el ticket con PP-OCRv6" : "Leyendo el original con PP-OCRv6");
  const results = await engine.predict(input, {
    textRecScoreThresh: 0.2,
    textDetMaxSideLimit: 4000,
  });
  const result = results?.[0];
  if (!result) throw new Error("PP-OCRv6 no devolvió resultado");

  const literalBoxes = (result.items || []).map(boxFromItem).filter((box): box is Box => Boolean(box));
  if (!literalBoxes.length) throw new Error("PP-OCRv6 no detectó texto en la imagen");

  const sourceWidth = Math.max(1, numberValue(result.image?.width) || Math.ceil(Math.max(...literalBoxes.map((box) => box.right))));
  const sourceHeight = Math.max(1, numberValue(result.image?.height) || Math.ceil(Math.max(...literalBoxes.map((box) => box.bottom))));
  const literalRows = groupRows(literalBoxes);
  const literalText = literalRows.map((row) => row.text).join("\n").trim();
  const allBoxes = literalBoxes.map((box) => {
    const text = correctTrustedReceiptText(box.text);
    return text === box.text ? box : { ...box, text };
  });

  const filtered = filterReceiptBoxes(allBoxes, sourceWidth, sourceHeight);
  const boxes = filtered.accepted;
  onProgress(0.72, filtered.discarded.length ? "Quitando ruido del fondo y ordenando líneas" : "Ordenando líneas por su posición real");

  const rows = groupRows(boxes);
  const visualLayout = makeVisualLayout(boxes, sourceWidth, sourceHeight);
  const trustedText = rows.map((row) => row.text).join("\n").trim();
  const normalizedText = normalizeOcrText(trustedText);
  const layoutText = monospacedLayout(rows, visualLayout.bounds) || preserveOcrLayout(trustedText);
  const receiptLayout = chooseReceiptLayout(rows, trustedText);
  const validation = validateReceiptFinancials(receiptLayout, [trustedText]);
  onProgress(0.86, "Validando fecha, comercio e importes");

  const inferred = inferDocumentMetadata(metadataTextFromRows(rows, sourceWidth), hint);
  const metadata: DocumentMetadata = {
    ...inferred,
    amount: validation.printedTotal ?? inferred.amount,
    lines: receiptLayout ? receiptLayoutToText(receiptLayout).split(/\r?\n/).filter(Boolean) : inferred.lines,
  };
  const confidence = Math.round(averageConfidence(boxes) * 10) / 10;
  const sdkMetrics = result.metrics || {};
  const primaryMs = numberValue(sdkMetrics.totalMs) ?? Math.max(0, elapsed(started) - preprocessMs);
  const metrics = {
    preprocessMs: Math.round(preprocessMs * 10) / 10,
    primaryMs: Math.round(primaryMs * 10) / 10,
    secondaryMs: 0,
    reconstructionMs: Math.max(0, elapsed(started) - preprocessMs - primaryMs),
    totalMs: elapsed(started),
  };
  const pass: OcrPassEvidence & Record<string, unknown> = {
    variant: paperDetected ? "ppocrv6_es_paper_geometry" : "ppocrv6_es_geometry",
    confidence,
    score: confidence,
    rawText: literalText,
    normalizedText,
    durationMs: metrics.primaryMs,
    visualLayout,
    sdkMetrics,
    runtime: result.runtime ?? null,
    paperDetected,
    discardedBoxCount: filtered.discarded.length,
    discardedBoxes: filtered.discarded.slice(0, 30).map((box) => ({ text: box.text, score: Math.round(box.score * 10) / 10 })),
  };

  onProgress(0.97, validation.status === "complete" ? "Ticket validado" : "Conservando líneas para revisión");
  return {
    text: trustedText,
    rawText: literalText,
    normalizedText,
    layoutText,
    tsv: "",
    confidence,
    method: `${RECEIPT_OCR_METHOD_PREFIX}${paperDetected ? "ppocrv6_es_paper_geometry" : "ppocrv6_es_geometry"}`,
    passes: [pass],
    receiptLayout,
    metadata,
    validation,
    metrics,
    deskewAngle,
    perspectiveCorrected,
  };
}
