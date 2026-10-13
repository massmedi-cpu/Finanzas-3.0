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
  const cleaned = raw
    .replace(/[\u2212\u2013]/g, "-")
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;

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
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

// OCR can mix prices (12,34) with weights, ratios and incomplete numeric
// tokens (1,234). Never interpret the prefix "1,23" of "1,234" as money.
// Preserve punctuation at the end of a sentence, but reject continuations
// that belong to the same numeric token.
const FINANCIAL_AMOUNT_TOKEN = /[-\u2212\u2013]?\d{1,3}(?:\.\d{3})*(?:,\d{2})|[-\u2212\u2013]?\d+(?:[,.]\d{2})/g;
// An integer is money only when the OCR line explicitly prints € after it.
// A bare 21, 100 or 1.234 could instead be a rate, quantity or document ID.
const INTEGER_EURO_TOKEN = /[-\u2212\u2013]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?=\s*€)/g;
// Some receipts place the currency *before* a whole-euro amount: TOTAL € 50
// or TOTAL EUR 1.234. Only an explicit currency token permits integer euros;
// the boundary checks below reject accidental prefixes of decimal/weight data.
const PREFIXED_EURO_INTEGER_TOKEN = /(?:€|\bEUR\b)\s*[-\u2212\u2013]?(?:\d{1,3}(?:\.\d{3})+|\d+)/gi;

function exactFinancialAmountMatches(text: string) {
  return [...text.matchAll(FINANCIAL_AMOUNT_TOKEN), ...text.matchAll(INTEGER_EURO_TOKEN), ...text.matchAll(PREFIXED_EURO_INTEGER_TOKEN)]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .filter((match) => {
    const start = match.index;
    const end = start + match[0].length;
    const previous = text[start - 1] ?? "";
    const previousPrevious = text[start - 2] ?? "";
    const next = text[end] ?? "";
    const nextNext = text[end + 1] ?? "";
    const startsInsideNumber = /\d/.test(previous)
      || (/[.,]/.test(previous) && /\d/.test(previousPrevious));
    const endsInsideNumber = /\d/.test(next)
      || (/[.,]/.test(next) && /\d/.test(nextNext));
    // Percentages such as "IVA 21,00%" are rates, never euro values.
    const isPercentage = /^\s*%/.test(text.slice(end));
    return !startsInsideNumber && !endsInsideNumber && !isPercentage;
  });
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

function extractMoneyField(
  lines: LocatedLine[],
  labels: RegExp[],
  options: { exclude?: RegExp; prefer?: RegExp; adjacentAmount?: boolean; ownLabelOnly?: boolean; skipTaxTableFooter?: boolean } = {},
) {
  const candidates = lines.flatMap((item, index) => {
    const normalized = normalizeToken(item.line.text);
    if (!labels.some((label) => label.test(normalized)) || options.exclude?.test(normalized)) return [];
    if (options.skipTaxTableFooter && isTaxTableFooter(lines, index)) return [];

    // Do not treat the last number in a whole OCR row as its labelled amount.
    // Receipts can place TOTAL, cash received and CHANGE on the same row.
    const searchable = item.line.text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const labelsFound = labels.flatMap((label) => {
      const match = label.exec(searchable);
      return match ? [{ index: match.index, end: match.index + match[0].length }] : [];
    });
    const preferred = options.prefer?.exec(searchable) ?? null;
    const anchorEnd = preferred
      ? preferred.index + preferred[0].length
      : labelsFound.reduce((earliest, found) => Math.min(earliest, found.end), Number.POSITIVE_INFINITY);
    const monies = exactFinancialAmountMatches(item.line.text)
      .flatMap((match) => {
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
    let chosen = following[0] ?? (options.ownLabelOnly ? undefined : monies.at(-1));
    let adjacent: LocatedLine | null = null;
    if (!chosen && options.adjacentAmount) {
      // Layout engines often break "TOTAL A PAGAR" and "23,45 €" into
      // distinct OCR lines. Recover only a *bare* label with a single
      // standalone money token on the next line of the same page. This is
      // evidence for review, not automatic certification.
      const bareTotal = /^(?:total(?: a pagar| importe factura| factura| final)?|importe(?: de la)? factura|importe total|a pagar)\s*[:=-]?\s*$/.test(normalized);
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
      needsReview: adjacent !== null || following.length === 0 || paymentBeforeAmount || conflictingAmounts,
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
  const writtenPattern = /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})\b/i;
  const namedMonth: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
    octubre: 10, noviembre: 11, diciembre: 12,
  };
  // Billing dates, contract expiry and legal conditions are not evidence of
  // a receipt purchase or invoice issue date.
  const unrelated = /\b(?:nacimiento|vencimiento|caducidad|vigencia|registro|periodo|hasta|desde|legal)\b/;
  const directLabel = /^(?:fecha(?:\s+de\s+(?:emision|expedicion|compra|factura))?|fecha\s*(?:\/|y)\s*hora|emitid[oa]\s+el)\s*[:\-]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/;
  const explicitWritten = /\b(?:emitid[oa]\s+el|fecha(?:\s+de\s+(?:emision|expedicion|compra|factura))?\s*[:\-]?)\s*\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+\d{4}\b/;
  const embeddedNumericIssueDate = /\bemitid[oa]\s+el\s+\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/;
  let unlabelled: OcrInterpretedField<string> | null = null;
  let issueDate: OcrInterpretedField<string> | null = null;
  let contradictoryIssueDates = false;

  for (const item of lines) {
    const normalized = normalizeToken(item.line.text);
    // A separately printed expiry or billing-period date must not erase an
    // explicitly labelled issue/purchase timestamp on the SAME OCR line.
    if (unrelated.test(normalized) && !directLabel.test(normalized)
      && !embeddedNumericIssueDate.test(normalized) && !explicitWritten.test(normalized)) continue;
    // Match the date FOLLOWING its issue label, not an unrelated number
    // earlier on the same invoice row (e.g. order date before "emitida el").
    const labelledWritten = normalized.match(explicitWritten)?.[0].match(writtenPattern) ?? null;
    const labelledNumeric = (normalized.match(directLabel)?.[0]
      ?? normalized.match(embeddedNumericIssueDate)?.[0])?.match(pattern) ?? null;
    const numeric = labelledNumeric ?? (labelledWritten ? null : item.line.text.match(pattern));
    const written = labelledWritten ?? (numeric ? null : item.line.text.match(writtenPattern));
    if (!numeric && !written) continue;
    const day = Number(numeric?.[1] ?? written?.[1]);
    const month = numeric ? Number(numeric[2]) : namedMonth[(written?.[2] ?? "").toLowerCase()];
    const sourceYear = numeric?.[3] ?? written?.[3] ?? "";
    const year = Number(sourceYear.length === 2 ? "20" + sourceYear : sourceYear);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) continue;
    const iso = String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const field = fieldFrom(item, numeric?.[0] ?? written?.[0] ?? "", iso);
    if (labelledNumeric || labelledWritten) {
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

function extractTime(lines: LocatedLine[]) {
  const pattern = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/;
  const unrelated = /\b(?:horario|apertura|cierre|atencion\s+al\s+publico|laborables|oficinas|vencimiento|caducidad|vigencia|plazo\s+de\s+pago)\b/;
  const explicitTime = /^(?:hora(?:\s+(?:de\s+)?(?:compra|emision|ticket))?|fecha\s+y\s+hora)\s*[:\-]\s*\d{1,2}:\d{2}\b/;
  // Receipt printers frequently put date and time on one line, labelled
  // FECHA/HORA or FECHA Y HORA. Prefer that timestamp, not opening hours.
  const issueTimestamp = /^(?:fecha(?:\s+de\s+(?:emision|expedicion|compra|factura))?|fecha\s*(?:\/|y)\s*hora|emitid[oa]\s+el)\s*[:\-]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s+(?:a\s+las\s+)?\d{1,2}:\d{2}\b/;
  let unknown: OcrInterpretedField<string> | null = null;
  let issueTime: OcrInterpretedField<string> | null = null;
  let contradictoryIssueTimes = false;
  for (const item of lines) {
    const match = item.line.text.match(pattern);
    if (!match) continue;
    const normalized = normalizeToken(item.line.text);
    if (unrelated.test(normalized) && !issueTimestamp.test(normalized)
      && !explicitTime.test(normalized)) continue;
    const candidate = fieldFrom(item, match[0], `${match[1].padStart(2, "0")}:${match[2]}`);
    if (explicitTime.test(normalized) || issueTimestamp.test(normalized)) {
      // A continuation page may contain legal timetables or timestamps.
      // Textually clear does not prove this is the transaction time.
      const attributed = item.pageNumber > 1 ? fieldRequiringReview(candidate) : candidate;
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
    // A rejected payment, a future intention to pay and a payment-method
    // restriction are not proof of a completed charge.
    if (/\b(?:pago\s+pendiente|pendiente\s+de\s+pago|sin\s+pagar|no\s+pagad[oa]|operacion\s+denegada|transaccion\s+rechazada)\b/.test(normalized)) continue;
    const rejectedCard = /\b(?:tarjeta|visa|mastercard)\s+(?:rechazad[ao]s?|denegad[ao]s?)\b|\b(?:no\s+se\s+acepta|sin)\s+(?:pagos?\s+(?:en|con)\s+)?(?:tarjeta|visa|mastercard)\b/.test(normalized);
    const rejectedCash = /\b(?:no\s+se\s+acepta|sin)\s+(?:pago\s+en\s+)?efectivo\b/.test(normalized);
    const rejectedDebit = /\b(?:no|sin)\s+domiciliad[oa]s?\b/.test(normalized);
    const hit = keywords.find((entry) => entry.pattern.test(normalized)
      && !(rejectedCard && entry.value === "Tarjeta")
      && !(rejectedCash && entry.value === "Efectivo")
      && !(rejectedDebit && entry.value === "Domiciliación"));
    if (!hit) continue;
    const field = fieldFrom(item, item.line.text.trim(), hit.value);
    const explicitlyLabelled = /\b(?:forma|medio|metodo)\s+de\s+pago\b|\bpago\s*[:=-]/.test(normalized);
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

  for (const item of lines.slice(0, 8)) {
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
    if (!text || /\b(factura|ticket|fecha|nif|cif|total|base|iva)\b/.test(normalized) || TAX_ACRONYM.test(normalized)) continue;
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

    // A real-world invoice layout uses "I.V.A / I.G.I.C. (Base Imponible:
    // 100,00) 21% EUR 21,00". The two explicit monetary values straddle
    // an identified tax *percentage*. A TOTAL or payment label appearing
    // before the second value invalidates this inference. Keep it doubtful.
    const vatIgicPair = /\bi\.?v\.?a\b\.?\s*\/\s*\bi\.?g\.?i\.?c\b\.?/.test(searchable);
    const baseHeader = /\bbase\s+imponible\b/.exec(searchable);
    const taxRate = /\b(\d{1,2}(?:[,.]\d{1,2})?)\s*%/.exec(searchable);
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
    const rate = rateText.match(/(\d{1,2}(?:[,.]\d{1,2})?)\s*%/);

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

function extractLineItems(lines: LocatedLine[]): OcrDocumentLineItem[] {
  const result: OcrDocumentLineItem[] = [];
  // Compute product-table page membership only once; long multi-page bills
  // must not scan all OCR lines again for each potential product.
  const headerPages = new Set(lines.filter((item) => {
    const text = normalizeToken(item.line.text);
    return /^(?:descripcion|concepto|articulos?|productos?)\b/.test(text)
      && /\b(?:importe|total|precio|p\.?\s*unit)\b/.test(text);
  }).map((item) => item.pageNumber));
  // A receipt header explicitly scopes product rows. Stop before totals,
  // payment methods and tax tables instead of manufacturing purchases from
  // legal paragraphs or VAT summary rows elsewhere in the document.
  let tablePage = -1;
  let tableOpen = false;
  for (const item of lines) {
    const normalized = normalizeToken(item.line.text);
    if (tablePage !== item.pageNumber) {
      tablePage = item.pageNumber;
      tableOpen = false;
    }
    if (/^(?:descripcion|concepto|articulos?|productos?)\b/.test(normalized)
      && /\b(?:importe|total|precio|p\.?\s*unit)\b/.test(normalized)) {
      tableOpen = true;
      continue;
    }
    if (tableOpen && /^(?:total|subtotal|base\s+imponible|efectivo|tarjeta|forma\s+de\s+pago)\b/.test(normalized)) {
      tableOpen = false;
    }
    // Retain unstructured candidates for human review, but a table header
    // on this page means figures outside its product rows are not items.
    if (headerPages.has(item.pageNumber) && !tableOpen) continue;
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
      trust: arithmeticConflict ? "doubtful" : trustFor(confidence, true),
      evidence: [evidenceOf(item)],
    });
  }
  return result;
}

export function interpretDocumentOcrFinancially(result: DocumentOcrResult): DocumentOcrFinancialInterpretation {
  const located: LocatedLine[] = result.pages.flatMap((page) => page.lines.map((line) => ({ pageNumber: page.pageNumber, line })));
  let taxBaseCents = extractMoneyField(located, [/\bbase imponible\b/, /^base\b/, /\bsubtotal\b/], { ownLabelOnly: true });
  let taxesCents = extractMoneyField(located, [TAX_ACRONYM, /\bimpuestos?\b/], { ownLabelOnly: true });
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
        && /\bbase\s+imponible\b/.test(normalizeToken(header.rawText))
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

  return {
    interpretationVersion: 1,
    issuer: extractIssuer(located),
    taxId: extractTaxId(located),
    date: extractDate(located),
    time: extractTime(located),
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