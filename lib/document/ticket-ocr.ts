export type DocumentTypeHint = "receipt" | null;

export type DocumentMetadata = {
  documentType: string;
  documentDate: string | null;
  amount: number | null;
  merchant: string | null;
  lines: string[];
};

export type ImageOcrResult = {
  text: string;
  layoutText: string;
  confidence: number | null;
  method: string;
  passes: Array<{ variant: string; confidence: number | null; score: number }>;
};

function cleanLine(value: string) {
  return value.replace(/[|¦]/g, "I").replace(/\s{2,}/g, " ").trim();
}

function usefulLine(value: string) {
  const line = cleanLine(value);
  if (line.length < 2) return false;
  const visible = line.replace(/\s/g, "");
  if (!visible) return false;
  const alphaNumeric = (visible.match(/[\p{L}\d]/gu) || []).length;
  return alphaNumeric / visible.length >= 0.45;
}

export function normalizeOcrText(text: string) {
  return text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(usefulLine)
    .join("\n")
    .trim();
}

export function preserveOcrLayout(text: string) {
  const lines=text.replace(/\r/g,"").split("\n").map(line=>line.replace(/\t/g,"    ").replace(/[|¦]/g,"I").replace(/\s+$/g,""));
  const compact:string[]=[];
  let previousBlank=false;
  for(const line of lines){
    const blank=!line.trim();
    if(blank&&previousBlank) continue;
    compact.push(line);
    previousBlank=blank;
  }
  return compact.join("\n").trim();
}

export function parseEuroValue(raw: string) {
  const compact = raw.replace(/\s/g, "").replace(/[€EUR]/gi, "");
  let normalized = compact;
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma > dot) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (dot > comma && comma >= 0) normalized = normalized.replace(/,/g, "");
  else if (comma >= 0) normalized = normalized.replace(",", ".");
  normalized = normalized.replace(/[^0-9.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDate(text: string) {
  const patterns = [
    /\b([0-3]?\d)[\/.-]([01]?\d)[\/.-]((?:19|20)?\d{2})\b/,
    /\b((?:19|20)\d{2})[\/.-]([01]?\d)[\/.-]([0-3]?\d)\b/,
  ];
  for (let index = 0; index < patterns.length; index += 1) {
    const match = text.match(patterns[index]);
    if (!match) continue;
    let day: number;
    let month: number;
    let year: number;
    if (index === 0) {
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
      if (year < 100) year += 2000;
    } else {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    }
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function extractAmounts(line: string) {
  const matches = line.match(/-?\d{1,5}(?:[.\s]\d{3})*(?:,\d{2}|\.\d{2})(?:\s*(?:€|EUR))?/gi) || [];
  return matches
    .map(parseEuroValue)
    .filter((value): value is number => value !== null && Math.abs(value) < 1_000_000);
}

function likelyMerchant(lines: string[]) {
  const blocked = /(factura|ticket|recibo|fecha|hora|total|subtotal|iva|base|cif|nif|nº|num\.?|importe|pago|tarjeta|cambio|efectivo|gracias|cliente|copia|documento|unidades?|precio)/i;
  let best: { line: string; score: number } | null = null;
  for (const [index, raw] of lines.slice(0, 18).entries()) {
    const line = cleanLine(raw);
    if (line.length < 3 || line.length > 72 || blocked.test(line)) continue;
    const letters = (line.match(/\p{L}/gu) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    const symbols = line.replace(/[\p{L}\d\s]/gu, "").length;
    if (letters < 3 || symbols > Math.max(4, line.length * 0.25)) continue;
    let score = letters * 1.4 - digits * 0.7 - symbols * 1.2 - index * 0.45;
    if (line === line.toUpperCase() && letters >= 5) score += 5;
    if (/\b(SL|S\.L\.|SA|S\.A\.|BAR|CAFE|CAFÉ|RESTAURANTE|SUPERMERCADO|ESTANCO|FARMACIA|TIENDA)\b/i.test(line)) score += 8;
    if (!best || score > best.score) best = { line, score };
  }
  return best?.line || null;
}

export function inferDocumentMetadata(rawText: string, hint: DocumentTypeHint = null): DocumentMetadata {
  const text = normalizeOcrText(rawText);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const lower = text.toLowerCase();
  let documentType = hint || "other";
  if (/\bfactura\b/.test(lower)) documentType = "invoice";
  else if (/\b(ticket|recibo|justificante|tique)\b/.test(lower) || hint === "receipt") documentType = "receipt";
  else if (/\bcontrato\b/.test(lower)) documentType = "contract";
  else if (/\bextracto\b/.test(lower)) documentType = "statement";
  else if (/\b(irpf|iva|impuesto|tribut)\b/.test(lower)) documentType = "tax";

  const documentDate = parseDate(text);
  const totalMatchers = [
    /\b(total\s*(?:a\s*pagar)?|importe\s*total|a\s*pagar|total\s*ticket)\b/i,
    /\b(importe|pagado|tarjeta|efectivo)\b/i,
  ];
  let amount: number | null = null;
  for (const matcher of totalMatchers) {
    const matching = lines.filter((line) => matcher.test(line));
    const amounts = matching.flatMap(extractAmounts);
    if (amounts.length) {
      amount = amounts[amounts.length - 1];
      break;
    }
  }
  if (amount === null) {
    const euroAmounts = lines.filter((line) => /€|EUR/i.test(line)).flatMap(extractAmounts);
    if (euroAmounts.length) amount = euroAmounts.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, euroAmounts[0]);
  }
  if (amount === null) {
    const allAmounts = lines.flatMap(extractAmounts).filter((value) => Math.abs(value) <= 100_000);
    if (allAmounts.length) amount = allAmounts.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, allAmounts[0]);
  }

  return { documentType, documentDate, amount, merchant: likelyMerchant(lines), lines };
}
