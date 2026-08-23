import type { ReceiptLayout } from "./receipt-layout";

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
  receiptLayout?: ReceiptLayout | null;
  metadata?: DocumentMetadata;
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

function validDate(year:number,month:number,day:number,receipt:boolean){
  if(year<2000||year>2100||month<1||month>12||day<1||day>31)return false;
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return false;
  if(receipt){const now=new Date();const tomorrow=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1,23,59,59);if(date.getTime()>tomorrow)return false;}
  return true;
}

function parseDate(text: string, receipt=false) {
  const patterns = [
    /\b([0-3]?\d)[\/.-]([01]?\d)[\/.-]((?:19|20)?\d{2})\b/g,
    /\b((?:19|20)\d{2})[\/.-]([01]?\d)[\/.-]([0-3]?\d)\b/g,
  ];
  const candidates:Array<{value:string;context:number}>=[];
  for (let index = 0; index < patterns.length; index += 1) {
    for(const match of text.matchAll(patterns[index])){
      let day: number;let month: number;let year: number;
      if(index===0){day=Number(match[1]);month=Number(match[2]);year=Number(match[3]);if(year<100)year+=2000;}else{year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);}
      if(!validDate(year,month,day,receipt))continue;
      const start=Math.max(0,(match.index||0)-24);const before=text.slice(start,match.index||0);const context=/\b(fecha|hora|pedido|ticket|recibo)\b/i.test(before)?2:0;
      candidates.push({value:`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`,context});
    }
  }
  candidates.sort((a,b)=>b.context-a.context);return candidates[0]?.value||null;
}

function extractAmounts(line: string) {
  if(/\b(hora|tel[eé]fono|nif|cif)\b/i.test(line)&&!/(total|importe|pagar)/i.test(line))return [];
  const pattern=/-?\d{1,5}(?:[.\s]\d{3})*(?:,\d{2}|\.\d{2})(?:\s*(?:€|EUR))?/gi;
  const values:number[]=[];
  for(const match of line.matchAll(pattern)){
    const index=match.index||0;const after=line.slice(index+match[0].length,index+match[0].length+4);const before=line.slice(Math.max(0,index-4),index);
    if(/^[.:]\d{2}\b/.test(after)||/\d[.:]$/.test(before))continue;
    const value=parseEuroValue(match[0]);if(value!==null&&Math.abs(value)<1_000_000)values.push(value);
  }
  return values;
}

function likelyMerchant(lines: string[]) {
  const blocked = /(factura|ticket|recibo|fecha|hora|total|subtotal|iva|base|cif|nif|n\.?i\.?f|nº|num\.?|importe|pago|tarjeta|cambio|efectivo|gracias|cliente|copia|documento|unidades?|precio|raz[oó]n\s+social|direcci[oó]n|tel[eé]fono|pedido\s+por|camarero|staff|mesa)/i;
  let best: { line: string; score: number } | null = null;
  for (const [index, raw] of lines.slice(0, 18).entries()) {
    const line = cleanLine(raw);
    if (line.length < 3 || line.length > 72 || blocked.test(line)) continue;
    const letters = (line.match(/\p{L}/gu) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    const symbols = line.replace(/[\p{L}\d\s]/gu, "").length;
    if (letters < 3 || symbols > Math.max(5, line.length * 0.28)) continue;
    let score = Math.min(letters,24) * 1.25 - digits * 0.8 - symbols * 1.1 - index * 1.1;
    if(index===0)score+=16;else if(index<=2)score+=5;
    if (line === line.toUpperCase() && letters >= 5) score += 3;
    if (/\b(BAR|CAFE|CAFÉ|RESTAURANTE|SUPERMERCADO|ESTANCO|FARMACIA|TIENDA|HOTEL|MES[ÓO]N|TABERNA)\b/i.test(line)) score += 16;
    if (/\b(SL|S\.L\.|SA|S\.A\.)\b/i.test(line)) score += 4;
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

  const documentDate = parseDate(text,documentType==="receipt");
  const totalMatchers = [
    /^\s*total\s*(?::|a\s*pagar|ticket)?\b/i,
    /\b(importe\s*total|a\s*pagar|total\s*ticket)\b/i,
    /\b(pagado|tarjeta|efectivo)\b/i,
  ];
  let amount: number | null = null;
  for (const matcher of totalMatchers) {
    const matching = lines.filter((line) => matcher.test(line));
    const amounts = matching.flatMap(extractAmounts);
    if (amounts.length) {amount = amounts[amounts.length - 1];break;}
  }
  if (amount === null) {
    const euroAmounts = lines.filter((line) => /€|EUR/i.test(line)&&!/\bhora\b/i.test(line)).flatMap(extractAmounts);
    if (euroAmounts.length) amount = euroAmounts.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, euroAmounts[0]);
  }
  if (amount === null && documentType!=="receipt") {
    const allAmounts = lines.flatMap(extractAmounts).filter((value) => Math.abs(value) <= 100_000);
    if (allAmounts.length) amount = allAmounts.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, allAmounts[0]);
  }

  return { documentType, documentDate, amount, merchant: likelyMerchant(lines), lines };
}
