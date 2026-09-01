export type ReceiptLineItem = {
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
  confidence?: number;
  top?: number;
  bottom?: number;
  sourceLine?: string;
  inferredQuantity?: boolean;
};
export type ReceiptSummaryLine = { label: string; value: string; top?: number };
export type ReceiptUnparsedRow = { text: string; top?: number; bottom?: number; confidence?: number };
export type ReceiptLayout = {
  header: string[];
  items: ReceiptLineItem[];
  summary: ReceiptSummaryLine[];
  footer: string[];
  unparsedBody?: ReceiptUnparsedRow[];
  source?: "text" | "geometry_tsv";
};

type TsvWord = { text: string; conf: number; left: number; top: number; width: number; height: number; key: string };
export type TsvLine = { top: number; bottom: number; words: TsvWord[]; plain: string };

const moneyPattern = "[+-]?\\d{1,7}(?:[.,]\\d{2})";
const qtyPattern = "\\d+(?:[.,]\\d+)?";
const itemRegex = new RegExp(`^(.+?)\\s+(${qtyPattern})\\s+(${moneyPattern})\\s+(${moneyPattern})(?:\\s*(?:EUR|€))?$`, "i");
const priceOnlyItemRegex = /^(\d{1,3}(?:[.,]\d+)?)\s*(\p{L}[\p{L}\d\s.,'’()\-/]*?)\s+([+-]?\d{1,7}(?:[.,]\d{2})?)(?:\s*(?:EUR|€))?$/iu;
const summaryRegex = /^(base(?:\s+imponible)?|subtotal|total\s+iva|iva(?:\s*\([^)]*\)|\s+\d+(?:[.,]\d+)?%)?|total(?:\s+a\s+pagar)?|importe\s+total|efectivo|tarjeta)\s*:?[\s-]*(.+)$/i;
const columnHeader = /^(descripci[oó]n\s+)?u(?:d|ds|ds\.)\s+precio\s+(?:total|importe)$/i;
const priceOnlyColumnHeader = /^(?:QTY|CANT(?:IDAD)?|U(?:D|DS|NDS?)\.?)\s+(?:DESCRIPCI[OÓ]N|DESCRIPTION|DESCR(?:IPTION)?|ART[IÍ]CULO|PRODUCTO)\s+(?:PRICE|PRECIO|IMPORTE)$/i;
const commercialColumnHeader = /\bCANTIDAD\b.*\bC[ÓO]DIGO\b.*\bART[IÍ]CULO\b.*\bPRECIO\b.*\bIVA\b.*\bSUBTOTAL\b/i;
const commercialSummaryMarker = /\bBASE\s+IMPONIBLE\b|\bIMPORTE\s+IVA\b|\bTOTAL\s+(?:ALBAR[AÁ]N|FACTURA|A\s+PAGAR)\b|^\s*TOTAL\b|\b\d{1,3}[.,]\d{2,3}\s*%\s*IVA\s+sobre\b/i;

function cleanLine(value: string) { return value.replace(/[|]+/g, " ").replace(/\s+/g, " ").trim(); }
function normalizeNumeric(value: string) { return value.replace(/O/gi, "0").replace(/,(?=\d{1,2}$)/, "."); }
function parseNumber(value: string) {
  const number = Number(normalizeNumeric(value).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(number) ? number : null;
}
function plausibleItem(quantity: string, unitPrice: string, total: string) {
  const q = parseNumber(quantity); const unit = parseNumber(unitPrice); const sum = parseNumber(total);
  if (q === null || unit === null || sum === null || q <= 0 || unit < 0 || sum < 0) return false;
  if (q > 9999 || unit > 1_000_000 || sum > 1_000_000) return false;
  const expected = q * unit;
  return Math.abs(expected - sum) <= Math.max(0.03, Math.abs(sum) * 0.01);
}
function parseDecimal(value: string) {
  const normalized = cleanLine(value).replace(/\s+/g, "").replace(/O/gi, "0").replace(/,/g, ".");
  const match = normalized.match(/\d{1,7}\.\d{2}/);
  return match?.[0] || null;
}
function parsePriceOnlyMoney(value: string) {
  const decimal = parseDecimal(value);
  if (decimal) return receiptDisplayNumber(decimal);
  const compact = cleanLine(value).replace(/\s+/g, "").replace(/O/gi, "0");
  if (!/^\d{3,7}$/.test(compact)) return null;
  const cents = Number(compact);
  if (!Number.isFinite(cents) || cents < 0 || cents > 100_000_000) return null;
  return (cents / 100).toFixed(2).replace(".", ",");
}
function parseQuantity(value: string) {
  const normalized = cleanLine(value).replace(/O/gi, "0");
  const match = normalized.match(/\b\d{1,3}(?:[.,]\d+)?\b/);
  return match?.[0] || null;
}
function lineText(words: TsvWord[]) { return cleanLine([...words].sort((a, b) => a.left - b.left).map((word) => word.text).join(" ")); }
function center(word: TsvWord) { return word.left + word.width / 2; }
function normalizeKey(value: string) { return value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, ""); }
function hasUsefulText(value: string) { return (value.match(/[\p{L}\d]/gu) || []).length >= 2; }
function recognizableDescription(value: string) { return /\p{L}[\p{L}\d]{1,}/u.test(cleanLine(value)); }

function commercialNumber(value: string) {
  const normalized = cleanLine(value).replace(/\s+/g, "").replace(/O/gi, "0").replace(",", ".").replace(/[^\d.+-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function commercialMoney(value: string) {
  const parsed = commercialNumber(value);
  return parsed === null ? null : parsed.toFixed(2).replace(".", ",");
}

function commercialQuantity(value: string) {
  const parsed = commercialNumber(value);
  if (parsed === null || parsed <= 0) return null;
  if (Number.isInteger(parsed)) return String(parsed);
  return parsed.toFixed(3).replace(/0+$/g, "").replace(/[.,]$/g, "").replace(".", ",");
}

function normalizedCommercialCode(value: string) {
  return value.replace(/^0+(?=\d)/, "") || value;
}

function commercialItemLead(line: string) {
  const compact = line.match(/^(\d{1,3}[.,]\d{3})(\d{1,10})\s+(.+)$/);
  if (compact) return { quantity: compact[1], code: normalizedCommercialCode(compact[2]), description: compact[3].trim() };
  const spaced = line.match(/^(\d{1,3}(?:[.,]\d{1,3})?)\s+(\d{1,10})\s+(.+)$/);
  return spaced ? { quantity: spaced[1], code: normalizedCommercialCode(spaced[2]), description: spaced[3].trim() } : null;
}

function splitMergedCommercialToken(token: string, unitPrice: number, total: number) {
  const match = token.match(/^(\d{1,3})([.,])(\d+)$/);
  if (!match) return null;
  const [, whole, separator, tail] = match;
  const candidates: Array<{ error: number; fractionalDigits: number; quantity: string; code: string }> = [];
  const maxFractionalDigits = Math.min(3, Math.max(0, tail.length - 1));
  for (let fractionalDigits = 0; fractionalDigits <= maxFractionalDigits; fractionalDigits += 1) {
    const code = tail.slice(fractionalDigits);
    if (!code) continue;
    const quantity = `${whole}${fractionalDigits ? `${separator}${tail.slice(0, fractionalDigits)}` : ""}`;
    const numericQuantity = commercialNumber(quantity);
    if (numericQuantity === null || numericQuantity <= 0) continue;
    const error = Math.abs(numericQuantity * unitPrice - total);
    if (error <= Math.max(0.03, Math.abs(total) * 0.01)) {
      candidates.push({ error, fractionalDigits, quantity, code: normalizedCommercialCode(code) });
    }
  }
  candidates.sort((a, b) => a.error - b.error || b.fractionalDigits - a.fractionalDigits || b.code.length - a.code.length);
  return candidates[0] || null;
}

function parseCommercialFullRow(line: string, rowTop: number): ReceiptLineItem | null {
  const numericTokens = [...line.matchAll(/\d{1,7}[.,]\d{2,3}\b/g)];
  if (numericTokens.length < 3) return null;
  const unitToken = numericTokens.at(-3)!;
  const vatToken = numericTokens.at(-2)!;
  const totalToken = numericTokens.at(-1)!;
  const unitPrice = commercialNumber(unitToken[0]);
  const vatRate = commercialNumber(vatToken[0]);
  const total = commercialNumber(totalToken[0]);
  if (unitPrice === null || vatRate === null || total === null || unitPrice < 0 || total < 0 || vatRate < 0 || vatRate > 100) return null;

  const prefix = cleanLine(line.slice(0, unitToken.index || 0));
  let quantityRaw: string | null = null;
  let code: string | null = null;
  let description: string | null = null;

  const spaced = prefix.match(/^(\d{1,3}(?:[.,]\d{1,3})?)\s+(\d{1,10})\s+(.+)$/);
  if (spaced) {
    const quantity = commercialNumber(spaced[1]);
    if (quantity !== null && quantity > 0 && Math.abs(quantity * unitPrice - total) <= Math.max(0.03, Math.abs(total) * 0.01)) {
      quantityRaw = spaced[1];
      code = normalizedCommercialCode(spaced[2]);
      description = spaced[3];
    }
  }

  if (!quantityRaw || !code || !description) {
    const merged = prefix.match(/^(\d{1,3}[.,]\d+)\s+(.+)$/);
    if (!merged) return null;
    const split = splitMergedCommercialToken(merged[1], unitPrice, total);
    if (!split) return null;
    quantityRaw = split.quantity;
    code = split.code;
    description = merged[2];
  }

  const quantity = commercialQuantity(quantityRaw);
  const unit = commercialMoney(unitToken[0]);
  const sum = commercialMoney(totalToken[0]);
  if (!quantity || !unit || !sum || !recognizableDescription(description)) return null;
  return {
    description: cleanLine(`${code} · ${description}`),
    quantity,
    unitPrice: unit,
    total: sum,
    top: rowTop,
    bottom: rowTop,
    sourceLine: line,
  };
}

function commercialSummary(lines: string[], startIndex: number) {
  let base: number | null = null;
  let tax: number | null = null;
  let baseTop = startIndex;
  let taxTop = startIndex;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const baseMatch = line.match(/\bBASE\s+IMPONIBLE\b[^0-9]{0,24}(\d{1,7}[.,]\d{2,3})/i);
    const taxMatch = line.match(/\bIMPORTE\s+IVA\b[^0-9]{0,24}(\d{1,7}[.,]\d{2,3})/i);
    const vatOnBase = line.match(/(\d{1,3}[.,]\d{2,3})\s*%\s*IVA\s+sobre\s+(\d{1,7}[.,]\d{2,3})\s+(\d{1,7}[.,]\d{2,3})/i);
    if (base === null && baseMatch) { base = commercialNumber(baseMatch[1]); baseTop = index; }
    if (tax === null && taxMatch) { tax = commercialNumber(taxMatch[1]); taxTop = index; }
    if (vatOnBase) {
      if (base === null) { base = commercialNumber(vatOnBase[2]); baseTop = index; }
      if (tax === null) { tax = commercialNumber(vatOnBase[3]); taxTop = index; }
    }
  }

  let total: number | null = null;
  let totalTop = startIndex;
  if (base !== null && tax !== null) {
    const expectedGross = Math.round((base + tax) * 100) / 100;
    const candidates: Array<{ value: number; top: number; error: number }> = [];
    for (let index = startIndex; index < Math.min(lines.length, startIndex + 6); index += 1) {
      for (const match of lines[index].matchAll(/\d{1,7}[.,]\d{2,3}\b/g)) {
        const value = commercialNumber(match[0]);
        if (value === null) continue;
        const error = Math.abs(value - expectedGross);
        if (error <= 0.03) candidates.push({ value, top: index, error });
      }
    }
    candidates.sort((a, b) => a.error - b.error || a.top - b.top);
    if (candidates.length) { total = candidates[0].value; totalTop = candidates[0].top; }
  }

  if (total === null) {
    for (let index = startIndex; index < lines.length; index += 1) {
      const explicit = lines[index].match(/\bTOTAL(?:\s+(?:A\s+PAGAR|ALBAR[AÁ]N|FACTURA|TICKET))?\b[^0-9]{0,24}(\d{1,7}[.,]\d{2,3})/i);
      if (!explicit) continue;
      total = commercialNumber(explicit[1]);
      totalTop = index;
      if (total !== null) break;
    }
  }

  const summary: ReceiptSummaryLine[] = [];
  if (base !== null) summary.push({ label: "Base", value: commercialMoney(String(base))!, top: baseTop });
  if (tax !== null) summary.push({ label: "IVA", value: commercialMoney(String(tax))!, top: taxTop });
  if (total !== null) summary.push({ label: "Total", value: commercialMoney(String(total))!, top: totalTop });
  return summary;
}

function parseCommercialLayout(text: string): ReceiptLayout | null {
  const lines = String(text || "").split(/\r?\n/).map(cleanLine).filter(Boolean);
  const tableIndex = lines.findIndex((line) => commercialColumnHeader.test(line));
  if (tableIndex < 0) return null;

  const header = lines.slice(0, tableIndex);
  const items: ReceiptLineItem[] = [];
  const footer: string[] = [];
  const unparsedBody: ReceiptUnparsedRow[] = [];
  let pending: { quantity: string; code: string; description: string; sourceLine: string; top: number } | null = null;
  let summaryStart = -1;

  for (let index = tableIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const rowTop = index - tableIndex - 1;

    if (commercialSummaryMarker.test(line)) {
      if (pending) {
        unparsedBody.push({ text: pending.sourceLine, top: pending.top, bottom: pending.top });
        pending = null;
      }
      summaryStart = index;
      break;
    }

    const fullRow = parseCommercialFullRow(line, rowTop);
    if (fullRow) {
      if (pending) {
        unparsedBody.push({ text: pending.sourceLine, top: pending.top, bottom: pending.top });
        pending = null;
      }
      items.push(fullRow);
      continue;
    }

    if (pending) {
      const numericTokens = [...line.matchAll(/\d{1,7}[.,]\d{2,3}\b/g)];
      if (numericTokens.length >= 3) {
        const unitToken = numericTokens.at(-3)!;
        const vatToken = numericTokens.at(-2)!;
        const totalToken = numericTokens.at(-1)!;
        const quantity = commercialNumber(pending.quantity);
        const unitPrice = commercialNumber(unitToken[0]);
        const vatRate = commercialNumber(vatToken[0]);
        const total = commercialNumber(totalToken[0]);
        const arithmeticValid = quantity !== null && unitPrice !== null && total !== null
          && Math.abs(quantity * unitPrice - total) <= Math.max(0.03, Math.abs(total) * 0.01);
        if (arithmeticValid && vatRate !== null && vatRate >= 0 && vatRate <= 100) {
          const continuation = cleanLine(line.slice(0, unitToken.index || 0));
          const description = cleanLine(`${pending.code} · ${pending.description}${continuation ? ` ${continuation}` : ""}`);
          const quantityText = commercialQuantity(pending.quantity);
          const unitText = commercialMoney(unitToken[0]);
          const totalText = commercialMoney(totalToken[0]);
          if (quantityText && unitText && totalText) {
            items.push({
              description,
              quantity: quantityText,
              unitPrice: unitText,
              total: totalText,
              top: pending.top,
              bottom: rowTop,
              sourceLine: `${pending.sourceLine} ${line}`,
            });
            pending = null;
            continue;
          }
        }
      }
    }

    const lead = commercialItemLead(line);
    if (lead && !/^(?:PORTES|OBSERVACIONES?)\b/i.test(line)) {
      if (pending) unparsedBody.push({ text: pending.sourceLine, top: pending.top, bottom: pending.top });
      pending = { ...lead, sourceLine: line, top: rowTop };
      continue;
    }

    if (items.length > 0 && !pending) footer.push(line);
    else if (hasUsefulText(line)) unparsedBody.push({ text: line, top: rowTop, bottom: rowTop });
  }

  if (pending) unparsedBody.push({ text: pending.sourceLine, top: pending.top, bottom: pending.top });
  if (!items.length) return null;

  const summaryIndex = summaryStart >= 0 ? summaryStart : lines.length;
  const summary = summaryStart >= 0 ? commercialSummary(lines, summaryStart) : [];
  if (summaryStart >= 0) {
    for (const line of lines.slice(summaryStart)) {
      if (/\bBASE\s+IMPONIBLE\b|\bIMPORTE\s+IVA\b|\bTOTAL\s+(?:ALBAR[AÁ]N|FACTURA|A\s+PAGAR)\b|^\s*TOTAL\b|\b\d{1,3}[.,]\d{2,3}\s*%\s*IVA\s+sobre\b/i.test(line)) continue;
      footer.push(line);
    }
  }
  void summaryIndex;
  return { header, items, summary, footer, unparsedBody, source: "text" };
}

export function receiptDisplayNumber(value: string) { return value.replace(".", ","); }

export function parseReceiptLayout(text: string): ReceiptLayout {
  const commercial = parseCommercialLayout(text);
  if (commercial) return commercial;

  const header: string[] = []; const items: ReceiptLineItem[] = []; const summary: ReceiptSummaryLine[] = []; const footer: string[] = []; const unparsedBody: ReceiptUnparsedRow[] = [];
  let seenTable = false; let priceOnlyTable = false; let tableEnded = false; let rowIndex = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = cleanLine(raw); if (!line) continue;
    if (columnHeader.test(line) || (/DESCRIP/i.test(line) && /PRECI/i.test(line) && /(?:TOTAL|IMPORTE)/i.test(line))) { seenTable = true; priceOnlyTable = false; continue; }
    if (priceOnlyColumnHeader.test(line)) { seenTable = true; priceOnlyTable = true; continue; }
    const summaryLine = line.match(summaryRegex);
    if (summaryLine && /\d/.test(summaryLine[2])) {
      summary.push({ label: summaryLine[1].replace(/\s+/g, " ").trim(), value: summaryLine[2].trim(), top: rowIndex++ });
      tableEnded = true;
      continue;
    }
    if (seenTable && /\b(PENDIENTE|PAGADO|GRACIAS|MESA|TERRAZA|POWERED)\b/i.test(line)) {
      tableEnded = true; footer.push(line); rowIndex += 1; continue;
    }
    if (tableEnded) { footer.push(line); rowIndex += 1; continue; }
    if (seenTable && priceOnlyTable) {
      const priceOnlyItem = line.match(priceOnlyItemRegex);
      if (priceOnlyItem && recognizableDescription(priceOnlyItem[2])) {
        const quantity = parseNumber(priceOnlyItem[1]);
        const price = parsePriceOnlyMoney(priceOnlyItem[3]);
        if (quantity === 1 && price) {
          items.push({
            description: cleanLine(priceOnlyItem[2]),
            quantity: "1",
            unitPrice: price,
            total: price,
            top: rowIndex,
            bottom: rowIndex,
            sourceLine: line,
          });
          rowIndex += 1;
          continue;
        }
      }
    }
    const item = line.match(itemRegex);
    if (seenTable && item && recognizableDescription(item[1]) && plausibleItem(item[2], item[3], item[4])) {
      items.push({ description: item[1].trim(), quantity: receiptDisplayNumber(item[2]), unitPrice: receiptDisplayNumber(item[3]), total: receiptDisplayNumber(item[4]), top: rowIndex, bottom: rowIndex, sourceLine: line });
      rowIndex += 1;
      continue;
    }
    if (seenTable) {
      if (hasUsefulText(line)) unparsedBody.push({ text: line, top: rowIndex, bottom: rowIndex });
      rowIndex += 1;
    } else header.push(line);
  }
  return { header, items, summary, footer, unparsedBody, source: "text" };
}

export function parseTsvWords(tsv: string) {
  const words: TsvWord[] = [];
  for (const row of String(tsv || "").replace(/\r/g, "").split("\n").slice(1)) {
    const columns = row.split("\t"); if (columns.length < 12 || Number(columns[0]) !== 5) continue;
    const text = columns.slice(11).join("\t").trim(); const conf = Number(columns[10]); const left = Number(columns[6]); const top = Number(columns[7]); const width = Number(columns[8]); const height = Number(columns[9]);
    if (!text || !Number.isFinite(conf) || conf < 0 || ![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    const useful = (text.match(/[\p{L}\d€%.,:()/-]/gu) || []).length; if (useful / Math.max(1, text.length) < 0.45) continue;
    if (conf < 12 && !/[\p{L}]{3,}|\d+[.,]\d{2}/u.test(text)) continue;
    words.push({ text, conf, left, top, width, height, key: `${columns[2]}:${columns[3]}:${columns[4]}` });
  }
  return words;
}

export function tsvLines(tsv: string): TsvLine[] {
  const groups = new Map<string, TsvWord[]>();
  for (const word of parseTsvWords(tsv)) { const group = groups.get(word.key) || []; group.push(word); groups.set(word.key, group); }
  return [...groups.values()].map((words) => {
    words.sort((a, b) => a.left - b.left);
    return { top: Math.min(...words.map((w) => w.top)), bottom: Math.max(...words.map((w) => w.top + w.height)), words, plain: lineText(words) };
  }).sort((a, b) => a.top - b.top);
}

function headerAnchors(line: TsvLine) {
  const words = line.words; let qty: TsvWord | undefined; let price: TsvWord | undefined; let total: TsvWord | undefined;
  for (const word of words) {
    const key = normalizeKey(word.text);
    if (!qty && /^(?:U[DO0]S?|UND|UNDS|CANT|CANTIDAD)$/.test(key)) qty = word;
    if (!price && /^PRECI/.test(key)) price = word;
    if (!total && /^(?:IMPORTE|TOTAL)$/.test(key)) total = word;
  }
  if (!price) return null;
  const priceX = center(price); let qtyX = qty ? center(qty) : Number.NaN; let totalX = total ? center(total) : Number.NaN;
  if (!Number.isFinite(qtyX) && Number.isFinite(totalX)) qtyX = priceX - Math.max(70, (totalX - priceX) * 1.05);
  if (!Number.isFinite(totalX) && Number.isFinite(qtyX)) totalX = priceX + Math.max(70, (priceX - qtyX) * 1.05);
  if (!(Number.isFinite(qtyX) && Number.isFinite(totalX) && qtyX < priceX && priceX < totalX)) return null;
  return { qtyX, priceX, totalX };
}

function numericFromWords(words: TsvWord[], kind: "qty" | "money") {
  if (!words.length) return null; const ordered = [...words].sort((a, b) => a.left - b.left); const spaced = ordered.map((word) => word.text).join(" "); const compact = ordered.map((word) => word.text).join("");
  return kind === "qty" ? parseQuantity(spaced) || parseQuantity(compact) : parseDecimal(spaced) || parseDecimal(compact);
}

function inferredQuantity(unitPrice: string | null, total: string | null) {
  if (!unitPrice || !total) return null; const unit = parseNumber(unitPrice); const sum = parseNumber(total);
  if (unit === null || sum === null || unit <= 0 || sum < 0) return null; const candidate = Math.round(sum / unit);
  if (candidate < 1 || candidate > 999) return null;
  return Math.abs(candidate * unit - sum) <= Math.max(0.03, Math.abs(sum) * 0.01) ? String(candidate) : null;
}

function meanConfidence(words: TsvWord[]) {
  if (!words.length) return undefined; const weighted = words.reduce((state, word) => ({ sum: state.sum + word.conf * Math.max(1, word.text.length), weight: state.weight + Math.max(1, word.text.length) }), { sum: 0, weight: 0 });
  return Math.round((weighted.sum / Math.max(1, weighted.weight)) * 10) / 10;
}

function descriptionText(words: TsvWord[]) {
  const keepShort = /^(?:DE|DEL|LA|EL|AL|Y|CON|SIN|XL|XXL|ML|CL|KG)$/;
  const filtered = words.filter((word) => { const key = normalizeKey(word.text); return key.length > 3 || word.conf >= 45 || keepShort.test(key); });
  return lineText(filtered.length ? filtered : words);
}

export function parseReceiptTsvLayout(tsv: string): ReceiptLayout | null {
  const lines = tsvLines(tsv); if (!lines.length) return null;
  const headerIndex = lines.findIndex((line) => { const key = normalizeKey(line.plain); return key.includes("DESCRIP") && key.includes("PRECI"); });
  if (headerIndex < 0) return null; const anchors = headerAnchors(lines[headerIndex]); if (!anchors) return null;
  const qtyBoundary = (anchors.qtyX + anchors.priceX) / 2;
  const descriptionBoundary = anchors.qtyX - Math.max(30, (anchors.priceX - anchors.qtyX) * 0.48);
  const totalBoundary = (anchors.priceX + anchors.totalX) / 2;
  const header = lines.slice(0, headerIndex).map((line) => line.plain).filter(Boolean);
  const items: ReceiptLineItem[] = []; const summary: ReceiptSummaryLine[] = []; const footer: string[] = []; const unparsedBody: ReceiptUnparsedRow[] = [];
  let tableEnded = false;
  for (const line of lines.slice(headerIndex + 1)) {
    const plain = cleanLine(line.plain); if (!plain) continue;
    const summaryStart = plain.search(/\b(?:base|subtotal|total|iva|efectivo|tarjeta|importe)\b/i);
    const summaryText = summaryStart >= 0 ? plain.slice(summaryStart) : plain.replace(/^[^\p{L}]+/u, "");
    const summaryMatch = summaryText.match(summaryRegex);
    if (summaryMatch) {
      const value = parseDecimal(summaryMatch[2]) || parseDecimal(plain);
      if (value) summary.push({ label: summaryMatch[1].trim(), value, top: line.top });
      else unparsedBody.push({ text: plain, top: line.top, bottom: line.bottom, confidence: meanConfidence(line.words) });
      tableEnded = true; continue;
    }
    if (/\b(PENDIENTE|PAGADO|GRACIAS|MESA|TERRAZA|POWERED)\b/i.test(plain)) { tableEnded = true; footer.push(plain); continue; }
    if (tableEnded) { footer.push(plain); continue; }

    const descriptionWords = line.words.filter((word) => center(word) < descriptionBoundary);
    const qtyWords = line.words.filter((word) => center(word) >= descriptionBoundary && center(word) < qtyBoundary);
    const priceWords = line.words.filter((word) => center(word) >= qtyBoundary && center(word) < totalBoundary);
    const totalWords = line.words.filter((word) => center(word) >= totalBoundary);
    let description = descriptionText(descriptionWords);
    let quantity = numericFromWords(qtyWords, "qty");
    let unitPrice = numericFromWords(priceWords, "money");
    let total = numericFromWords(totalWords, "money");
    let quantityInferred = false;

    if (!unitPrice || !total) {
      const decimals = plain.match(/\d{1,7}[.,]\d{2}\b/g) || [];
      if (decimals.length >= 2) {
        unitPrice = unitPrice || decimals.at(-2)!;
        total = total || decimals.at(-1)!;
      }
    }
    const arithmeticQuantity = inferredQuantity(unitPrice, total);
    if (!quantity || (quantity && unitPrice && total && !plausibleItem(quantity, unitPrice, total) && arithmeticQuantity)) {
      quantity = arithmeticQuantity;
      quantityInferred = Boolean(quantity);
    }
    if (!description) {
      const firstNumeric = plain.search(/\b\d/);
      if (firstNumeric > 0) description = cleanLine(plain.slice(0, firstNumeric));
    }

    if (description && recognizableDescription(description) && quantity && unitPrice && total && plausibleItem(quantity, unitPrice, total)) {
      items.push({
        description,
        quantity: receiptDisplayNumber(quantity),
        unitPrice: receiptDisplayNumber(unitPrice),
        total: receiptDisplayNumber(total),
        confidence: meanConfidence(descriptionWords),
        top: line.top,
        bottom: line.bottom,
        sourceLine: plain,
        inferredQuantity: quantityInferred,
      });
    } else if (hasUsefulText(plain)) {
      unparsedBody.push({ text: plain, top: line.top, bottom: line.bottom, confidence: meanConfidence(line.words) });
    }
  }
  if (!items.length && !unparsedBody.length) return null;
  return { header, items, summary, footer, unparsedBody, source: "geometry_tsv" };
}

export function receiptLayoutToText(layout: ReceiptLayout) {
  const body: Array<{ top: number; text: string }> = [];
  layout.items.forEach((item, index) => body.push({ top: Number.isFinite(item.top) ? Number(item.top) : index * 10, text: `${item.description} ${item.quantity} ${item.unitPrice} ${item.total}` }));
  (layout.unparsedBody || []).forEach((row, index) => body.push({ top: Number.isFinite(row.top) ? Number(row.top) : layout.items.length * 10 + index * 10 + 1, text: row.text }));
  body.sort((a, b) => a.top - b.top);
  const lines = [
    ...layout.header,
    "DESCRIPCION UDS PRECIO IMPORTE",
    ...body.map((row) => row.text),
    ...layout.summary.map((line) => `${line.label}: ${line.value}`),
    ...layout.footer,
  ];
  return lines.filter(Boolean).join("\n");
}

export function receiptLayoutTotal(layout: ReceiptLayout | null | undefined) {
  if (!layout) return null;
  const total = [...layout.summary].reverse().find((line) => /^(?:total(?:\s+a\s+pagar)?|importe\s+total)$/i.test(line.label.trim()));
  if (!total) return null;
  const value = parseDecimal(total.value); if (!value) return null;
  const number = Number(value.replace(",", ".")); return Number.isFinite(number) ? number : null;
}
