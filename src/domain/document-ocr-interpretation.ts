import type { OcrBoundingBox, OcrLine, OcrPage } from "./document-ocr";
import { receiptMoneyCents } from "./receipt-money";

export type OcrFieldConfidence = "reliable" | "doubtful" | "not_detected";

export type OcrEvidence = {
  pageNumber: number;
  lineId: string;
  text: string;
  confidence: number;
  box: OcrBoundingBox;
};

export type OcrField<T> = {
  value: T | null;
  confidence: OcrFieldConfidence;
  score: number | null;
  evidence: OcrEvidence[];
};

export type OcrLineItem = {
  description: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number | null;
  confidence: OcrFieldConfidence;
  score: number | null;
  evidence: OcrEvidence[];
};

export type DocumentOcrInterpretation = {
  contractVersion: 1;
  issuerName: OcrField<string>;
  taxId: OcrField<string>;
  documentDate: OcrField<string>;
  documentTime: OcrField<string>;
  documentNumber: OcrField<string>;
  period: OcrField<string>;
  baseCents: OcrField<number>;
  taxCents: OcrField<number>;
  totalCents: OcrField<number>;
  paymentMethod: OcrField<string>;
  lines: OcrLineItem[];
  validation: {
    basePlusTaxMatchesTotal: boolean | null;
    lineTotalMatchesTotal: boolean | null;
  };
};

type LocatedLine = { pageNumber: number; line: OcrLine };

const RELIABLE_SCORE = 0.82;
const MAX_TEXT_FIELD = 300;

function clampScore(value: number) {
  return Math.max(0, Math.min(1, value));
}

function confidence(score: number | null): OcrFieldConfidence {
  if (score === null) return "not_detected";
  return score >= RELIABLE_SCORE ? "reliable" : "doubtful";
}

function emptyField<T>(): OcrField<T> {
  return { value: null, confidence: "not_detected", score: null, evidence: [] };
}

function evidenceOf(item: LocatedLine): OcrEvidence {
  return {
    pageNumber: item.pageNumber,
    lineId: item.line.id,
    text: item.line.text,
    confidence: item.line.confidence,
    box: item.line.box,
  };
}

function field<T>(value: T | null, item?: LocatedLine | null, semanticBoost = 0): OcrField<T> {
  if (value === null || value === undefined || !item) return emptyField<T>();
  const score = clampScore(item.line.confidence + semanticBoost);
  return { value, confidence: confidence(score), score, evidence: [evidenceOf(item)] };
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleanValue(value: string) {
  return value.replace(/^[\s:#º°n.\-]+/iu, "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_FIELD);
}

function allLines(pages: OcrPage[]): LocatedLine[] {
  return pages.flatMap((page) => page.lines.map((line) => ({ pageNumber: page.pageNumber, line })));
}

function firstMatch(lines: LocatedLine[], predicate: (item: LocatedLine) => boolean) {
  return lines.find(predicate) ?? null;
}

function parseSpanishDate(text: string) {
  const dmy = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-](20\d{2}|19\d{2})\b/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${month}-${day}`;
  }
  const ymd = text.match(/\b(20\d{2}|19\d{2})[\/.\-](0?[1-9]|1[0-2])[\/.\-](0?[1-9]|[12]\d|3[01])\b/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  return null;
}

function parseTime(text: string) {
  const match = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?::([0-5]\d))?\b/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}${match[3] ? `:${match[3]}` : ""}`;
}

function parseTaxId(text: string) {
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, " ");
  const match = compact.match(/\b(?:[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/);
  return match?.[0] ?? null;
}

function moneyFromLine(line: OcrLine) {
  const words = [...line.words].sort((a, b) => a.box.x - b.box.x);
  for (const word of words.reverse()) {
    const cents = receiptMoneyCents(word.text.replace(/:$/, ""));
    if (cents !== null) return cents;
  }
  const matches = line.text.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+[,.]\d{2}/g) ?? [];
  for (const token of matches.reverse()) {
    const cents = receiptMoneyCents(token);
    if (cents !== null) return cents;
  }
  return null;
}

function labelledMoney(lines: LocatedLine[], matcher: RegExp, exclude?: RegExp) {
  const item = firstMatch(lines, ({ line }) => {
    const text = normalized(line.text);
    return matcher.test(text) && !(exclude?.test(text));
  });
  if (!item) return emptyField<number>();
  const value = moneyFromLine(item.line);
  return value === null ? emptyField<number>() : field(value, item, 0.05);
}

function labelledValue(lines: LocatedLine[], matcher: RegExp) {
  const item = firstMatch(lines, ({ line }) => matcher.test(normalized(line.text)));
  if (!item) return { item: null, value: null as string | null };
  const value = cleanValue(item.line.text.replace(matcher, " "));
  return { item, value: value || null };
}

function findIssuer(lines: LocatedLine[]) {
  const labelled = labelledValue(lines, /\b(?:razon\s+social|emisor|empresa|comercio)\b\s*[:\-]?/iu);
  if (labelled.item && labelled.value) return field(labelled.value, labelled.item, 0.08);

  const candidate = lines.slice(0, 12).find(({ line }) => {
    const text = line.text.trim();
    const token = normalized(text);
    const letters = (text.match(/\p{L}/gu) ?? []).length;
    if (letters < 3 || text.length > MAX_TEXT_FIELD) return false;
    if (/\b(?:fecha|hora|ticket|factura|nif|cif|iva|total|base|subtotal|telefono|direccion|pedido|mesa)\b/u.test(token)) return false;
    if (parseSpanishDate(text) || parseTaxId(text)) return false;
    return true;
  });
  return candidate ? field(candidate.line.text.trim(), candidate, 0) : emptyField<string>();
}

function findTaxId(lines: LocatedLine[]) {
  for (const item of lines) {
    const value = parseTaxId(item.line.text);
    if (value) {
      const labelled = /\b(?:nif|cif)\b/u.test(normalized(item.line.text));
      return field(value, item, labelled ? 0.08 : 0);
    }
  }
  return emptyField<string>();
}

function findDate(lines: LocatedLine[]) {
  const labelled = lines.find((item) => /\bfecha\b/u.test(normalized(item.line.text)) && parseSpanishDate(item.line.text));
  if (labelled) return field(parseSpanishDate(labelled.line.text), labelled, 0.08);
  for (const item of lines) {
    const value = parseSpanishDate(item.line.text);
    if (value) return field(value, item, 0);
  }
  return emptyField<string>();
}

function findTime(lines: LocatedLine[]) {
  const labelled = lines.find((item) => /\bhora\b/u.test(normalized(item.line.text)) && parseTime(item.line.text));
  if (labelled) return field(parseTime(labelled.line.text), labelled, 0.08);
  for (const item of lines) {
    const value = parseTime(item.line.text);
    if (value) return field(value, item, 0);
  }
  return emptyField<string>();
}

function findDocumentNumber(lines: LocatedLine[]) {
  const item = firstMatch(lines, ({ line }) => /\b(?:factura|ticket|documento|numero|num\.?|n[º°o])\b/iu.test(normalized(line.text)));
  if (!item) return emptyField<string>();
  const match = item.line.text.match(/(?:factura|ticket|documento|n(?:um(?:ero)?|[º°o])\.?)[\s:#º°.-]*([A-Z0-9][A-Z0-9/_\-.]{1,40})/iu);
  return match?.[1] ? field(match[1].trim(), item, 0.06) : emptyField<string>();
}

function findPeriod(lines: LocatedLine[]) {
  const item = firstMatch(lines, ({ line }) => /\bperiodo\b/u.test(normalized(line.text)));
  if (!item) return emptyField<string>();
  const value = cleanValue(item.line.text.replace(/\bperiodo\b\s*[:\-]?/iu, " "));
  return value ? field(value, item, 0.06) : emptyField<string>();
}

function findPaymentMethod(lines: LocatedLine[]) {
  const methods: Array<[RegExp, string]> = [
    [/\b(?:visa|mastercard|tarjeta|contactless|tpv)\b/u, "Tarjeta"],
    [/\befectivo\b/u, "Efectivo"],
    [/\bbizum\b/u, "Bizum"],
    [/\btransferencia\b/u, "Transferencia"],
    [/\bdomiciliacion\b/u, "Domiciliación"],
  ];
  for (const item of lines) {
    const text = normalized(item.line.text);
    const found = methods.find(([pattern]) => pattern.test(text));
    if (found) return field(found[1], item, 0.04);
  }
  return emptyField<string>();
}

function lineItems(lines: LocatedLine[]) {
  const output: OcrLineItem[] = [];
  for (const item of lines) {
    const token = normalized(item.line.text);
    if (/\b(?:base|subtotal|iva|impuesto|total|fecha|hora|nif|cif|factura|ticket|periodo)\b/u.test(token)) continue;
    const words = [...item.line.words].sort((a, b) => a.box.x - b.box.x);
    const moneyWords = words
      .map((word) => ({ word, cents: receiptMoneyCents(word.text) }))
      .filter((entry): entry is { word: typeof words[number]; cents: number } => entry.cents !== null);
    if (!moneyWords.length) continue;
    const firstMoneyX = moneyWords[0].word.box.x;
    const description = words.filter((word) => word.box.x < firstMoneyX).map((word) => word.text).join(" ").trim();
    if ((description.match(/\p{L}/gu) ?? []).length < 2) continue;
    const quantityWord = words.find((word) => word.box.x < firstMoneyX && /^\d{1,3}$/.test(word.text.trim()));
    const quantity = quantityWord ? Number(quantityWord.text.trim()) : null;
    const totalCents = moneyWords[moneyWords.length - 1].cents;
    const unitPriceCents = moneyWords.length >= 2 ? moneyWords[moneyWords.length - 2].cents : null;
    const score = clampScore(item.line.confidence);
    output.push({
      description: description.slice(0, 300),
      quantity: Number.isSafeInteger(quantity) && quantity! > 0 ? quantity : null,
      unitPriceCents,
      totalCents,
      confidence: confidence(score),
      score,
      evidence: [evidenceOf(item)],
    });
    if (output.length >= 100) break;
  }
  return output;
}

export function interpretDocumentOcr(pages: OcrPage[]): DocumentOcrInterpretation {
  const lines = allLines(pages);
  const baseCents = labelledMoney(lines, /\b(?:base(?:\s+imponible)?|subtotal)\b/u, /\btotal\b/u);
  const taxCents = labelledMoney(lines, /\b(?:iva|impuesto|impuestos)\b/u);
  const totalCents = labelledMoney(lines, /\btotal\b/u, /\bsubtotal\b/u);
  const items = lineItems(lines);

  const basePlusTaxMatchesTotal = baseCents.value === null || taxCents.value === null || totalCents.value === null
    ? null
    : baseCents.value + taxCents.value === totalCents.value;
  const knownLineTotals = items.map((item) => item.totalCents).filter((value): value is number => value !== null);
  const lineTotalMatchesTotal = !knownLineTotals.length || totalCents.value === null
    ? null
    : knownLineTotals.reduce((sum, value) => sum + value, 0) === totalCents.value;

  return {
    contractVersion: 1,
    issuerName: findIssuer(lines),
    taxId: findTaxId(lines),
    documentDate: findDate(lines),
    documentTime: findTime(lines),
    documentNumber: findDocumentNumber(lines),
    period: findPeriod(lines),
    baseCents,
    taxCents,
    totalCents,
    paymentMethod: findPaymentMethod(lines),
    lines: items,
    validation: { basePlusTaxMatchesTotal, lineTotalMatchesTotal },
  };
}
