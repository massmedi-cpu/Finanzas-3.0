import type { OcrBoundingBox, OcrLine, DocumentOcrResult } from "./document-ocr";

export type OcrFieldTrust = "reliable" | "doubtful" | "not_detected";

export type OcrFieldEvidence = {
  pageNumber: number;
  lineId: string;
  box: OcrBoundingBox;
  rawText: string;
};

export type OcrInterpretedField<T> = {
  value: T | null;
  rawValue: string | null;
  confidence: number | null;
  trust: OcrFieldTrust;
  evidence: OcrFieldEvidence[];
};

export type OcrTaxLine = {
  ratePercent: number | null;
  baseCents: number | null;
  taxCents: number | null;
  confidence: number | null;
  trust: OcrFieldTrust;
  evidence: OcrFieldEvidence[];
};

export type OcrDocumentLineItem = {
  description: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number | null;
  confidence: number | null;
  trust: OcrFieldTrust;
  evidence: OcrFieldEvidence[];
};

export type DocumentOcrFinancialInterpretation = {
  interpretationVersion: 1;
  issuer: OcrInterpretedField<string>;
  taxId: OcrInterpretedField<string>;
  date: OcrInterpretedField<string>;
  time: OcrInterpretedField<string>;
  documentNumber: OcrInterpretedField<string>;
  period: OcrInterpretedField<string>;
  taxBaseCents: OcrInterpretedField<number>;
  taxesCents: OcrInterpretedField<number>;
  totalCents: OcrInterpretedField<number>;
  paymentMethod: OcrInterpretedField<string>;
  taxLines: OcrTaxLine[];
  lines: OcrDocumentLineItem[];
  warnings: string[];
};

type LocatedLine = { pageNumber: number; line: OcrLine };

const RELIABLE_CONFIDENCE = 0.82;
// Spanish invoices use IVA, I.V.A., IGIC and I.G.I.C. interchangeably.
const TAX_ACRONYM = /\b(?:i\.?v\.?a|i\.?g\.?i\.?c)\b\.?/;
// A suffix of a longer excise-duty rate (5,1126963 %) is never a VAT rate.
const COMPLETE_TAX_RATE = /(?<![\d,.])(\d{1,2}(?:[,.]\d{1,2})?)\s*%/;

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function trustFor(confidence: number | null, detected: boolean): OcrFieldTrust {
  if (!detected) return "not_detected";
  if (confidence !== null && confidence >= RELIABLE_CONFIDENCE) return "reliable";
  return "doubtful";
}

function emptyField<T>(): OcrInterpretedField<T> {
  return { value: null, rawValue: null, confidence: null, trust: "not_detected", evidence: [] };
}

function evidenceOf(item: LocatedLine): OcrFieldEvidence {
  return {
    pageNumber: item.pageNumber,
    lineId: item.line.id,
    box: item.line.box,
    rawText: item.line.text,
  };
}

function fieldFrom<T>(item: LocatedLine | null, rawValue: string | null, value: T | null): OcrInterpretedField<T> {
  if (!item || rawValue === null || value === null) return emptyField<T>();
  const confidence = item.line.confidence;
  return {
    value,
    rawValue,
    confidence,
    trust: trustFor(confidence, true),
    evidence: [evidenceOf(item)],
  };
}

// OCR confidence measures character recognition, not whether the document field was
// identified correctly. Keep uncertain candidates editable but require human review.
function fieldRequiringReview<T>(field: OcrInterpretedField<T>): OcrInterpretedField<T> {
  return field.value === null ? field : { ...field, trust: "doubtful" };
}

function parseMoneyCents(raw: string): number | null {
  // Parentheses with an explicit euro marker represent an accounting debit/credit
  // sign. Bare parentheses are ambiguous: never silently turn them positive.
  const accountingNegative = /^\s*\([^()]*\)\s*(?:€|\bEUR\b)?\s*$/i.test(raw)
    && /€|\bEUR\b/i.test(raw);
  const cleaned = raw
    .replace(/[\u2212\u2013]/g, "-")
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/[^\d,.-]/g, "");
  if (!cleaned || (accountingNegative && cleaned.includes("-"))) return null;

  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    const decimals = cleaned.length - lastDot - 1;
    normalized = decimals === 2 ? cleaned.replace(/,/g, "") : cleaned.replace(/\./g, "").replace(",", ".");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100) * (accountingNegative ? -1 : 1);
  return Number.isSafeInteger(cents) ? cents : null;
}

// OCR can mix prices (12,34) with weights, ratios and incomplete numeric
// tokens (1,234). Never interpret the prefix "1,23" of "1,234" as money.
// PDF text often groups thousands with ordinary, non-breaking (U+00A0) or
// narrow no-break (U+202F) spaces. Matching only the suffix "234,56" of a
// printed "1 234,56" would silently understate the invoice by 1,000 euros.
// Match the WHOLE grouped number, including signs separated by one space,
// and preserve the original raw evidence without changing punctuation.
const FINANCIAL_AMOUNT_TOKEN = /(?:[-\u2212\u2013][ \u00a0\u202f]?)?(?:\d{1,3}(?:[. \u00a0\u202f]\d{3})+,\d{2}|\d{1,3}(?:[, \u00a0\u202f]\d{3})+\.\d{2}|\d+[,.]\d{2})/g;
// An integer is money only when the OCR line explicitly prints € after it.
// A bare 21, 100 or 1.234 could instead be a rate, quantity or document ID.
// Comma-grouped integers remain ambiguous (1,234 can be a weight in kg).
const INTEGER_EURO_TOKEN = /(?:[-\u2212\u2013][ \u00a0\u202f]?)?(?:\d{1,3}(?:[. \u00a0\u202f]\d{3})+|\d+)(?=\s*€)/g;
// Some receipts place the currency *before* a whole-euro amount: TOTAL € 50
// or TOTAL EUR 1.234. Only an explicit currency token permits integer euros;
// the boundary checks below reject accidental prefixes of decimal/weight data.
const PREFIXED_EURO_INTEGER_TOKEN = /(?:€|\bEUR\b)\s*(?:[-\u2212\u2013][ \u00a0\u202f]?)?(?:\d{1,3}(?:[. \u00a0\u202f]\d{3})+|\d+)/gi;

// Credit notes can print an accounting-negative amount as "(1.234,56 €)"
// or "(EUR 1 234,56)". Require a visible currency marker and a complete
// parenthesized token. A bare "(12,34)" is ambiguous, not positive proof.
const ACCOUNTING_EURO_TOKEN = /\(\s*(?:(?:€|\bEUR\b)\s*)?(?:\d{1,3}(?:[. \u00a0\u202f]\d{3})+,\d{2}|\d{1,3}(?:[, \u00a0\u202f]\d{3})+\.\d{2}|\d+[,.]\d{2}|\d{1,3}(?:[. \u00a0\u202f]\d{3})+|\d+)\s*(?:€|\bEUR\b)?\s*\)(?:\s*(?:€|\bEUR\b))?/gi;

function exactFinancialAmountMatches(text: string) {
  const candidates = [
    ...text.matchAll(ACCOUNTING_EURO_TOKEN),
    ...text.matchAll(FINANCIAL_AMOUNT_TOKEN),
    ...text.matchAll(INTEGER_EURO_TOKEN),
    ...text.matchAll(PREFIXED_EURO_INTEGER_TOKEN),
  ].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  const accepted: RegExpExecArray[] = [];
  for (const match of candidates) {
    // The accounting matcher also sees "(12,34)" without a sign. Reject it;
    // later decimal matching must not steal its inner positive number.
    if (match[0].startsWith("(") && !/€|\bEUR\b/i.test(match[0])) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const previous = text[start - 1] ?? "";
    const previousPrevious = text[start - 2] ?? "";
    const next = text[end] ?? "";
    const nextNext = text[end + 1] ?? "";
    const startsInsideNumber = /\d/.test(previous)
      || (/[.,]/.test(previous) && /\d/.test(previousPrevious));
    const endsInsideNumber = /\d/.test(next)
      || (/[.,]/.test(next) && /\d/.test(nextNext));
    const isPercentage = /^\s*%/.test(text.slice(end));
    const bareParenthesized = text.slice(0, start).trimEnd().endsWith("(")
      && text.slice(end).trimStart().startsWith(")");
    // The complete accounting match must win over its inner positive match.
    // This also prevents the same amount being counted twice in a tax table.
    const overlapsAccepted = accepted.some((prior) =>
      start < (prior.index ?? 0) + prior[0].length && end > (prior.index ?? 0));
    if (startsInsideNumber || endsInsideNumber || isPercentage || bareParenthesized || overlapsAccepted) continue;
    accepted.push(match);
  }
  return accepted;
}

function findLabelled(lines: LocatedLine[], labels: RegExp[]) {
  return lines.find((item) => labels.some((label) => label.test(normalizeToken(item.line.text)))) ?? null;
}

function valueAfterLabel(text: string) {
  const trimmed = text.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex >= 0) {
    const value = trimmed.slice(colonIndex + 1).trim();
    return value || null;
  }
  const separator = trimmed.match(/\s[-–—]\s/);
  if (separator?.index !== undefined) {
    const value = trimmed.slice(separator.index + separator[0].length).trim();
    return value || null;
  }
  const tokens = trimmed.split(/\s+/);
  return tokens.length > 1 ? tokens.slice(1).join(" ").trim() : null;
}

// A tax table ends with "TOTAL [tax bases] [tax quotas]". That subtotal is
// not another invoice total, even though the heading spells TOTAL. Only
// discount a row when the source proves a same-page tax-table context.
function isTaxTableFooter(lines: LocatedLine[], index: number) {
  const item = lines[index];
  const text = normalizeToken(item.line.text);
  if (!/^total\s+/.test(text) || exactFinancialAmountMatches(item.line.text).length !== 2) return false;
  // PDF.js may collapse a tax-table subtotal and a separate PAYABLE TOTAL
  // into one line. A mere two-money count must not suppress a clearly owned
  // grand total just because the immediately preceding rows are VAT rates.
  // Tax-only "TOTAL 25,37 3,81" remains excluded below.
  // The extra label must own an amount AFTER it. An OCR fragment ending
  // "TOTAL 10,00 2,10 IMPORTE TOTAL" still contains only the tax footer:
  // borrowing 2,10 from before the unfinished label would invent a total.
  const payableLabels = /\b(?:total\s+a\s+pagar|importe\s+total(?:\s+factura)?|importe(?:\s+de\s+la)?\s+factura|total\s+(?:factura|final))\b/g;
  if ([...text.matchAll(payableLabels)].some((match) => {
    const after = text.slice((match.index ?? 0) + match[0].length);
    if (/^\s*(?:i\.?v\.?a|i\.?g\.?i\.?c|impuestos?|descuentos?)\b/.test(after)) return false;
    return exactFinancialAmountMatches(after).length > 0;
  })) return false;
  for (let back = 1; back <= 6 && back <= index; back += 1) {
    const header = lines[index - back];
    if (header.pageNumber !== item.pageNumber) break;
    const normalized = normalizeToken(header.line.text);
    if (TAX_ACRONYM.test(normalized)
      && /\bbase\s+imponible\b/.test(normalized)
      && /\bcuota\b/.test(normalized)) {
      return lines.slice(index - back + 1, index).some((row) =>
        row.pageNumber === item.pageNumber && /^\s*\d{1,2}(?:[,.]\d{1,2})?\s*%/.test(row.line.text));
    }
  }
  return false;
}

function isRetailVatTableHeader(text: string) {
  return /^tipo\s*%\s*impuesto\s+base\s+cuota\b/.test(normalizeToken(text));
}

function retailVatCells(text: string) {
  const row = text.trim().match(/^i\.?v\.?a\.?\s+(.+)$/i);
  if (!row) return null;
  const cells = row[1].trim().split(/\s+/);
  // Four cells: rate, base, quota, row total. Six add recargo rate and
  // quota before the row total. Reject partial/misaligned OCR tokens.
  if (cells.length !== 4 && cells.length !== 6) return null;
  if (!cells.every((cell) => exactFinancialAmountMatches(cell).some((match) => match[0] === cell))) return null;
  const values = cells.map(parseMoneyCents);
  if (values.some((value) => value === null)) return null;
  const ratePercent = Number(cells[0].replace(",", "."));
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) return null;
  return { ratePercent, baseCents: values[1]!, taxCents: values[2]! };
}

function retailVatHeaderForRow(lines: LocatedLine[], index: number): LocatedLine | null {
  const item = lines[index];
  if (!retailVatCells(item.line.text)) return null;
  for (let back = 1; back <= 8 && index - back >= 0; back += 1) {
    const prior = lines[index - back];
    if (prior.pageNumber !== item.pageNumber) break;
    if (isRetailVatTableHeader(prior.line.text)) return prior;
    if (!retailVatCells(prior.line.text)) break;
  }
  return null;
}

function extractMoneyField(
  lines: LocatedLine[],
  labels: RegExp[],
  options: { exclude?: RegExp; prefer?: RegExp; adjacentAmount?: boolean; ownLabelOnly?: boolean; skipTaxTableFooter?: boolean; skipExplanatoryParentheses?: boolean; skipShippingBase?: boolean; skipElectricityDuty?: boolean; preferVatQuota?: boolean } = {},
) {
  const candidates = lines.flatMap((item, index) => {
    const normalized = normalizeToken(item.line.text);
    if (options.ownLabelOnly && retailVatHeaderForRow(lines, index)) return [];
    if (options.skipShippingBase && /^base imponible gastos? de envio\b/.test(normalized)) return [];
    if (options.skipElectricityDuty && /\bimpuesto (?:sobre la )?electricidad\b/.test(normalized)) return [];
    // A PDF/OCR extractor can merge "TOTAL IVA" and "TOTAL A PAGAR" into one
    // line. Exclude only the misleading heading, not the entire row: blank
    // its characters to preserve the offsets of the real payable label.
    const searchable = item.line.text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const labelSearch = options.exclude
      ? searchable.replace(
        new RegExp(options.exclude.source, options.exclude.flags.includes("g")
          ? options.exclude.flags : options.exclude.flags + "g"),
        (excluded) => " ".repeat(excluded.length),
      )
      : searchable;
    if (!labels.some((label) => label.test(labelSearch))) return [];
    if (options.skipTaxTableFooter && isTaxTableFooter(lines, index)) return [];

    // Do not treat the last number in a whole OCR row as its labelled amount.
    // Receipts can place TOTAL, cash received and CHANGE on the same row.
    const labelsFound = labels.flatMap((label) => {
      const match = label.exec(labelSearch);
      return match ? [{ index: match.index, end: match.index + match[0].length }] : [];
    });
    const preferred = options.prefer?.exec(labelSearch) ?? null;
    const anchorEnd = preferred
      ? preferred.index + preferred[0].length
      : labelsFound.reduce((earliest, found) => Math.min(earliest, found.end), Number.POSITIVE_INFINITY);
    const monies = exactFinancialAmountMatches(item.line.text)
      .flatMap((match) => {
        // An explanatory VAT/discount figure inside parentheses is not owned
        // by the surrounding TOTAL label. Keep it available to tax parsing.
        const moneyStart = match.index ?? 0;
        if (options.skipExplanatoryParentheses && !match[0].startsWith("(")
          && item.line.text.lastIndexOf("(", moneyStart) > item.line.text.lastIndexOf(")", moneyStart)) return [];
        const value = parseMoneyCents(match[0]);
        return value === null ? [] : [{ raw: match[0], value, index: match.index }];
      });
    // BASE / IVA often share a line with TOTAL, payment or another field.
    // Only amounts before the next *different* financial label belong to
    // BASE / IVA. Never borrow an invoice total as a tax or a tax as a base.
    const nextOwner = options.ownLabelOnly
      ? searchable.slice(anchorEnd).search(/\b(?:base(?: imponible)?|subtotal|i\.?v\.?a|i\.?g\.?i\.?c|impuestos?|cuota(?: del? iva)?|total|importe total|a pagar|efectivo|tarjeta|cambio)\b/)
      : -1;
    const segmentEnd = nextOwner >= 0 ? anchorEnd + nextOwner : Number.POSITIVE_INFINITY;
    const following = monies.filter((money) => money.index >= anchorEnd && money.index < segmentEnd);
    // "IVA 21 % s/ 33,89 7,12" prints the taxable base before the
    // quota. Both amounts stay reviewable; the quota owns the tax field.
    const vatBaseAndQuota = options.preferVatQuota && TAX_ACRONYM.test(normalized)
      && COMPLETE_TAX_RATE.test(normalized.slice(anchorEnd))
      && /\bs\s*\/\s*/.test(normalized.slice(anchorEnd)) && following.length === 2;
    let chosen = (vatBaseAndQuota ? following[1] : following[0])
      ?? (options.ownLabelOnly ? undefined : monies.at(-1));
    let adjacent: LocatedLine | null = null;
    if (!chosen && options.adjacentAmount) {
      // Layout engines often break "TOTAL A PAGAR" and "23,45 €" into
      // distinct OCR lines. Recover only a *bare* label with a single
      // standalone money token on the next line of the same page. This is
      // evidence for review, not automatic certification.
      // Printed bills often split "TOTAL (€)" from its amount across
      // adjacent lines. Accept an explicit currency marker on the label,
      // but retain the single-standalone-money / same-page safeguards below.
      const bareTotal = /^(?:total(?: a pagar| importe factura| factura| final)?|importe(?: de la)? factura|importe total|a pagar)\s*(?:\(\s*(?:€|eur)\s*\)|€|eur)?\s*[:=-]?\s*$/.test(normalized);
      const next = lines[index + 1];
      if (bareTotal && next?.pageNumber === item.pageNumber) {
        const amountMatches = exactFinancialAmountMatches(next.line.text);
        const remainder = amountMatches.length === 1
          ? next.line.text.replace(amountMatches[0][0], "").replace(/[€\s:=.-]/g, "")
          : "?";
        const amount = amountMatches.length === 1 && remainder === ""
          ? parseMoneyCents(amountMatches[0][0])
          : null;
        if (amount !== null) {
          chosen = { raw: amountMatches[0][0], value: amount, index: 0 };
          adjacent = next;
        }
      }
    }
    if (!chosen) return [];

    // A trailing payment label or competing figure weakens field attribution,
    // even if character-level OCR confidence is high. Preserve source evidence.
    const intervening = searchable.slice(anchorEnd, chosen.index);
    const paymentBeforeAmount = /\b(?:efectivo|tarjeta|cambio|recibido|entregado|devolucion)\b/.test(intervening);
    const conflictingAmounts = new Set(following.map((money) => money.value)).size > 1;
    return [{
      item,
      raw: chosen.raw,
      value: chosen.value,
      preferred: Boolean(preferred),
      needsReview: adjacent !== null || following.length === 0 || paymentBeforeAmount || conflictingAmounts
         || chosen.raw.trim().startsWith("("), // Accounting parentheses remain subject to human sign verification.
      adjacent,
    }];
  });
  if (!candidates.length) return emptyField<number>();
  // Explicit "total a pagar" wins over a generic TOTAL. Contradictory
  // alternatives or amounts preceding their label always require review.
  const chosen = candidates.find((candidate) => candidate.preferred) ?? candidates[0];
  const field = fieldFrom(chosen.item, chosen.raw, chosen.value);
  if (!chosen.needsReview && new Set(candidates.map((candidate) => candidate.value)).size <= 1) return field;
  return {
    ...fieldRequiringReview(field),
    confidence: chosen.adjacent ? Math.min(chosen.item.line.confidence, chosen.adjacent.line.confidence) : field.confidence,
    evidence: candidates.flatMap((candidate) => [
      evidenceOf(candidate.item),
      ...(candidate.adjacent ? [evidenceOf(candidate.adjacent)] : []),
    ]),
  };
}

function spanishTaxIdChecksumValid(raw: string): boolean {
  const value = raw.toUpperCase().replace(/[\s-]/g, "");
  const dniLetters = "TRWAGMYFPDXBNJZSQVHLCKE";
  if (/^\d{8}[A-Z]$/.test(value)) {
    return dniLetters[Number(value.slice(0, 8)) % 23] === value[8];
  }
  if (/^[XYZ]\d{7}[A-Z]$/.test(value)) {
    const numeric = `${{X: "0", Y: "1", Z: "2"}[value[0] as "X" | "Y" | "Z"]}${value.slice(1, 8)}`;
    return dniLetters[Number(numeric) % 23] === value[8];
  }
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(value)) return false;
  const digits = value.slice(1, 8).split("").map(Number);
  const doubled = (digit: number) => { const value = digit * 2; return Math.floor(value / 10) + (value % 10); };
  const evenSum = digits[1] + digits[3] + digits[5];
  const oddDoubledSum = doubled(digits[0]) + doubled(digits[2]) + doubled(digits[4]) + doubled(digits[6]);
  const checksum = evenSum + oddDoubledSum;
  const control = (10 - checksum % 10) % 10;
  const suffix = value[8];
  const numberAllowed = "ABEH".includes(value[0]) || !"NPQRSW".includes(value[0]);
  const letterAllowed = !"ABEH".includes(value[0]);
  return (numberAllowed && suffix === String(control)) || (letterAllowed && suffix === "JABCDEFGHI"[control]);
}

function extractTaxId(lines: LocatedLine[]) {
  const pattern = /\b(?:[XYZ]\s*[- ]?\s*\d{7}\s*[- ]?\s*[A-Z]|[ABCDEFGHJNPQRSUVW]\s*[- ]?\s*\d{7}\s*[- ]?\s*[0-9A-J]|\d{8}\s*[- ]?\s*[A-Z])\b/gi;
  const recipientHeader = /^(?:(?:datos|informacion)\s+(?:de|del|de la)\s+)?(?:cliente|destinatario|receptor|comprador|facturar\s+a)\b|^razon\s+social\s+(?:del|de\s+la)\s+(?:cliente|destinatario|receptor|comprador)\b/;
  const issuerHeader = /^(?:datos?\s+(?:del?\s+)?(?:emisor|proveedor|comercio|vendedor)|emisor|proveedor|vendedor|comercio)\b/;
  const ownerBeforeId = /\b(emisor|proveedor|comercio|vendedor|cliente|destinatario|receptor|comprador)\b/g;
  const issuerOwners = new Set(["emisor", "proveedor", "comercio", "vendedor"]);
  const recipientOwners = new Set(["cliente", "destinatario", "receptor", "comprador"]);
  let unassigned: OcrInterpretedField<string> | null = null;
  let issuerId: OcrInterpretedField<string> | null = null;
  let conflictingIssuerIds = false;
  let recipientSection = false;
  let issuerSection = false;
  let currentPage = -1;

  for (const item of lines) {
    if (item.pageNumber !== currentPage) {
      currentPage = item.pageNumber;
      recipientSection = false;
      issuerSection = false;
    }
    const normalized = normalizeToken(item.line.text);
    // Ownership often appears on a separate OCR line. Carry it only within
    // the same page, and reset when an opposing block header is encountered.
    if (recipientHeader.test(normalized)) {
      recipientSection = true;
      issuerSection = false;
    } else if (issuerHeader.test(normalized)) {
      recipientSection = false;
      issuerSection = true;
    }

    // One OCR row may contain TWO IDs: "Cliente CIF ... Emisor CIF ...".
    // Never read the first ID and assign it to the second owner's label.
    for (const match of item.line.text.matchAll(pattern)) {
      // Split the ORIGINAL OCR text before normalizing. normalizeToken
      // removes Unicode diacritics (including U+00B7 middle dot), which
      // previously joined "Cliente CIF … · Emisor CIF …" into one owner
      // span and incorrectly downgraded a valid issuer ID.
      const prefix = item.line.text.slice(0, match.index ?? 0);
      const boundary = Math.max(
        prefix.lastIndexOf("·"), prefix.lastIndexOf("|"),
        prefix.lastIndexOf(";"), prefix.lastIndexOf("/"),
      );
      const before = normalizeToken(prefix.slice(boundary + 1));
      const owners = [...before.matchAll(ownerBeforeId)];
      const nearest = owners.at(-1)?.[1] ?? null;
      const explicitlyIssuerOwned = nearest !== null && issuerOwners.has(nearest);
      const explicitlyRecipientOwned = nearest !== null && recipientOwners.has(nearest);
      if (explicitlyRecipientOwned) continue;
      if (recipientSection && !explicitlyIssuerOwned) continue;
      const raw = match[0].replace(/\s+/g, "");
      const candidate = fieldFrom(item, raw, raw.replace(/-/g, ""));
      // "Cliente: Comercio DEL BARRIO SL CIF..." is one recipient clause,
      // not a new seller. Two owner labels with no clear clause boundary
      // are never grounds for a fully trusted issuer attribution.
      const mixedRecipientOwner = explicitlyIssuerOwned
        && owners.some((entry) => recipientOwners.has(entry[1]));
      if (mixedRecipientOwner) {
        unassigned ??= fieldRequiringReview(candidate);
        continue;
      }
      if (explicitlyIssuerOwned || issuerSection) {
        // Even two fully readable, checksum-valid seller IDs are not a
        // trustworthy automatic answer if they disagree across OCR lines.
        const attributed = spanishTaxIdChecksumValid(candidate.value ?? "")
          ? candidate : fieldRequiringReview(candidate);
        if (issuerId && issuerId.value !== attributed.value) {
          conflictingIssuerIds = true;
          if (issuerId.trust !== "reliable" && attributed.trust === "reliable") {
            issuerId = attributed;
          }
        } else {
          issuerId ??= attributed;
        }
        continue;
      }
      // An ownerless tax ID remains visible for review, not auto-confirmed.
      unassigned ??= fieldRequiringReview(candidate);
    }
  }
  if (issuerId) return conflictingIssuerIds ? fieldRequiringReview(issuerId) : issuerId;
  return unassigned ?? emptyField<string>();
}

function extractDate(lines: LocatedLine[]) {
  const pattern = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/;
  const isoPattern = /\b(\d{4})([-./])(\d{1,2})\2(\d{1,2})\b/;
  const numericDateText = "(?:\\d{4}[-./]\\d{1,2}[-./]\\d{1,2}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4})";
  const writtenPattern = /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})\b/i;
  const namedMonth: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
    octubre: 10, noviembre: 11, diciembre: 12,
  };
  // Billing dates, contract expiry and legal conditions are not evidence of
  // a receipt purchase or invoice issue date.
  const unrelated = /\b(?:nacimiento|vencimiento|caducidad|vigencia|registro|periodo|hasta|desde|legal)\b/;
  const directLabel = new RegExp("^(?:fecha(?:\\s+de\\s+(?:emision|expedicion|compra|factura))?|fecha\\s*(?:/|y)\\s*hora|emitid[oa]\\s+el)\\s*[:\\-]?\\s*" + numericDateText + "\\b");
  const explicitWritten = /\b(?:emitid[oa]\s+el|fecha(?:\s+de\s+(?:emision|expedicion|compra|factura))?\s*[:\-]?)\s*\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+\d{4}\b/;
  const embeddedNumericIssueDate = new RegExp("\\b(?:emitid[oa]\\s+el|fecha\\s+de\\s+(?:emision|expedicion|compra|factura)\\s*[:\\-]?)\\s*" + numericDateText + "\\b");
  let unlabelled: OcrInterpretedField<string> | null = null;
  let issueDate: OcrInterpretedField<string> | null = null;
  let contradictoryIssueDates = false;

  for (const [lineIndex, item] of lines.entries()) {
    const normalized = normalizeToken(item.line.text);
    // A separately printed expiry or billing-period date must not erase an
    // explicitly labelled issue/purchase timestamp on the SAME OCR line.
    if (unrelated.test(normalized) && !directLabel.test(normalized)
      && !embeddedNumericIssueDate.test(normalized) && !explicitWritten.test(normalized)) continue;
    // Match the date FOLLOWING its issue label, not an unrelated number
    // earlier on the same invoice row (e.g. order date before "emitida el").
    const labelledWritten = normalized.match(explicitWritten)?.[0].match(writtenPattern) ?? null;
    const labelledText = normalized.match(directLabel)?.[0]
      ?? normalized.match(embeddedNumericIssueDate)?.[0];
    const labelledIso = labelledText?.match(isoPattern) ?? null;
    const labelledNumeric = labelledIso ? null : labelledText?.match(pattern) ?? null;
    const isoDate = labelledIso ?? (labelledNumeric || labelledWritten ? null : item.line.text.match(isoPattern));
    const numeric = labelledNumeric ?? (labelledWritten || isoDate ? null : item.line.text.match(pattern));
    const written = labelledWritten ?? (numeric || isoDate ? null : item.line.text.match(writtenPattern));
    if (!numeric && !written && !isoDate) continue;
    const day = Number(isoDate?.[4] ?? numeric?.[1] ?? written?.[1]);
    const month = isoDate ? Number(isoDate[3]) : numeric ? Number(numeric[2]) : namedMonth[(written?.[2] ?? "").toLowerCase()];
    const sourceYear = isoDate?.[1] ?? numeric?.[3] ?? written?.[3] ?? "";
    const year = Number(sourceYear.length === 2 ? "20" + sourceYear : sourceYear);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) continue;
    const iso = String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const field = fieldFrom(item, isoDate?.[0] ?? numeric?.[0] ?? written?.[0] ?? "", iso);
    // Some real digital invoices split "Fecha de Factura:" and a YYYY.MM.DD
    // value into separate PDF/OCR rows. Prefer only a standalone calendar date
    // immediately adjacent to an explicit ISSUE label on the SAME page.
    // Proximity is useful evidence, not proof: always require human review.
    const previous = lineIndex > 0 ? lines[lineIndex - 1] : null;
    const precedingLabel = previous ? normalizeToken(previous.line.text) : "";
    const issueLabelOnly = /^(?:fecha(?: de (?:emision|expedicion|compra|factura))?|fecha\s*(?:\/|y)\s*hora)\s*[:\-]?\s*$/.test(precedingLabel);
    const dateToken = isoDate?.[0] ?? numeric?.[0] ?? written?.[0] ?? "";
    const standaloneValue = item.line.text.trim() === dateToken;
    const samePageAndNear = previous !== null
      && previous.pageNumber === item.pageNumber
      && item.line.box.y >= previous.line.box.y - 0.01
      && item.line.box.y - (previous.line.box.y + previous.line.box.height) <= 0.07;
    if (issueLabelOnly && standaloneValue && samePageAndNear) {
      const attributed = {
        ...fieldRequiringReview(field),
        evidence: [evidenceOf(previous!), evidenceOf(item)],
      };
      if (issueDate && issueDate.value !== attributed.value) contradictoryIssueDates = true;
      else issueDate ??= attributed;
      continue;
    }
    if (labelledNumeric || labelledWritten || labelledIso) {
      // Two competing labelled dates on one OCR row cannot both be trusted.
      // Dates on continuation pages may be annex/legal dates. A perfect OCR
      // score alone does not prove that a page-two label is the issue date.
      const attributed = item.pageNumber > 1 || (labelledNumeric && labelledWritten)
        ? fieldRequiringReview(field) : field;
      if (issueDate && issueDate.value !== attributed.value) {
        contradictoryIssueDates = true;
        if (issueDate.trust !== "reliable" && attributed.trust === "reliable") {
          issueDate = attributed;
        }
      } else {
        issueDate ??= attributed;
      }
      continue;
    }
    // Unlabelled date text may be correct, but we cannot prove its document role.
    unlabelled ??= fieldRequiringReview(field);
  }
  if (issueDate) return contradictoryIssueDates ? fieldRequiringReview(issueDate) : issueDate;
  return unlabelled ?? emptyField<string>();
}

// An ISO/Spanish date printed alongside an issue time must be a real
// calendar day before the paired time can be certified as reliable.
function isRealPrintedTimestampDate(value: string) {
  const iso = value.match(/^(\d{4})([-./])(\d{1,2})\2(\d{1,2})$/);
  const spanish = iso ? null : value.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (!iso && !spanish) return false;
  const day = Number(iso?.[4] ?? spanish?.[1]);
  const month = Number(iso?.[3] ?? spanish?.[2]);
  const printedYear = iso?.[1] ?? spanish?.[3] ?? "";
  const year = Number(printedYear.length === 2 ? "20" + printedYear : printedYear);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function extractTime(lines: LocatedLine[]) {
  const pattern = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/;
  const unrelated = /\b(?:horario|apertura|cierre|atencion\s+al\s+publico|laborables|oficinas|vencimiento|caducidad|vigencia|plazo\s+de\s+pago)\b/;
  const explicitTime = /^(?:hora(?:\s+(?:de\s+)?(?:compra|emision|ticket))?|fecha\s+y\s+hora)\s*[:\-]\s*\d{1,2}:\d{2}\b/;
  // Receipt printers frequently put date and time on one line, labelled
  // FECHA/HORA or FECHA Y HORA. Prefer that timestamp, not opening hours.
  const issueTimestamp = /^(?:fecha(?:\s+de\s+(?:emision|expedicion|compra|factura))?|fecha\s*(?:\/|y)\s*hora|emitid[oa]\s+el)\s*[:\-]?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\s+(?:a\s+las\s+)?\d{1,2}:\d{2}\b/;
  let unknown: OcrInterpretedField<string> | null = null;
  let issueTime: OcrInterpretedField<string> | null = null;
  let contradictoryIssueTimes = false;
  for (const item of lines) {
    const match = item.line.text.match(pattern);
    if (!match) continue;
    const normalized = normalizeToken(item.line.text);
    const issueTimestampMatch = normalized.match(issueTimestamp);
    if (unrelated.test(normalized) && !issueTimestampMatch
      && !explicitTime.test(normalized)) continue;
    const candidate = fieldFrom(item, match[0], `${match[1].padStart(2, "0")}:${match[2]}`);
    if (explicitTime.test(normalized) || issueTimestampMatch) {
      // A continuation page or impossible printed issue date cannot establish
      // a reliable time even when its OCR characters are high confidence.
      const doubtfulPrintedDate = issueTimestampMatch !== null
        && !isRealPrintedTimestampDate(issueTimestampMatch[1]);
      const attributed = item.pageNumber > 1 || doubtfulPrintedDate
        ? fieldRequiringReview(candidate) : candidate;
      if (issueTime && issueTime.value !== attributed.value) {
        contradictoryIssueTimes = true;
        if (issueTime.trust !== "reliable" && attributed.trust === "reliable") {
          issueTime = attributed;
        }
      } else {
        issueTime ??= attributed;
      }
      continue;
    }
    unknown ??= fieldRequiringReview(candidate);
  }
  if (issueTime) return contradictoryIssueTimes ? fieldRequiringReview(issueTime) : issueTime;
  return unknown ?? emptyField<string>();
}

function extractDocumentNumber(lines: LocatedLine[]) {
  const patterns = [
    /\b(?:factura|ticket)\s*(?:n(?:[ºo]|um(?:ero)?)?\.?|numero)?\s*[:#-]\s*([A-Z0-9][A-Z0-9._/-]{1,119})\b/i,
    /\b(?:factura|ticket)\s+(?:n(?:[ºo]|um(?:ero)?)?\.?\s*)?([A-Z0-9][A-Z0-9._/-]{1,119})\b/i,
    /\b(?:n(?:[ºo]|um(?:ero)?)?\.?|numero)\s*(?:de\s+)?(?:factura|ticket)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{1,119})\b/i,
  ];

  for (const item of lines) {
    const text = item.line.text.trim();
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const candidate = match?.[1]?.trim() ?? "";
      // Un título genérico como “Factura simplificada” no es un número de documento.
      // Exigimos una señal estructural mínima (al menos un dígito) para no inventarlo.
      if (!candidate || !/\d/.test(candidate)) continue;
      const field = fieldFrom(item, match![0], candidate);
      // Invoice numbers sometimes resemble calendar dates, and OCR can
      // misidentify a printed issue date after "Factura:" as its number.
      // Preserve the candidate and its evidence, but never certify a
      // date-shaped reference without the owner's review.
      if (/^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}$/.test(candidate)) {
        return fieldRequiringReview(field);
      }
      return field;
    }
  }
  return emptyField<string>();
}

function extractPeriod(lines: LocatedLine[]) {
  const item = findLabelled(lines, [/\bperiodo\b/, /\bperiod facturado\b/, /\bdesde\b.*\bhasta\b/]);
  if (!item) return emptyField<string>();
  const raw = valueAfterLabel(item.line.text) ?? item.line.text.trim();
  return fieldFrom(item, raw, raw);
}

function extractPaymentMethod(lines: LocatedLine[]) {
  const keywords = [
    { pattern: /\bvisa\b|\bmastercard\b|\btarjeta\b|\bcard\b/, value: "Tarjeta" },
    { pattern: /\befectivo\b|\bcash\b/, value: "Efectivo" },
    { pattern: /\btransferencia\b/, value: "Transferencia" },
    { pattern: /\bbizum\b/, value: "Bizum" },
    { pattern: /\bdomiciliacion\b|\bdomiciliad[oa]s?\b|\b(?:pago|cargo)\s+(?:por|mediante|con)\s+recibo\b/, value: "Domiciliación" },
  ];
  let unlabelled: OcrInterpretedField<string> | null = null;
  for (const item of lines) {
    const normalized = normalizeToken(item.line.text);
    // A rejected, still-pending or merely accepted payment method is not
    // evidence that this transaction was actually paid by that method.
    if (/\b(?:pago\s+pendiente|pendiente\s+de\s+pago|sin\s+pagar|no\s+pagad[oa]|operacion\s+denegada|transaccion\s+rechazada|(?:pago|cobro)\s+(?:por|mediante|con|en)\s+(?:tarjeta|visa|mastercard|efectivo|cash|transferencia|bizum|domiciliacion|recibo)\s+(?:pendiente|sin\s+confirmar)|(?:bizum|transferencia)\s+(?:pendiente|no\s+realizad[ao]))\b/.test(normalized)) continue;
    if (/\b(?:formas?|medios?|metodos?)\s+de\s+pago\s+(?:aceptad[oa]s?|admitid[oa]s?|disponibles?)\b|\b(?:se\s+)?(?:acepta|aceptan|aceptamos|admite|admiten)\s+(?:pagos?\s+(?:en|con)\s+)?(?:tarjeta|visa|mastercard|efectivo|cash|transferencia|bizum)\b/.test(normalized)) continue;
    // Prefer the method following an explicit payment label, rather than a
    // preceding mention of a loyalty card or an available payment method.
    const paymentLabel = /\b(?:forma|medio|metodo)\s+de\s+pago\s*[:=-]?\s*|\bpago\s*[:=-]\s*|\bpago\s+(?:con|mediante|en|por)\s+/.exec(normalized);
    const paymentText = paymentLabel ? normalized.slice(paymentLabel.index + paymentLabel[0].length) : normalized;
    // A loyalty / points / membership card identifies a customer, not how
    // this purchase was paid. An unlabeled loyalty row can otherwise win
    // over a later cash tender row simply because it appears first.
    // Keep an explicit payment label on the same OCR line authoritative.
    const loyaltyCard = /\btarjeta\s+(?:de\s+)?(?:fidelidad|puntos|cliente|socio|club)\b|\b(?:puntos|saldo)\s+(?:de\s+)?(?:la\s+)?tarjeta\b/.test(normalized);
    const explicitTender = paymentLabel !== null || /\btotal\s+tarjeta\b/.test(normalized);
    if (loyaltyCard && !explicitTender) continue;
    const rejectedCard = /\b(?:tarjeta|visa|mastercard)\s+(?:rechazad[ao]s?|denegad[ao]s?)\b|\b(?:no\s+se\s+acepta|sin)\s+(?:pagos?\s+(?:en|con)\s+)?(?:tarjeta|visa|mastercard)\b/.test(normalized);
    const rejectedCash = /\b(?:no\s+se\s+acepta|sin)\s+(?:pago\s+en\s+)?efectivo\b/.test(normalized);
    const rejectedDebit = /\b(?:no|sin)\s+domiciliad[oa]s?\b/.test(normalized);
    const hit = keywords.find((entry) => entry.pattern.test(paymentText)
      && !(rejectedCard && entry.value === "Tarjeta")
      && !(rejectedCash && entry.value === "Efectivo")
      && !(rejectedDebit && entry.value === "Domiciliación"));
    if (!hit) continue;
    const field = fieldFrom(item, item.line.text.trim(), hit.value);
    const explicitlyLabelled = paymentLabel !== null;
    if (explicitlyLabelled) return field;
    // A merchant may mention a card or direct debit outside the payment
    // summary. Preserve the first candidate, but do not override a later
    // explicitly labelled payment line or certify an unlabelled direct debit.
    unlabelled ??= hit.value === "Domiciliación" ? fieldRequiringReview(field) : field;
  }
  return unlabelled ?? emptyField<string>();
}

function extractIssuer(lines: LocatedLine[]) {
  // Explicit issuer labels take precedence over a recipient's "Razón social".
  const explicit = findLabelled(lines, [
    /^(?:emisor|comercio|proveedor|vendedor|establecimiento|razon social\s+(?:del?\s+)?(?:emisor|proveedor|vendedor))\s*[:\-]\s*\S/,
  ]);
  if (explicit) {
    const raw = valueAfterLabel(explicit.line.text);
    if (raw && (raw.match(/\p{L}/gu) ?? []).length >= 2) return fieldFrom(explicit, raw, raw);
  }

  // A label explicitly owned by the recipient is NOT an issuer candidate,
  // even at doubtful confidence. Generic "Razón social" stays reviewable.
  let inRecipientSection = false;
  let lastPage = -1;
  const ambiguous = lines.find((item) => {
    if (item.pageNumber !== lastPage) {
      lastPage = item.pageNumber;
      inRecipientSection = false;
    }
    const normalized = normalizeToken(item.line.text);
    // Owner context may be on an earlier OCR row, not in the "Razón
    // social" row itself. Recipient legal names are never merchant leads.
    if (/^(?:(?:datos|informacion)\s+(?:de|del|de la)\s+)?(?:cliente|destinatario|receptor|comprador)\b/.test(normalized)) {
      inRecipientSection = true;
    } else if (/^(?:datos?\s+(?:del?\s+)?(?:emisor|proveedor|comercio|vendedor)|emisor|proveedor|vendedor|comercio)\b/.test(normalized)) {
      inRecipientSection = false;
    }
    return !inRecipientSection && /\brazon social\b/.test(normalized)
      && !/\b(?:cliente|destinatario|receptor|comprador)\b/.test(normalized);
  });
  if (ambiguous) {
    // A standalone "Razón social" header is NOT a business name. The
    // generic valueAfterLabel fallback would otherwise produce "social".
    const raw = ambiguous.line.text.trim()
      .replace(/^raz[oó]n\s+social\s*[:\-–—]?\s*/i, "").trim();
    if (raw && (raw.match(/\p{L}/gu) ?? []).length >= 2
      && !/^(?:de(?:l| la)\s+)?(?:emisor|proveedor|vendedor|cliente|destinatario)$/i.test(raw)) {
      return fieldRequiringReview(fieldFrom(ambiguous, raw, raw));
    }
  }

  const recipientNames = new Set(lines.flatMap((item) => {
    const match = item.line.text.match(/\b(?:cliente|destinatario|receptor|comprador|nombre|titular(?:\s+del\s+contrato)?)\s*:\s*(.+)/i);
    if (!match) return [];
    return [normalizeToken(match[1].replace(/\b(?:nif|cif|direccion)\s*:.*/i, "").trim())];
  }));
  const recipientLayout = lines.some((item) => /^(?:datos\s+del\s+cliente|facturacion\s*:)|\b(?:cliente|nombre|titular)\s*:/.test(normalizeToken(item.line.text)));
  let recipientBlock = false;
  const header = lines.filter((item) => {
    const normalized = normalizeToken(item.line.text);
    if (/^(?:(?:datos|informacion)\s+(?:de|del|de la)\s+)?(?:cliente|destinatario|receptor|comprador|titular)\b|^razon\s+social\s+(?:del|de la)\s+(?:cliente|destinatario|receptor|comprador)\b/.test(normalized)) recipientBlock = true;
    else if (/^(?:datos?\s+(?:(?:del?|de la)\s+)?(?:emisor|proveedor|comercio|vendedor)|emisor|proveedor|vendedor|comercio)\b/.test(normalized)) recipientBlock = false;
    return item.pageNumber === 1 && item.line.box.y <= 0.3
      && item.line.box.height <= 0.1 && !recipientBlock;
  });
  // A legal business name in the header is stronger evidence than the
  // first arbitrary line. It still requires review without seller ownership.
  const legalName = header.find((item) => {
    const text = item.line.text.trim();
    const name = text.replace(/\s+(?:cif|nif)\s*[:\-]?.*$/i, "").trim();
    return /\b(?:s\.?\s*a\.?(?:\s*u\.?)?|s\.?\s*l\.?(?:\s*u\.?)?)(?=\s|$|[,;])/i.test(text)
      && !/^(?:cliente|destinatario|receptor|comprador|titular)\b/.test(normalizeToken(text))
      && !recipientNames.has(normalizeToken(name));
  });
  if (legalName) {
    const text = legalName.line.text.trim().replace(/^raz[oó]n\s+social\s*[:\-–—]?\s*/i, "")
      .replace(/\s+(?:(?:cif|nif)\s*[:\-]?|fecha(?:\s+de)?\s+\w+\s*:).*$/i, "")
      .replace(/\s+[A-Z]-?\d{7}[0-9A-Z](?:\s.*)?$/i, "").trim();
    return fieldRequiringReview(fieldFrom(legalName, text, text));
  }
  for (const item of header.slice(0, 16)) {
    const text = item.line.text.trim();
    const normalized = normalizeToken(text);
    // A recipient/customer header can span multiple OCR lines. Never promote
    // its unlabelled name to a supposed merchant just because it is printed
    // near the top with excellent character recognition.
    if (/^(?:(?:(?:datos|informacion)\s+(?:de|del|de la)\s+)?(?:cliente|destinatario|receptor|comprador|facturar\s+a|factura\s+a)|razon social\s+(?:(?:del|de la)\s+)?(?:cliente|destinatario|receptor|comprador))\b/.test(normalized)) break;
    // If a labelled legal-name row reaches this low-confidence fallback,
    // never render its "Razón social:" prefix as part of the merchant name.
    // Recipient-owned labels were stopped above; ownership remains doubtful.
    if (/^razon\s+social\b/.test(normalized)) {
      const name = text.replace(/^raz[oó]n\s+social\s*[:\-–—]?\s*/i, "").trim();
      if (name && (name.match(/\p{L}/gu) ?? []).length >= 2
        && !/^(?:de(?:l| la)\s+)?(?:emisor|proveedor|vendedor|cliente|destinatario)$/i.test(name)) {
        return fieldRequiringReview(fieldFrom(item, name, name));
      }
      continue;
    }
    // Headings with no following value are not evidence of the business
    // name, even when OCR confidence is very high. Continue looking for a
    // real name under the heading instead of displaying "DATOS DEL EMISOR"
    // as if it were a merchant.
    if (/^(?:datos?|informacion)\s+(?:(?:fiscales?|generales?)|(?:(?:del?|de\s+la)\s+)?(?:emisor|proveedor|vendedor|comercio))\s*[:\-]?$/.test(normalized)
      || /^(?:emisor|proveedor|vendedor|comercio|establecimiento)\s*[:\-]?$/.test(normalized)) {
      continue;
    }
    if (!text || /[\u0000-\u001f\u007f]/.test(text) || recipientNames.has(normalized)
      || /^(?:c\/|cl\.?\s|calle\s|avda\.?\s)/.test(normalized)
      || /^(?:bloque|piso|puerta|localidad|provincia)\b/.test(normalized)
      || /^(?:pedido|referencia|ref\.?\s+domiciliacion|lugar\s+de\s+emision)\b/.test(normalized)
      || /^(?:pag(?:ina)?\.?\s*\d|n[º°o]?\s*(?:de\s+)?(?:cuenta|pedido|contrato|recibo)|periodo|direccion|telefono|codigo\s+postal)\b/.test(normalized)
      || /\b(factura|ticket|fecha|nif|cif|total|base|iva|periodo\s+de\s+consumo)\b/.test(normalized) || TAX_ACRONYM.test(normalized)) continue;
    if (recipientLayout) continue;
    if ((text.match(/\p{L}/gu) ?? []).length >= 3 && !/^\d/.test(text)) {
      return fieldRequiringReview(fieldFrom(item, text, text));
    }
  }
  return emptyField<string>();
}

function extractTaxLines(lines: LocatedLine[]): OcrTaxLine[] {
  const result: OcrTaxLine[] = [];
  for (const [index, item] of lines.entries()) {
    const searchable = item.line.text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (!TAX_ACRONYM.test(searchable) && !/\bimpuestos?\b/.test(searchable)) continue;

    // Retail fiscal tables put the rate, base, quota and total in fixed
    // columns. A rate printed as "4,00" has no percent sign on its row;
    // treating it as an IVA amount corrupts the invoice reconciliation.
    if (isRetailVatTableHeader(item.line.text)) {
      for (let offset = 1; offset <= 8 && index + offset < lines.length; offset += 1) {
        const candidate = lines[index + offset];
        if (candidate.pageNumber !== item.pageNumber) break;
        const cells = retailVatCells(candidate.line.text);
        if (!cells) break;
        result.push({
          ...cells,
          confidence: Math.min(item.line.confidence, candidate.line.confidence),
          trust: "doubtful",
          evidence: [evidenceOf(item), evidenceOf(candidate)],
        });
      }
      continue;
    }
    if (retailVatHeaderForRow(lines, index)) continue;

    // A real-world invoice layout uses "I.V.A / I.G.I.C. (Base Imponible:
    // 100,00) 21% EUR 21,00". The two explicit monetary values straddle
    // an identified tax *percentage*. A TOTAL or payment label appearing
    // before the second value invalidates this inference. Keep it doubtful.
    const vatIgicPair = /\bi\.?v\.?a\b\.?\s*\/\s*\bi\.?g\.?i\.?c\b\.?/.test(searchable);
    const baseHeader = /\bbase\s+imponible\b/.exec(searchable);
    const taxRate = COMPLETE_TAX_RATE.exec(searchable);
    if (vatIgicPair && baseHeader && taxRate) {
      const amounts = exactFinancialAmountMatches(item.line.text).flatMap((match) => {
        const cents = parseMoneyCents(match[0]);
        return cents === null ? [] : [{ index: match.index, value: cents }];
      });
      const rateStart = taxRate.index;
      const rateEnd = rateStart + taxRate[0].length;
      const second = amounts[1];
      const forbidden = second
        ? /\b(?:total|efectivo|tarjeta|cambio|devolucion|recibido|entregado)\b/.test(searchable.slice(rateEnd, second.index))
        : true;
      if (amounts.length === 2 && second
        && amounts[0].index >= baseHeader.index + baseHeader[0].length
        && amounts[0].index < rateStart
        && second.index >= rateEnd
        && !forbidden) {
        result.push({
          ratePercent: Number(taxRate[1].replace(",", ".")),
          baseCents: amounts[0].value,
          taxCents: second.value,
          confidence: item.line.confidence,
          trust: "doubtful",
          evidence: [evidenceOf(item)],
        });
        continue;
      }
    }

    // In real retail receipts, "IVA BASE IMPONIBLE (€) CUOTA (€)" is a
    // column header. The next rows carry "10% 30,00 3,00" without an IVA
    // label, so inspecting only the header loses the actual tax lines.
    // Interpret at most four immediately adjacent rows on the same page.
    // Text order suggests column ownership; always require human review.
    if (TAX_ACRONYM.test(searchable)
      && /\bbase\s+imponible\b/.test(searchable)
      && /\bcuota\b/.test(searchable)) {
      const tableRows: OcrTaxLine[] = [];
      for (let offset = 1; offset <= 4 && index + offset < lines.length; offset += 1) {
        const candidate = lines[index + offset];
        if (candidate.pageNumber !== item.pageNumber) break;
        const row = candidate.line.text.match(/^\s*(\d{1,2}(?:[,.]\d{1,2})?)\s*%\s+(.+)$/);
        if (!row) break;
        const cells = row[2].trim().split(/\s+/);
        const validMoneyCell = (cell: string) => {
          const matches = exactFinancialAmountMatches(cell);
          return matches.length === 1 && matches[0][0] === cell;
        };
        if (cells.length !== 2 || !cells.every(validMoneyCell)) break;
        const baseCents = parseMoneyCents(cells[0]);
        const taxCents = parseMoneyCents(cells[1]);
        if (baseCents === null || taxCents === null) break;
        tableRows.push({
          ratePercent: Number(row[1].replace(",", ".")),
          baseCents,
          taxCents,
          confidence: Math.min(item.line.confidence, candidate.line.confidence),
          trust: "doubtful",
          evidence: [evidenceOf(item), evidenceOf(candidate)],
        });
      }
      if (tableRows.length) {
        result.push(...tableRows);
        continue;
      }
    }

    const labels = [...searchable.matchAll(/\b(?:base(?:\s+imponible)?|subtotal|i\.?v\.?a|i\.?g\.?i\.?c|impuestos?|cuota(?:\s+(?:del?\s+)?(?:i\.?v\.?a|i\.?g\.?i\.?c|impuestos?))?|importe\s+total|total(?:\s+a\s+pagar)?|a\s+pagar|efectivo|tarjeta|cambio)\b/g)]
      .map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
    const amounts = exactFinancialAmountMatches(item.line.text)
      .flatMap((match) => {
        const value = parseMoneyCents(match[0]);
        return value === null ? [] : [{ start: match.index, value }];
      });
    const taxLabel = labels.find((label) => TAX_ACRONYM.test(label.text) || /^impuestos?$/.test(label.text));
    const baseLabel = labels.find((label) => /^(?:base|subtotal)\b/.test(label.text));
    const quotaLabel = labels.find((label) => /^cuota\b/.test(label.text));
    const amountAfter = (label: (typeof labels)[number] | undefined) => {
      if (!label) return [] as typeof amounts;
      const next = labels.find((other) => other.start >= label.end);
      return amounts.filter((amount) => amount.start >= label.end && (!next || amount.start < next.start));
    };
    const taxAmounts = amountAfter(taxLabel);
    const baseAmounts = amountAfter(baseLabel);
    const quotaAmounts = amountAfter(quotaLabel);
    const rateText = taxLabel
      ? searchable.slice(taxLabel.end, labels.find((label) => label.start >= taxLabel.end)?.start)
      : "";
    const rate = rateText.match(COMPLETE_TAX_RATE);

    // Each amount belongs to the closest explicit field label, not to the
    // last figure on the OCR row (which might be TOTAL, cash or change).
    // Two unlabelled amounts following IVA may be base + tax; keep both
    // candidates but mark the attribution as uncertain.
    const ambiguousUnlabelled = taxAmounts.length > 1 && baseAmounts.length === 0 && quotaAmounts.length === 0;
    const baseCents = baseAmounts[0]?.value ?? (ambiguousUnlabelled ? taxAmounts[0].value : null);
    const taxCents = quotaAmounts[0]?.value
      ?? (ambiguousUnlabelled ? taxAmounts.at(-1)!.value : taxAmounts[0]?.value ?? null);
    const uncertain = ambiguousUnlabelled || taxAmounts.length > 1 || baseAmounts.length > 1
      || quotaAmounts.length > 1 || (quotaAmounts.length > 0 && taxAmounts.length > 0
        && quotaAmounts[0].value !== taxAmounts[0].value);
    const ratePercent = rate ? Number(rate[1].replace(",", ".")) : null;
    // The percentage, base and quota are independent financial evidence.
    // Accurate OCR characters do not make a mathematically impossible VAT row reliable.
    const arithmeticMismatch = ratePercent !== null && baseCents !== null && taxCents !== null
      && (!Number.isSafeInteger(Math.round(baseCents * ratePercent / 100))
        || Math.abs(Math.round(baseCents * ratePercent / 100) - taxCents) > 1);
    const confidence = item.line.confidence;
    const detected = taxCents !== null || Boolean(rate);
    result.push({
      ratePercent,
      baseCents,
      taxCents,
      confidence,
      trust: !detected ? "not_detected"
        : taxCents === null || uncertain || arithmeticMismatch ? "doubtful"
        : trustFor(confidence, true),
      evidence: [evidenceOf(item)],
    });
  }
  return result;
}

type ProductColumn = {
  center: number;
  role: "description" | "quantity" | "unit" | "total" | "other";
};

function productColumns(line: OcrLine): ProductColumn[] | null {
  if (line.words.length < 3) return null;
  const columns: ProductColumn[] = line.words.map((word) => {
    const name = normalizeToken(word.text).trim();
    const role: ProductColumn["role"] = /^(?:descripcion|concepto|articulos?|productos?|modelo)$/.test(name) ? "description"
      : /^(?:cantidad|unidades|uds?\.?|#)$/.test(name) ? "quantity"
      : /^(?:p\.?\s*unit(?:ario)?|precio\s+(?:neto|unitario))$/.test(name) ? "unit"
      : /^(?:importe(?:\s+total)?|total\s+pvp|total)$/.test(name) ? "total" : "other";
    return { center: word.box.x + word.box.width / 2, role };
  });
  // Some invoices have both a unit total and the row total. Only the
  // explicitly named amount column owns the payable line amount.
  const explicitTotal = line.words.findIndex((word) => /^(?:importe\s+total|total\s+pvp)$/.test(normalizeToken(word.text).trim()));
  if (explicitTotal >= 0) columns.forEach((column, index) => {
    if (column.role === "total" && index !== explicitTotal) column.role = "other";
  });
  if (columns.filter((column) => column.role === "description").length !== 1
    || columns.filter((column) => column.role === "total").length !== 1) return null;
  return columns.sort((a, b) => a.center - b.center);
}

function productFromColumns(item: LocatedLine, columns: ProductColumn[]): OcrDocumentLineItem | null {
  const cells = new Map<ProductColumn["role"], string[]>();
  for (const word of item.line.words) {
    const numeric = /^[\d\s,.\-−–€]+$/.test(word.text.trim());
    const position = word.box.x + word.box.width * (numeric ? 0.5 : 0.05);
    const column = columns.reduce((nearest, candidate) =>
      Math.abs(candidate.center - position) < Math.abs(nearest.center - position) ? candidate : nearest);
    const cell = cells.get(column.role) ?? [];
    cell.push(word.text.trim());
    cells.set(column.role, cell);
  }
  let description = (cells.get("description") ?? []).join(" ").trim();
  if ((description.match(/\p{L}/gu) ?? []).length < 2) return null;
  const money = (role: "unit" | "total") => {
    const matches = (cells.get(role) ?? []).flatMap((text) => exactFinancialAmountMatches(text));
    return matches.length === 1 ? parseMoneyCents(matches[0][0]) : null;
  };
  const quantityText = (cells.get("quantity") ?? []).join(" ");
  let quantity = /^\d{1,6}(?:[,.]\d{1,3})?$/.test(quantityText)
    ? Number(quantityText.replace(",", ".")) : null;
  if (!columns.some((column) => column.role === "quantity")) {
    const prefix = /^(\d{1,6})\s+(?=\p{L})/u.exec(description);
    if (prefix) {
      quantity = Number(prefix[1]);
      description = description.slice(prefix[0].length).trim();
    }
  }
  const unitPriceCents = money("unit");
  const totalCents = money("total");
  if (quantity === null && unitPriceCents === null && totalCents === null) return null;
  const mismatch = quantity !== null && unitPriceCents !== null && totalCents !== null
    && Math.abs(Math.round(quantity * unitPriceCents) - totalCents) > 1;
  return {
    description, quantity, unitPriceCents, totalCents,
    confidence: item.line.confidence,
    trust: totalCents === null || mismatch ? "doubtful" : trustFor(item.line.confidence, true),
    evidence: [evidenceOf(item)],
  };
}

function extractLineItems(lines: LocatedLine[]): OcrDocumentLineItem[] {
  const result: OcrDocumentLineItem[] = [];
  // Compute product-table page membership only once; long multi-page bills
  // must not scan all OCR lines again for each potential product.
  const headers = new Map<LocatedLine, ProductColumn[] | null>();
  for (const item of lines) {
    const columns = productColumns(item.line);
    const text = normalizeToken(item.line.text);
    if (columns || (/^(?:descripcion|concepto|articulos?|productos?)\b/.test(text)
      && /\b(?:importe|total|precio|p\.?\s*unit)\b/.test(text))) headers.set(item, columns);
  }
  const headerPages = new Set([...headers.keys()].map((item) => item.pageNumber));
  // A receipt header explicitly scopes product rows. Stop before totals,
  // payment methods and tax tables instead of manufacturing purchases from
  // legal paragraphs or VAT summary rows elsewhere in the document.
  let tablePage = -1;
  let tableOpen = false;
  let columns: ProductColumn[] | null = null;
  for (const item of lines) {
    const normalized = normalizeToken(item.line.text);
    if (tablePage !== item.pageNumber) {
      tablePage = item.pageNumber;
      tableOpen = false;
      columns = null;
    }
    if (headers.has(item)) {
      tableOpen = true;
      columns = headers.get(item) ?? null;
      continue;
    }
    if (tableOpen && /^(?:total|subtotal|importe\s+bruto|base\s+imponible|efectivo|tarjeta|forma\s+de\s+pago|tipo\s+%?\s*impuesto|iva|igic)\b/.test(normalized)) {
      tableOpen = false;
      columns = null;
    }
    // Retain unstructured candidates for human review, but a table header
    // on this page means figures outside its product rows are not items.
    if (headerPages.has(item.pageNumber) && !tableOpen) continue;
    if (columns) {
      const product = productFromColumns(item, columns);
      if (product) result.push(product);
      continue;
    }
    const text = item.line.text.trim();
    if (!text || /\b(total|subtotal|base|impuesto|cambio|efectivo|tarjeta|a pagar)\b/.test(normalized) || TAX_ACRONYM.test(normalized)) continue;
    const moneyMatches = exactFinancialAmountMatches(text).map((match) => match[0]);
    if (!moneyMatches.length) continue;
    const lastMoney = moneyMatches.at(-1) ?? null;
    const totalCents = lastMoney ? parseMoneyCents(lastMoney) : null;
    const firstMoneyIndex = lastMoney ? text.lastIndexOf(lastMoney) : -1;
    const beforeTotal = firstMoneyIndex > 0 ? text.slice(0, firstMoneyIndex).replace(/\s+/g, " ").trim() : "";
    const unitRaw = moneyMatches.length >= 2 ? moneyMatches[moneyMatches.length - 2] : null;
    const unitPriceCents = unitRaw ? parseMoneyCents(unitRaw) : null;
    // In a confirmed product table, price/quantity each have their own
    // fields. Do not repeat them in the product description shown to users.
    const withoutUnit = tableOpen && unitRaw && beforeTotal.endsWith(unitRaw)
      ? beforeTotal.slice(0, -unitRaw.length).trim()
      : beforeTotal;
    const quantityMatch = tableOpen ? /^\s*(\d{1,3})\s+(?=\p{L})/u.exec(withoutUnit) : null;
    const quantity = quantityMatch ? Number(quantityMatch[1]) : null;
    const description = quantityMatch ? withoutUnit.slice(quantityMatch[0].length).trim() : withoutUnit;
    if ((description.match(/\p{L}/gu) ?? []).length < 2 || totalCents === null) continue;
    const confidence = item.line.confidence;
    // A confident character recognition is not proof that price x quantity
    // equals the line total. Keep discordant rows editable, but doubtful.
    const arithmeticConflict = tableOpen && quantity !== null && unitPriceCents !== null
      && Math.abs(quantity * unitPriceCents - totalCents) > 1;
    result.push({
      description,
      quantity,
      unitPriceCents,
      totalCents,
      confidence,
      trust: arithmeticConflict || !tableOpen || moneyMatches.length > 2 ? "doubtful" : trustFor(confidence, true),
      evidence: [evidenceOf(item)],
    });
  }
  return result;
}

export function interpretDocumentOcrFinancially(result: DocumentOcrResult): DocumentOcrFinancialInterpretation {
  const located: LocatedLine[] = result.pages.flatMap((page) => page.lines.map((line) => ({ pageNumber: page.pageNumber, line })));
  let taxBaseCents = extractMoneyField(located, [/\bbase imponible\b/, /^base\b/, /\bsubtotal\b/], { ownLabelOnly: true, skipShippingBase: true });
  let taxesCents = extractMoneyField(located, [TAX_ACRONYM, /\bimpuestos?\b/], { ownLabelOnly: true, skipElectricityDuty: true, preferVatQuota: true });
  // Spanish utilities and telecom invoices often use "IMPORTE FACTURA"
  // rather than a standalone TOTAL. Preserve contradictory candidates for
  // human review instead of silently treating the invoice amount as absent.
  let totalCents = extractMoneyField(located, [
    /\btotal\b/,
    /\bimporte\s+total\b/,
    /\bimporte(?:\s+de\s+la)?\s+factura\b/,
    /\ba pagar\b/,
  ], {
    exclude: /\btotal\s+(?:de\s+)?(?:descuentos?|impuestos?|iva|ahorro|unidades|articulos|productos)\b/,
    prefer: /\b(?:total\s+a\s+pagar|total\s+importe\s+factura|importe\s+total|importe(?:\s+de\s+la)?\s+factura|a\s+pagar|total\s+factura|total\s+final)\b/,
    adjacentAmount: true,
    skipTaxTableFooter: true,
    skipExplanatoryParentheses: true,
  });
  const warnings: string[] = [];
  const taxLines = extractTaxLines(located);
  const rateContradiction = taxLines.some((row) => row.ratePercent !== null
    && row.baseCents !== null && row.taxCents !== null
    && (!Number.isSafeInteger(Math.round(row.baseCents * row.ratePercent / 100))
      || Math.abs(Math.round(row.baseCents * row.ratePercent / 100) - row.taxCents) > 1));
  if (rateContradiction) {
    warnings.push("tax_rate_arithmetic_mismatch");
    taxBaseCents = fieldRequiringReview(taxBaseCents);
    taxesCents = fieldRequiringReview(taxesCents);
  }
  // Derive sums from an explicitly identified tax table ONLY if every tax
  // rate reconciles with its row and all rows reconcile to the printed total.
  // Derived sums are never automatic OCR facts: they remain "doubtful".
  if (taxBaseCents.value === null && taxesCents.value === null
    && totalCents.value !== null && totalCents.trust === "reliable") {
    const tableRows = taxLines.filter((row) => {
      const header = row.evidence[0];
      return row.evidence.length === 2 && header !== undefined
        && (/\bbase\s+imponible\b/.test(normalizeToken(header.rawText))
          || isRetailVatTableHeader(header.rawText))
        && /\bcuota\b/.test(normalizeToken(header.rawText));
    });
    const headers = new Set(tableRows.map((row) =>
      row.evidence[0].pageNumber + ":" + row.evidence[0].lineId));
    const valid = tableRows.length > 0 && headers.size === 1
      && tableRows.every((row) => row.ratePercent !== null && row.baseCents !== null
        && row.taxCents !== null && Number.isSafeInteger(row.baseCents)
        && Number.isSafeInteger(row.taxCents)
        && Math.abs(Math.round(row.baseCents * row.ratePercent / 100) - row.taxCents) <= 1);
    if (valid) {
      const base = tableRows.reduce((sum, row) => sum + (row.baseCents ?? 0), 0);
      const taxes = tableRows.reduce((sum, row) => sum + (row.taxCents ?? 0), 0);
      if (Number.isSafeInteger(base) && Number.isSafeInteger(taxes)
        && base + taxes === totalCents.value) {
        const evidence = tableRows.flatMap((row) => row.evidence);
        const confidence = tableRows.reduce<number | null>((minimum, row) =>
          row.confidence === null ? minimum : minimum === null ? row.confidence : Math.min(minimum, row.confidence), null);
        taxBaseCents = { value: base, rawValue: null, confidence, trust: "doubtful", evidence };
        taxesCents = { value: taxes, rawValue: null, confidence, trust: "doubtful", evidence };
      }
    }
  }

  if (taxBaseCents.value !== null && taxesCents.value !== null && totalCents.value !== null) {
    const delta = Math.abs(taxBaseCents.value + taxesCents.value - totalCents.value);
    if (delta > 1) {
      warnings.push("base_plus_tax_mismatch");
      // An OCR match on each individual number does not resolve a financial
      // contradiction. Preserve all three raw values, but require review.
      taxBaseCents = fieldRequiringReview(taxBaseCents);
      taxesCents = fieldRequiringReview(taxesCents);
      totalCents = fieldRequiringReview(totalCents);
    }
  }
  if (result.status === "empty") warnings.push("ocr_empty");
  if (result.status === "needs_review") warnings.push("ocr_needs_review");

  // A certain-looking hour cannot be certified on a document whose issue
  // date is contradictory or only inferred. Keep the OCR evidence for review.
  const date = extractDate(located);
  const extractedTime = extractTime(located);
  const time = date.value !== null && date.trust !== "reliable"
    ? fieldRequiringReview(extractedTime) : extractedTime;

  return {
    interpretationVersion: 1,
    issuer: extractIssuer(located),
    taxId: extractTaxId(located),
    date,
    time,
    documentNumber: extractDocumentNumber(located),
    period: extractPeriod(located),
    taxBaseCents,
    taxesCents,
    totalCents,
    paymentMethod: extractPaymentMethod(located),
    taxLines,
    lines: extractLineItems(located),
    warnings: [...new Set(warnings)],
  };
}

export const OCR_FIELD_TRUST_LABELS: Record<OcrFieldTrust, string> = {
  reliable: "Fiable",
  doubtful: "Dudoso",
  not_detected: "No detectado",
};

export function ocrTrustFromConfidence(confidence: number | null, detected = true): OcrFieldTrust {
  return trustFor(confidence, detected);
}

export const DOCUMENT_OCR_INTERPRETATION_THRESHOLDS = {
  reliable: RELIABLE_CONFIDENCE,
} as const;
