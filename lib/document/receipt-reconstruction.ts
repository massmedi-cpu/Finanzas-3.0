import {
  parseReceiptLayout,
  receiptLayoutToText,
  type ReceiptLayout,
  type ReceiptLineItem,
  type ReceiptSummaryLine,
  type ReceiptUnparsedRow,
} from "./receipt-layout";

const round2 = (value: number) => Math.round(value * 100) / 100;
const cleanSpaces = (value: string) => value.replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
const fold = (value: string) => value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
const letters = (value: string) => (value.match(/\p{L}/gu) || []).length;

function money(value: string | null | undefined) {
  if (!value) return null;
  const normalized = String(value).replace(/\s/g, "").replace(/O/gi, "0").replace(/,/g, ".").replace(/[^\d.+-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function arithmeticValid(item: ReceiptLineItem) {
  const quantity = money(item.quantity);
  const unit = money(item.unitPrice);
  const total = money(item.total);
  if (quantity === null || unit === null || total === null || quantity <= 0 || unit < 0 || total < 0) return false;
  return Math.abs(quantity * unit - total) <= Math.max(0.03, Math.abs(total) * 0.01);
}

function itemConfidence(item: ReceiptLineItem) {
  const confidence = Number(item.confidence);
  const textScore = Math.min(30, letters(item.description) * 1.5);
  const sourcePenalty = item.inferredQuantity ? 5 : 0;
  return (Number.isFinite(confidence) ? confidence : 35) + textScore - sourcePenalty;
}

function rowCenter(row: { top?: number; bottom?: number }) {
  if (!Number.isFinite(row.top)) return null;
  const top = Number(row.top);
  const bottom = Number.isFinite(row.bottom) ? Number(row.bottom) : top;
  return (top + bottom) / 2;
}

function rowHeight(row: { top?: number; bottom?: number }) {
  if (!Number.isFinite(row.top) || !Number.isFinite(row.bottom)) return 18;
  return Math.max(6, Number(row.bottom) - Number(row.top));
}

type PhysicalRow = {
  item: ReceiptLineItem | null;
  unparsed: ReceiptUnparsedRow | null;
  top?: number;
  bottom?: number;
};

function physicalRows(layout: ReceiptLayout) {
  const rows: PhysicalRow[] = [];
  layout.items.forEach((item) => rows.push({ item: { ...item }, unparsed: null, top: item.top, bottom: item.bottom }));
  (layout.unparsedBody || []).forEach((row) => rows.push({ item: null, unparsed: { ...row }, top: row.top, bottom: row.bottom }));
  rows.sort((a, b) => {
    const at = Number.isFinite(a.top) ? Number(a.top) : Number.MAX_SAFE_INTEGER;
    const bt = Number.isFinite(b.top) ? Number(b.top) : Number.MAX_SAFE_INTEGER;
    return at - bt;
  });
  return rows;
}

function samePhysicalRow(a: PhysicalRow, b: PhysicalRow, medianHeight: number) {
  const ac = rowCenter(a); const bc = rowCenter(b);
  if (ac === null || bc === null) return false;
  const tolerance = Math.max(12, medianHeight * 1.25, rowHeight(a) * 0.9, rowHeight(b) * 0.9);
  return Math.abs(ac - bc) <= tolerance;
}

function textEvidenceQuality(value: string) {
  const line = cleanSpaces(value);
  if (!line) return -20;
  const letterCount = letters(line);
  const digits = (line.match(/\d/g) || []).length;
  const tokens = line.split(/\s+/).filter(Boolean);
  const singleLetters = tokens.filter((token) => /^\p{L}$/u.test(token)).length;
  const symbols = line.replace(/[\p{L}\d\s€%.,:()\/+\-]/gu, "").length;
  const recognizableWords = (line.match(/\p{L}[\p{L}\d]{1,}/gu) || []).length;
  return letterCount * 0.45 + recognizableWords * 2 + Math.min(4, digits * 0.2) - singleLetters * 1.8 - symbols * 1.4;
}

function descriptionEvidence(value: string) {
  const line = cleanSpaces(value);
  if (!line) return null;
  const numeric = line.search(/\b\d/);
  const candidate = cleanSpaces(numeric > 0 ? line.slice(0, numeric) : line)
    .replace(/^[^\p{L}]+/u, "")
    .replace(/[^\p{L}\d)]+$/u, "");
  return /\p{L}[\p{L}\d]{1,}/u.test(candidate) ? candidate : null;
}

function repairItemDescription(item: ReceiptLineItem, evidence: ReceiptUnparsedRow) {
  const candidate = descriptionEvidence(evidence.text);
  if (!candidate) return item;
  if (textEvidenceQuality(candidate) <= textEvidenceQuality(item.description) + 1.5) return item;
  return {
    ...item,
    description: candidate,
    confidence: Number.isFinite(evidence.confidence) ? Number(evidence.confidence) : item.confidence,
  };
}

function mergePhysicalRows(primary: PhysicalRow[], alternate: PhysicalRow[]) {
  const heights = [...primary, ...alternate].map(rowHeight).filter(Number.isFinite).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 18;
  for (const source of alternate) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    const sourceCenter = rowCenter(source);
    for (let index = 0; index < primary.length; index += 1) {
      if (!samePhysicalRow(primary[index], source, medianHeight)) continue;
      const targetCenter = rowCenter(primary[index]);
      const distance = sourceCenter !== null && targetCenter !== null ? Math.abs(sourceCenter - targetCenter) : 0;
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
    if (bestIndex < 0) {
      primary.push({
        item: source.item ? { ...source.item } : null,
        unparsed: source.unparsed ? { ...source.unparsed } : null,
        top: source.top,
        bottom: source.bottom,
      });
      continue;
    }
    const target = primary[bestIndex];
    if (!target.item && source.item && arithmeticValid(source.item)) {
      target.item = target.unparsed ? repairItemDescription({ ...source.item }, target.unparsed) : { ...source.item };
      target.unparsed = null;
    } else if (target.item && source.item && arithmeticValid(source.item)) {
      if (itemConfidence(source.item) > itemConfidence(target.item) + 5) target.item = { ...source.item };
    } else if (target.item && source.unparsed) {
      target.item = repairItemDescription(target.item, source.unparsed);
    } else if (target.unparsed && source.unparsed) {
      if (textEvidenceQuality(source.unparsed.text) > textEvidenceQuality(target.unparsed.text) + 1.5) target.unparsed = { ...source.unparsed };
    } else if (!target.unparsed && source.unparsed) {
      target.unparsed = { ...source.unparsed };
    }
  }
  primary.sort((a, b) => (Number(a.top ?? Number.MAX_SAFE_INTEGER) - Number(b.top ?? Number.MAX_SAFE_INTEGER)));
}

function uniqueLines(lines: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = cleanSpaces(raw);
    const key = fold(line);
    if (!line || !key || seen.has(key)) continue;
    seen.add(key); result.push(line);
  }
  return result;
}

function zoneQuality(lines: string[]) {
  if (!lines.length) return -20;
  const scored = lines.map(textEvidenceQuality);
  const positive = scored.filter((score) => score > 0);
  return positive.reduce((sum, score) => sum + score, 0) / Math.max(1, positive.length) - (scored.length - positive.length) * 2;
}

function mergeZone(layouts: ReceiptLayout[], zone: "header" | "footer") {
  if (!layouts.length) return [];
  const ordered = [...layouts].sort((a, b) => zoneQuality(b[zone]) - zoneQuality(a[zone]));
  const lines: string[] = [];
  for (const layout of ordered) {
    for (const line of layout[zone]) {
      if (textEvidenceQuality(line) >= 1) lines.push(line);
    }
  }
  return uniqueLines(lines).slice(0, zone === "header" ? 18 : 12);
}

function collectNamedAmounts(texts: string[], label: RegExp) {
  const values: number[] = [];
  for (const text of texts) {
    for (const line of String(text || "").split(/\r?\n/)) {
      label.lastIndex = 0;
      if (!label.test(line)) continue;
      const matches = line.match(/\d{1,6}[.,]\d{2}\b/g) || [];
      for (const match of matches) {
        const value = money(match);
        if (value !== null && value >= 0 && value < 100000) values.push(round2(value));
      }
    }
  }
  return values;
}

function collectLayoutAmounts(layouts: ReceiptLayout[], labels: RegExp) {
  const values: number[] = [];
  for (const layout of layouts) {
    for (const line of layout.summary) {
      labels.lastIndex = 0;
      if (!labels.test(line.label)) continue;
      const value = money(line.value);
      if (value !== null && value >= 0 && value < 100000) values.push(round2(value));
    }
  }
  return values;
}

function chooseMode(values: number[]) {
  if (!values.length) return null;
  const candidates = [...new Set(values.map(round2))];
  let best = candidates[0]; let bestSupport = -1;
  for (const candidate of candidates) {
    const support = values.filter((value) => Math.abs(value - candidate) <= 0.03).length;
    if (support > bestSupport) { best = candidate; bestSupport = support; }
  }
  return best;
}

function chooseTotal(texts: string[], layouts: ReceiptLayout[], rows: PhysicalRow[], base: number | null, tax: number | null) {
  const explicit = [
    ...collectNamedAmounts(texts, /\bTOTAL\b(?!\s*IVA)/i),
    ...collectLayoutAmounts(layouts, /^(?:TOTAL|IMPORTE\s+TOTAL)(?:\s+A\s+PAGAR)?$/i),
  ];
  const evidence = new Map<number, number>();
  const add = (value: number | null, weight: number) => {
    if (value === null || !Number.isFinite(value)) return;
    const rounded = round2(value);
    for (const [candidate, score] of evidence) {
      if (Math.abs(candidate - rounded) <= 0.03) { evidence.set(candidate, score + weight); return; }
    }
    evidence.set(rounded, weight);
  };
  explicit.forEach((value) => add(value, 2));
  if (base !== null && tax !== null) add(round2(base + tax), 3);
  const completeItems = rows.filter((row) => row.item && arithmeticValid(row.item));
  const hasUnparsed = rows.some((row) => row.unparsed && !row.item);
  if (completeItems.length && !hasUnparsed) {
    add(round2(completeItems.reduce((sum, row) => sum + (money(row.item!.total) || 0), 0)), 1.5);
  }
  if (!evidence.size) return null;
  return [...evidence].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function bestSummary(texts: string[], layouts: ReceiptLayout[], rows: PhysicalRow[]) {
  const base = chooseMode([
    ...collectNamedAmounts(texts, /\bBASE(?:\s+IMPONIBLE)?\b/i),
    ...collectLayoutAmounts(layouts, /^(?:BASE|BASE\s+IMPONIBLE|SUBTOTAL)$/i),
  ]);
  const tax = chooseMode([
    ...collectNamedAmounts(texts, /\b(?:TOTAL\s*)?IVA\b/i),
    ...collectLayoutAmounts(layouts, /^(?:IVA|TOTAL\s*IVA)$/i),
  ]);
  const total = chooseTotal(texts, layouts, rows, base, tax);
  const summary: ReceiptSummaryLine[] = [];
  if (base !== null) summary.push({ label: "Base", value: base.toFixed(2) });
  if (tax !== null) summary.push({ label: "IVA", value: tax.toFixed(2) });
  if (total !== null) summary.push({ label: "Total", value: total.toFixed(2) });
  return { summary, total };
}

export function cleanReceiptMerchant(value: string | null) {
  if (!value) return null;
  let cleaned = cleanSpaces(value).replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}\d)]+$/u, "");
  const tokens = cleaned.split(/\s+/);
  while (tokens.length > 2 && tokens[0].length === 1) tokens.shift();
  cleaned = tokens.join(" ");
  const parts = cleaned.split(/\s+-\s+/);
  if (parts.length > 1 && /\b(BAR|CAF[EÉ]|RESTAURANTE|HOTEL|TABERNA|MES[ÓO]N|SUPERMERCADO|TIENDA)\b/i.test(parts[0])) cleaned = parts[0];
  return letters(cleaned) >= 3 ? cleaned.trim() : null;
}

function layoutEvidenceScore(layout: ReceiptLayout) {
  const validItems = layout.items.filter(arithmeticValid).length;
  const invalidItems = layout.items.length - validItems;
  const unparsed = layout.unparsedBody?.length || 0;
  return validItems * 14
    - invalidItems * 8
    - unparsed * 6
    + layout.summary.length * 5
    + Math.min(8, Math.max(0, zoneQuality(layout.header)))
    + Math.min(4, Math.max(0, zoneQuality(layout.footer)));
}

export function reconstructReceiptEvidence(
  texts: string[],
  layouts: Array<ReceiptLayout | null | undefined>,
  merchant: string | null = null,
): { layout: ReceiptLayout | null; total: number | null } {
  const candidates = layouts.filter((layout): layout is ReceiptLayout => Boolean(layout));
  if (!candidates.length) {
    for (const text of texts) {
      const parsed = parseReceiptLayout(text);
      if (parsed.items.length || (parsed.unparsedBody?.length || 0)) candidates.push(parsed);
    }
  }
  if (!candidates.length) return { layout: null, total: null };

  const ordered = [...candidates].sort((a, b) => layoutEvidenceScore(b) - layoutEvidenceScore(a));
  const rows = physicalRows(ordered[0]);
  for (const alternate of ordered.slice(1)) mergePhysicalRows(rows, physicalRows(alternate));

  const items = rows.filter((row) => row.item).map((row) => ({ ...row.item! }));
  const unparsedBody = rows.filter((row) => !row.item && row.unparsed).map((row) => ({ ...row.unparsed! }));
  const { summary, total } = bestSummary(texts, ordered, rows);
  const cleanMerchant = cleanReceiptMerchant(merchant);
  const header = mergeZone(ordered, "header");
  if (cleanMerchant && !header.some((line) => fold(line).includes(fold(cleanMerchant)))) header.unshift(cleanMerchant);

  const layout: ReceiptLayout = {
    header,
    items,
    summary,
    footer: mergeZone(ordered, "footer"),
    unparsedBody,
    source: ordered.some((item) => item.source === "geometry_tsv") ? "geometry_tsv" : "text",
  };
  return { layout, total };
}

export function reconstructReceiptText(layout: ReceiptLayout | null | undefined) {
  return layout ? receiptLayoutToText(layout) : "";
}
