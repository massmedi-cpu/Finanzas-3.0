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
  options: { exclude?: RegExp; prefer?: RegExp } = {},
) {
  const candidates = lines.flatMap((item) => {
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
    const monies = [...item.line.text.matchAll(/-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[,.]\d{2})/g)]
      .flatMap((match) => {
        const value = parseMoneyCents(match[0]);
        return value === null ? [] : [{ raw: match[0], value, index: match.index }];
      });
    const following = monies.filter((money) => money.index >= anchorEnd);
    const chosen = following[0] ?? monies.at(-1);
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
      needsReview: following.length === 0 || paymentBeforeAmount || conflictingAmounts,
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
    evidence: candidates.map((candidate) => evidenceOf(candidate.item)),
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
  // A date in legal conditions, a billing period or an expiration field is not
  // evidence of the document's issue/purchase date.
  const unrelated = /\b(?:nacimiento|vencimiento|caducidad|vigencia|registro|periodo|hasta|desde|legal)\b/;
  const directLabel = /^(?:fecha(?:\s+de\s+(?:emision|expedicion|compra|factura|ticket))?|emitid[oa]\s+el)\s*[:\-]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/;
  let unlabelled: OcrInterpretedField<string> | null = null;

  for (const item of lines) {
    const match = item.line.text.match(pattern);
    if (!match) continue;
    const normalized = normalizeToken(item.line.text);
    if (unrelated.test(normalized)) continue;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? "20" + match[3] : match[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) continue;
    const iso = String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const field = fieldFrom(item, match[0], iso);
    if (directLabel.test(normalized)) return field;
    // The date may be real, but text recognition alone cannot establish its role.
    // Preserve the first fallback for review; never promote it to "reliable".
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
    { pattern: /\bdomiciliacion\b|\brecibo\b/, value: "Domiciliación" },
  ];
  for (const item of lines) {
    const normalized = normalizeToken(item.line.text);
    const hit = keywords.find((entry) => entry.pattern.test(normalized));
    if (hit) return fieldFrom(item, item.line.text.trim(), hit.value);
  }
  return emptyField<string>();
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
  for (const item of lines) {
    const searchable = item.line.text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (!/\b(?:iva|igic|impuestos?)\b/.test(searchable)) continue;
    const labels = [...searchable.matchAll(/\b(?:base(?:\s+imponible)?|subtotal|iva|igic|impuestos?|cuota(?:\s+(?:del?\s+)?(?:iva|igic|impuestos?))?|importe\s+total|total(?:\s+a\s+pagar)?|a\s+pagar|efectivo|tarjeta|cambio)\b/g)]
      .map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
    const amounts = [...item.line.text.matchAll(/-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[,.]\d{2})/g)]
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
    const moneyMatches = text.match(/-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[,.]\d{2})/g) ?? [];
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
  let taxBaseCents = extractMoneyField(located, [/\bbase imponible\b/, /^base\b/, /\bsubtotal\b/]);
  let taxesCents = extractMoneyField(located, [/\biva\b/, /\bigic\b/, /\bimpuestos?\b/]);
  let totalCents = extractMoneyField(located, [/\btotal\b/, /\bimporte total\b/, /\ba pagar\b/], {
    exclude: /\btotal\s+(?:de\s+)?(?:descuentos?|impuestos?|iva|ahorro|unidades|articulos|productos)\b/,
    prefer: /\b(?:total\s+a\s+pagar|importe\s+total|a\s+pagar|total\s+factura|total\s+final)\b/,
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