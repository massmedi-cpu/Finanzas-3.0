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

function exactFinancialAmountMatches(text: string) {
  return [...text.matchAll(FINANCIAL_AMOUNT_TOKEN)].filter((match) => {
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

function extractMoneyField(
  lines: LocatedLine[],
  labels: RegExp[],
  options: { exclude?: RegExp; prefer?: RegExp; adjacentAmount?: boolean; ownLabelOnly?: boolean } = {},
) {
  const candidates = lines.flatMap((item, index) => {
    const normalized = normalizeToken(item.line.text);
    if (!labels.some((label) => label.test(normalized)) || options.exclude?.test(normalized)) return [];

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
      ? searchable.slice(anchorEnd).search(/\b(?:base(?: imponible)?|subtotal|iva|igic|impuestos?|cuota(?: del? iva)?|total|importe total|a pagar|efectivo|tarjeta|cambio)\b/)
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
  const pattern = /\b(?:[XYZ]\s*[- ]?\s*\d{7}\s*[- ]?\s*[A-Z]|[ABCDEFGHJNPQRSUVW]\s*[- ]?\s*\d{7}\s*[- ]?\s*[0-9A-J]|\d{8}\s*[- ]?\s*[A-Z])\b/i;
  const recipientLabel = /\b(?:cliente|destinatario|receptor|comprador|facturar a|datos del cliente)\b/;
  const explicitIssuerLabel = /\b(?:emisor|proveedor|comercio|vendedor)\b/;
  let unassigned: OcrInterpretedField<string> | null = null;

  for (const item of lines) {
    const match = item.line.text.toUpperCase().match(pattern);
    if (!match) continue;
    const normalized = normalizeToken(item.line.text);
    // Do not show the customer or recipient tax identifier as the issuer ID.
    if (recipientLabel.test(normalized)) continue;
    const raw = match[0].replace(/\s+/g, "");
    const candidate = fieldFrom(item, raw, raw.replace(/-/g, ""));
    if (explicitIssuerLabel.test(normalized)) return spanishTaxIdChecksumValid(candidate.value ?? "") ? candidate : fieldRequiringReview(candidate);
    // A bare CIF/NIF is recognized text, but its owner is not proven.
    unassigned ??= fieldRequiringReview(candidate);
  }
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
  const directLabel = /^(?:fecha(?:\s+de\s+(?:emision|expedicion|compra|factura))?|emitid[oa]\s+el)\s*[:\-]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/;
  const explicitWritten = /\b(?:emitid[oa]\s+el|fecha(?:\s+de\s+(?:emision|expedicion|compra|factura))?\s*[:\-]?)\s*\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+\d{4}\b/;
  const embeddedNumericIssueDate = /\bemitid[oa]\s+el\s+\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/;
  let unlabelled: OcrInterpretedField<string> | null = null;

  for (const item of lines) {
    const normalized = normalizeToken(item.line.text);
    if (unrelated.test(normalized)) continue;
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
      return labelledNumeric && labelledWritten ? fieldRequiringReview(field) : field;
    }
    // Unlabelled date text may be correct, but we cannot prove its document role.
    unlabelled ??= fieldRequiringReview(field);
  }
  return unlabelled ?? emptyField<string>();
}

function extractTime(lines: LocatedLine[]) {
  const pattern = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/;
  const unrelated = /\b(?:horario|apertura|cierre|atencion\s+al\s+publico|laborables|oficinas)\b/;
  const explicitTime = /^(?:hora(?:\s+(?:de\s+)?(?:compra|emision|ticket))?|fecha\s+y\s+hora)\s*[:\-]\s*\d{1,2}:\d{2}\b/;
  let unknown: OcrInterpretedField<string> | null = null;
  for (const item of lines) {
    const match = item.line.text.match(pattern);
    if (!match) continue;
    const normalized = normalizeToken(item.line.text);
    if (unrelated.test(normalized)) continue;
    const candidate = fieldFrom(item, match[0], `${match[1].padStart(2, "0")}:${match[2]}`);
    if (explicitTime.test(normalized)) return candidate;
    unknown ??= fieldRequiringReview(candidate);
  }
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
      return fieldFrom(item, match![0], candidate);
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
    // A denied direct debit is not a confirmed payment method.
    if (/\b(?:no|sin)\s+domiciliad[oa]s?\b/.test(normalized)) continue;
    const hit = keywords.find((entry) => entry.pattern.test(normalized));
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
  const explicit = findLabelled(lines, [/^(?:emisor|comercio|proveedor)\s*[:\-]\s*\S/]);
  if (explicit) {
    const raw = valueAfterLabel(explicit.line.text);
    if (raw && (raw.match(/\p{L}/gu) ?? []).length >= 2) return fieldFrom(explicit, raw, raw);
  }

  const ambiguous = findLabelled(lines, [/\brazon social\b/]);
  if (ambiguous) {
    const raw = valueAfterLabel(ambiguous.line.text);
    if (raw && (raw.match(/\p{L}/gu) ?? []).length >= 2) {
      return fieldRequiringReview(fieldFrom(ambiguous, raw, raw));
    }
  }

  for (const item of lines.slice(0, 8)) {
    const text = item.line.text.trim();
    const normalized = normalizeToken(text);
    if (!text || /\b(factura|ticket|fecha|nif|cif|total|base|iva)\b/.test(normalized)) continue;
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
    if (!/\b(?:iva|igic|impuestos?)\b/.test(searchable)) continue;

    // In real retail receipts, "IVA BASE IMPONIBLE (€) CUOTA (€)" is a
    // column header. The next rows carry "10% 30,00 3,00" without an IVA
    // label, so inspecting only the header loses the actual tax lines.
    // Interpret at most four immediately adjacent rows on the same page.
    // Text order suggests column ownership; always require human review.
    if (/\b(?:iva|igic)\b/.test(searchable)
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

    const labels = [...searchable.matchAll(/\b(?:base(?:\s+imponible)?|subtotal|iva|igic|impuestos?|cuota(?:\s+(?:del?\s+)?(?:iva|igic|impuestos?))?|importe\s+total|total(?:\s+a\s+pagar)?|a\s+pagar|efectivo|tarjeta|cambio)\b/g)]
      .map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
    const amounts = exactFinancialAmountMatches(item.line.text)
      .flatMap((match) => {
        const value = parseMoneyCents(match[0]);
        return value === null ? [] : [{ start: match.index, value }];
      });
    const taxLabel = labels.find((label) => /^(?:iva|igic|impuestos?)$/.test(label.text));
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
    const confidence = item.line.confidence;
    const detected = taxCents !== null || Boolean(rate);
    result.push({
      ratePercent: rate ? Number(rate[1].replace(",", ".")) : null,
      baseCents,
      taxCents,
      confidence,
      trust: !detected ? "not_detected"
        : taxCents === null || uncertain ? "doubtful"
        : trustFor(confidence, true),
      evidence: [evidenceOf(item)],
    });
  }
  return result;
}

function extractLineItems(lines: LocatedLine[]): OcrDocumentLineItem[] {
  const result: OcrDocumentLineItem[] = [];
  for (const item of lines) {
    const text = item.line.text.trim();
    const normalized = normalizeToken(text);
    if (!text || /\b(total|subtotal|base|iva|impuesto|cambio|efectivo|tarjeta|a pagar)\b/.test(normalized)) continue;
    const moneyMatches = exactFinancialAmountMatches(text).map((match) => match[0]);
    if (!moneyMatches.length) continue;
    const lastMoney = moneyMatches.at(-1) ?? null;
    const totalCents = lastMoney ? parseMoneyCents(lastMoney) : null;
    const firstMoneyIndex = lastMoney ? text.lastIndexOf(lastMoney) : -1;
    const description = firstMoneyIndex > 0 ? text.slice(0, firstMoneyIndex).replace(/\s+/g, " ").trim() : "";
    if ((description.match(/\p{L}/gu) ?? []).length < 2 || totalCents === null) continue;
    const confidence = item.line.confidence;
    result.push({
      description,
      quantity: null,
      unitPriceCents: moneyMatches.length >= 2 ? parseMoneyCents(moneyMatches[moneyMatches.length - 2]) : null,
      totalCents,
      confidence,
      trust: trustFor(confidence, true),
      evidence: [evidenceOf(item)],
    });
  }
  return result;
}

export function interpretDocumentOcrFinancially(result: DocumentOcrResult): DocumentOcrFinancialInterpretation {
  const located: LocatedLine[] = result.pages.flatMap((page) => page.lines.map((line) => ({ pageNumber: page.pageNumber, line })));
  let taxBaseCents = extractMoneyField(located, [/\bbase imponible\b/, /^base\b/, /\bsubtotal\b/], { ownLabelOnly: true });
  let taxesCents = extractMoneyField(located, [/\biva\b/, /\bigic\b/, /\bimpuestos?\b/], { ownLabelOnly: true });
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
  });
  const warnings: string[] = [];

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
    taxLines: extractTaxLines(located),
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