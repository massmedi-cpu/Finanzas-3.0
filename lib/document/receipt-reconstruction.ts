import {
  receiptDisplayNumber,
  type ReceiptLayout,
  type ReceiptLineItem,
  type ReceiptSummaryLine,
} from "./receipt-layout";

type EvidenceRow = {
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  total: string | null;
  complete: boolean;
  quality: number;
};

type MoneyOption = { value: number; penalty: number };
type NumberToken = { raw: string; start: number; end: number; options: MoneyOption[]; integer: number | null };

const round2 = (value: number) => Math.round(value * 100) / 100;
const cleanSpaces = (value: string) => value.replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
const fold = (value: string) => value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
const letters = (value: string) => (value.match(/\p{L}/gu) || []).length;
const words = (value: string) => (value.match(/[\p{L}]{2,}/gu) || []).length;

function editDistance(a: string, b: string) {
  const left = a.toUpperCase();
  const right = b.toUpperCase();
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[right.length];
}

const commonShortWords = ["CON", "SIN", "GAS", "AGUA", "DE", "DEL", "LA", "EL", "AL"];

function closestCommonWord(token: string) {
  if (token.length < 2 || token.length > 5) return null;
  let best: string | null = null;
  let distance = 99;
  for (const candidate of commonShortWords) {
    const current = editDistance(token, candidate);
    if (current < distance) {
      best = candidate;
      distance = current;
    }
  }
  return distance <= 1 ? best : null;
}

function splitKnownCompound(token: string) {
  if (token.length < 6 || token.length > 12) return null;
  for (let index = 2; index <= token.length - 2; index += 1) {
    const left = token.slice(0, index);
    const right = token.slice(index);
    const a = closestCommonWord(left) || (commonShortWords.includes(left) ? left : null);
    const b = closestCommonWord(right) || (commonShortWords.includes(right) ? right : null);
    if (a && b) return [a, b];
  }
  return null;
}

function normalizeDescription(value: string) {
  const rawTokens = fold(value).split(/\s+/).filter(Boolean);
  const expanded: string[] = [];
  for (const token of rawTokens) {
    const compound = splitKnownCompound(token);
    if (compound) {
      expanded.push(...compound);
      continue;
    }
    expanded.push(closestCommonWord(token) || token);
  }
  while (expanded.length && (expanded[0].length <= 1 || /^\d+$/.test(expanded[0]))) expanded.shift();
  while (expanded.length && (expanded.at(-1)!.length <= 1 || /^\d+$/.test(expanded.at(-1)!))) expanded.pop();
  const joined = expanded.join(" ").replace(/^O(?=[A-Z]{4,}\b)/, "");
  return joined.replace(/\bCANA\b/g, "CAÑA").trim();
}

function descriptionQuality(value: string) {
  const normalized = normalizeDescription(value);
  if (!normalized) return -20;
  const tokenList = normalized.split(/\s+/).filter(Boolean);
  const singletons = tokenList.filter((token) => token.length === 1).length;
  const digits = (normalized.match(/\d/g) || []).length;
  return letters(normalized) * 0.35 + words(normalized) * 2.2 - singletons * 3 - digits * 1.5;
}

function moneyOptions(rawValue: string): MoneyOption[] {
  const normalized = rawValue.toUpperCase().replace(/O/g, "0").replace(/[/:]/g, ".").replace(/,/g, ".").replace(/[^\d.]/g, "");
  const unique = new Map<number, number>();
  const add = (value: number, penalty: number) => {
    if (!Number.isFinite(value) || value < 0 || value > 100000) return;
    const rounded = round2(value);
    const previous = unique.get(rounded);
    if (previous === undefined || penalty < previous) unique.set(rounded, penalty);
  };
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length === 2) {
    const integer = parts[0] || "0";
    const fraction = parts[1];
    if (fraction.length === 2) add(Number(`${integer}.${fraction}`), 0);
    if (fraction.length === 3) {
      add(Number(`${integer}.${fraction.slice(0, 2)}`), 0.8);
      add(Number(`${integer}.${fraction.slice(-2)}`), 1.8);
    }
    if (fraction.length === 1) add(Number(`${integer}.${fraction}0`), 1.2);
  } else if (parts.length === 1) {
    const digitsOnly = parts[0];
    if (/^\d{3,5}$/.test(digitsOnly)) {
      add(Number(`${digitsOnly.slice(0, -2)}.${digitsOnly.slice(-2)}`), 1.3);
      if (digitsOnly.length >= 4) {
        const trimmed = digitsOnly.slice(0, -1);
        if (trimmed.length >= 3) add(Number(`${trimmed.slice(0, -2)}.${trimmed.slice(-2)}`), 1.7);
      }
    }
  }
  return [...unique].map(([value, penalty]) => ({ value, penalty }));
}

function numberTokens(line: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  const regex = /\b[\dO]{1,6}(?:[.,/:][\dO]{1,3})?\b/gi;
  for (const match of line.matchAll(regex)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const digitsOnly = raw.replace(/\D/g, "");
    tokens.push({
      raw,
      start,
      end: start + raw.length,
      options: moneyOptions(raw),
      integer: /^[\dO]{1,2}$/i.test(raw) ? Number(raw.replace(/O/gi, "0")) : null,
    });
  }
  return tokens;
}

function isNonItemLine(line: string) {
  return /\b(?:RAZ[ÓO]N\s+SOCIAL|DIRECCI[ÓO]N|TEL[EÉ]FONO|NIF|CIF|HORA|FECHA|PEDIDO\s+POR|TOTAL\s*IVA|IVA|BASE|SUBTOTAL|TOTAL|PENDIENTE|PAGADO|MESA|TERRAZA|POWERED|GRACIAS)\b/i.test(line);
}

function parseEvidenceRow(rawLine: string): EvidenceRow | null {
  const line = cleanSpaces(rawLine);
  if (!line || isNonItemLine(line) || /(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}/.test(line)) return null;
  const tokens = numberTokens(line);
  if (!tokens.length || !/\p{L}/u.test(line)) return null;

  let best: { score: number; q: number; unit: number; total: number; start: number } | null = null;
  const qCandidates = [{ value: 1, index: -1, penalty: 0.9 }];
  tokens.forEach((token, index) => {
    if (token.integer !== null && token.integer >= 1 && token.integer <= 99) qCandidates.push({ value: token.integer, index, penalty: 0 });
  });

  for (const q of qCandidates) {
    for (let unitIndex = 0; unitIndex < tokens.length; unitIndex += 1) {
      if (unitIndex === q.index) continue;
      for (let totalIndex = unitIndex + 1; totalIndex < tokens.length; totalIndex += 1) {
        if (totalIndex === q.index) continue;
        for (const unit of tokens[unitIndex].options) {
          for (const total of tokens[totalIndex].options) {
            if (unit.value <= 0 || total.value < 0) continue;
            const expected = q.value * unit.value;
            const error = Math.abs(expected - total.value);
            const tolerance = Math.max(0.08, Math.abs(total.value) * 0.045);
            if (error > tolerance) continue;
            const orderPenalty = q.index >= 0 && q.index > unitIndex ? 3 : 0;
            const score = error * 20 + unit.penalty + total.penalty + q.penalty + orderPenalty;
            const start = q.index >= 0 ? tokens[q.index].start : tokens[unitIndex].start;
            if (!best || score < best.score) best = { score, q: q.value, unit: unit.value, total: total.value, start };
          }
        }
      }
    }
  }

  if (!best) return null;
  const description = normalizeDescription(line.slice(0, best.start));
  if (letters(description) < 2) return null;
  return {
    description,
    quantity: String(best.q),
    unitPrice: best.unit.toFixed(2),
    total: best.total.toFixed(2),
    complete: true,
    quality: descriptionQuality(description) - best.score,
  };
}

function partialDescriptionRow(rawLine: string): EvidenceRow | null {
  const line = cleanSpaces(rawLine);
  if (!line || isNonItemLine(line) || !/\p{L}/u.test(line)) return null;
  const firstNumber = numberTokens(line)[0];
  const description = normalizeDescription(firstNumber ? line.slice(0, firstNumber.start) : line);
  if (words(description) < 1 || descriptionQuality(description) < 2.5) return null;
  return { description, quantity: null, unitPrice: null, total: null, complete: false, quality: descriptionQuality(description) };
}

function rowsFromText(text: string) {
  const rows: EvidenceRow[] = [];
  let tableStarted = false;
  for (const rawLine of String(text || "").replace(/\r/g, "").split("\n")) {
    const line = cleanSpaces(rawLine);
    if (!line) continue;
    if (/DESCRIP/i.test(line) && /PRECI/i.test(line)) {
      tableStarted = true;
      continue;
    }
    if (/\b(?:BASE|TOTAL\s*IVA|IVA|TOTAL|PENDIENTE|PAGADO)\b/i.test(line) && rows.length) {
      tableStarted = false;
      continue;
    }
    const complete = parseEvidenceRow(line);
    if (complete) {
      tableStarted = true;
      rows.push(complete);
      continue;
    }
    if (tableStarted) {
      const partial = partialDescriptionRow(line);
      if (partial) rows.push(partial);
    }
  }
  return rows;
}

function rowFromLayout(item: ReceiptLineItem): EvidenceRow {
  return {
    description: normalizeDescription(item.description),
    quantity: item.quantity.replace(",", "."),
    unitPrice: item.unitPrice.replace(",", "."),
    total: item.total.replace(",", "."),
    complete: true,
    quality: descriptionQuality(item.description) + Math.max(0, Number(item.confidence || 0)) * 0.08,
  };
}

function lexicalOverlap(a: string, b: string) {
  const left = new Set(fold(a).split(/\s+/).filter((token) => token.length >= 2));
  const right = new Set(fold(b).split(/\s+/).filter((token) => token.length >= 2));
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const token of left) if (right.has(token)) hits += 1;
  return hits / Math.max(left.size, right.size);
}

function numericAgreement(a: EvidenceRow, b: EvidenceRow) {
  if (!(a.complete && b.complete)) return 0;
  const same = a.quantity === b.quantity && a.unitPrice === b.unitPrice && a.total === b.total;
  return same ? 1 : 0;
}

function mergeAlignedDescriptions(primary: EvidenceRow[], alternate: EvidenceRow[]) {
  const n = primary.length;
  const m = alternate.length;
  const gap = -1.35;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(-Infinity));
  const move = Array.from({ length: n + 1 }, () => Array<"d" | "u" | "l" | null>(m + 1).fill(null));
  dp[0][0] = 0;
  for (let i = 1; i <= n; i += 1) { dp[i][0] = dp[i - 1][0] + gap; move[i][0] = "u"; }
  for (let j = 1; j <= m; j += 1) { dp[0][j] = dp[0][j - 1] + gap; move[0][j] = "l"; }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const overlap = lexicalOverlap(primary[i - 1].description, alternate[j - 1].description);
      const numeric = numericAgreement(primary[i - 1], alternate[j - 1]);
      const relativeA = n <= 1 ? 0 : (i - 1) / (n - 1);
      const relativeB = m <= 1 ? 0 : (j - 1) / (m - 1);
      const match = overlap * 7 + numeric * 8 + 1 - Math.abs(relativeA - relativeB) * 1.8;
      const diagonal = dp[i - 1][j - 1] + match;
      const up = dp[i - 1][j] + gap;
      const left = dp[i][j - 1] + gap;
      if (diagonal >= up && diagonal >= left) { dp[i][j] = diagonal; move[i][j] = "d"; }
      else if (up >= left) { dp[i][j] = up; move[i][j] = "u"; }
      else { dp[i][j] = left; move[i][j] = "l"; }
    }
  }
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const current = move[i][j];
    if (current === "d") {
      const target = primary[i - 1];
      const source = alternate[j - 1];
      const overlap = lexicalOverlap(target.description, source.description);
      const muchBetter = source.quality >= target.quality + 2.5;
      const safer = overlap >= 0.45 && source.quality >= target.quality - 0.5;
      if ((muchBetter || safer) && descriptionQuality(source.description) >= 3) target.description = source.description;
      i -= 1;
      j -= 1;
    } else if (current === "u") i -= 1;
    else if (current === "l") j -= 1;
    else break;
  }
}

function parseNamedAmount(texts: string[], label: RegExp) {
  const values: number[] = [];
  for (const text of texts) {
    for (const line of String(text || "").split(/\r?\n/)) {
      if (!label.test(line)) continue;
      const matches = line.match(/\d{1,6}[.,]\d{2}\b/g) || [];
      for (const match of matches) {
        const value = Number(match.replace(",", "."));
        if (Number.isFinite(value)) values.push(value);
      }
    }
  }
  return values.length ? values[values.length - 1] : null;
}

function explicitTotals(texts: string[]) {
  const values: number[] = [];
  for (const text of texts) {
    for (const line of String(text || "").split(/\r?\n/)) {
      if (!/\bTOTAL\b/i.test(line) || /\bTOTAL\s*IVA\b/i.test(line)) continue;
      const matches = line.match(/\d{1,6}[.,]\d{2}\b/g) || [];
      for (const match of matches) {
        const value = Number(match.replace(",", "."));
        if (Number.isFinite(value)) values.push(value);
      }
      const collapsed = line.match(/\b\d{3,6}\b/g)?.at(-1);
      if (collapsed) {
        const value = Number(`${collapsed.slice(0, -2)}.${collapsed.slice(-2)}`);
        if (Number.isFinite(value)) values.push(value);
      }
    }
  }
  return values;
}

function trustedHeader(texts: string[], merchant: string | null) {
  const lines: string[] = [];
  if (merchant) lines.push(merchant);
  const patterns = [/RAZ[ÓO]N\s+SOCIAL/i, /DIRECCI[ÓO]N\s*:/i, /PEDIDO\s+POR\s*:/i, /HORA\s*:/i];
  for (const pattern of patterns) {
    let best = "";
    for (const text of texts) {
      for (const rawLine of String(text || "").split(/\r?\n/)) {
        const index = rawLine.search(pattern);
        if (index < 0) continue;
        const line = cleanSpaces(rawLine.slice(index)).replace(/[\s\-–—|]+$/g, "");
        if (descriptionQuality(line) > descriptionQuality(best)) best = line;
      }
    }
    if (best && !lines.some((line) => fold(line) === fold(best))) lines.push(best);
  }
  return lines.slice(0, 6);
}

function trustedFooter(texts: string[]) {
  const lines: string[] = [];
  const patterns = [/PENDIENTE\s+DE\s+PAGO/i, /\bPAGADO\b/i, /\bMESA\b/i, /\bTERRAZA\b/i, /\bGRACIAS\b/i];
  for (const pattern of patterns) {
    for (const text of texts) {
      for (const rawLine of String(text || "").split(/\r?\n/)) {
        const index = rawLine.search(pattern);
        if (index < 0) continue;
        const value = cleanSpaces(rawLine.slice(index)).replace(/[\s\-–—|]+$/g, "");
        if (value && !lines.some((line) => fold(line) === fold(value))) lines.push(value);
      }
    }
  }
  return lines.slice(0, 5);
}

export function cleanReceiptMerchant(value: string | null) {
  if (!value) return null;
  let cleaned = cleanSpaces(value).replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}\d)]+$/u, "");
  cleaned = cleaned.replace(/^(?:[A-Z]\s+){1,3}(?=[A-ZÁÉÍÓÚÑ])/i, "");
  const parts = cleaned.split(/\s+-\s+/);
  if (parts.length > 1 && /\b(BAR|CAF[EÉ]|RESTAURANTE|HOTEL|TABERNA|MES[ÓO]N)\b/i.test(parts[0]) && !/\b(BAR|CAF[EÉ]|RESTAURANTE|HOTEL|TABERNA|MES[ÓO]N)\b/i.test(parts.slice(1).join(" "))) cleaned = parts[0];
  cleaned = cleaned.replace(/(?:\s+[A-Z]){1,3}$/g, "").trim();
  return letters(cleaned) >= 3 ? cleaned : null;
}

export function reconstructReceiptEvidence(
  texts: string[],
  layouts: Array<ReceiptLayout | null | undefined>,
  merchant: string | null = null,
): { layout: ReceiptLayout | null; total: number | null } {
  const blocks: EvidenceRow[][] = [];
  for (const text of texts) {
    const rows = rowsFromText(text);
    if (rows.length) blocks.push(rows);
  }
  for (const layout of layouts) {
    if (layout?.items.length) blocks.push(layout.items.map(rowFromLayout));
  }
  if (!blocks.length) return { layout: null, total: null };

  const scoreBlock = (rows: EvidenceRow[]) => rows.filter((row) => row.complete).length * 100 + rows.reduce((sum, row) => sum + Math.max(-5, row.quality), 0);
  const selected = [...blocks].sort((a, b) => scoreBlock(b) - scoreBlock(a))[0];
  const primary = selected.filter((row) => row.complete).map((row) => ({ ...row }));
  if (!primary.length) return { layout: null, total: null };
  for (const block of blocks) {
    if (block === selected || !block.length) continue;
    mergeAlignedDescriptions(primary, block);
  }

  const items: ReceiptLineItem[] = primary.map((row) => ({
    description: normalizeDescription(row.description),
    quantity: receiptDisplayNumber(row.quantity || "1"),
    unitPrice: receiptDisplayNumber(row.unitPrice || "0.00"),
    total: receiptDisplayNumber(row.total || "0.00"),
  }));
  const itemSum = round2(items.reduce((sum, item) => sum + Number(item.total.replace(",", ".")), 0));
  const totals = explicitTotals(texts);
  const matchingExplicit = totals.find((value) => Math.abs(value - itemSum) <= 0.05);
  const total = matchingExplicit ?? (itemSum > 0 ? itemSum : totals.at(-1) ?? null);

  const tax = parseNamedAmount(texts, /\b(?:TOTAL\s*)?IVA\b/i);
  const explicitBase = parseNamedAmount(texts, /\bBASE(?:\s+IMPONIBLE)?\b/i);
  const summary: ReceiptSummaryLine[] = [];
  if (total !== null) {
    const inferredBase = tax !== null ? round2(total - tax) : null;
    const base = inferredBase !== null && inferredBase >= 0 && (explicitBase === null || Math.abs(explicitBase + (tax || 0) - total) > 0.05) ? inferredBase : explicitBase;
    if (base !== null) summary.push({ label: "Base", value: base.toFixed(2) });
    if (tax !== null) summary.push({ label: "IVA", value: tax.toFixed(2) });
    summary.push({ label: "Total", value: total.toFixed(2) });
  }

  const cleanMerchant = cleanReceiptMerchant(merchant);
  return {
    total,
    layout: {
      header: trustedHeader(texts, cleanMerchant),
      items,
      summary,
      footer: trustedFooter(texts),
      source: "geometry_tsv",
    },
  };
}
