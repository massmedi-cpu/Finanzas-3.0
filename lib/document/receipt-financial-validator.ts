import type { ReceiptLayout, ReceiptLineItem } from "./receipt-layout";

export type ReceiptValidationStatus = "complete" | "needs_review" | "failed";
export type ReceiptContradiction = {
  code: string;
  severity: "warning" | "critical";
  message: string;
};
export type ReceiptValidation = {
  status: ReceiptValidationStatus;
  confidence: number;
  itemSum: number | null;
  printedTotal: number | null;
  base: number | null;
  tax: number | null;
  basePlusTax: number | null;
  validItems: number;
  invalidItems: number;
  unparsedBodyRows: number;
  contradictions: ReceiptContradiction[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;

function numberValue(value: string | null | undefined) {
  if (!value) return null;
  const normalized = String(value)
    .replace(/\s/g, "")
    .replace(/O/gi, "0")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/[^\d.+-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedLabel(value: string) {
  return value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/g, "");
}

function summaryAmount(layout: ReceiptLayout | null | undefined, keys: string[]) {
  if (!layout) return null;
  for (const line of [...layout.summary].reverse()) {
    if (!keys.includes(normalizedLabel(line.label))) continue;
    const value = numberValue(line.value);
    if (value !== null) return value;
  }
  return null;
}

function itemArithmetic(item: ReceiptLineItem) {
  const quantity = numberValue(item.quantity);
  const unitPrice = numberValue(item.unitPrice);
  const total = numberValue(item.total);
  if (quantity === null || unitPrice === null || total === null || quantity <= 0 || unitPrice < 0 || total < 0) {
    return { valid: false, total };
  }
  const expected = quantity * unitPrice;
  const tolerance = Math.max(0.03, Math.abs(total) * 0.01);
  return { valid: Math.abs(expected - total) <= tolerance, total };
}

function hasAdjustmentEvidence(rawTexts: string[]) {
  return rawTexts.some((text) => /\b(?:descuento|dto\.?|promoci[oó]n|bonificaci[oó]n|cup[oó]n|ajuste|redondeo)\b/i.test(text));
}

export function validateReceiptFinancials(layout: ReceiptLayout | null | undefined, rawTexts: string[] = []): ReceiptValidation {
  const contradictions: ReceiptContradiction[] = [];
  if (!layout) {
    return {
      status: "failed",
      confidence: 0,
      itemSum: null,
      printedTotal: null,
      base: null,
      tax: null,
      basePlusTax: null,
      validItems: 0,
      invalidItems: 0,
      unparsedBodyRows: 0,
      contradictions: [{ code: "missing_structure", severity: "critical", message: "No se pudo reconstruir la estructura del ticket." }],
    };
  }

  let validItems = 0;
  let invalidItems = 0;
  let itemSum = 0;
  layout.items.forEach((item, index) => {
    const arithmetic = itemArithmetic(item);
    if (arithmetic.total !== null) itemSum += arithmetic.total;
    if (arithmetic.valid) validItems += 1;
    else {
      invalidItems += 1;
      contradictions.push({
        code: `invalid_item_arithmetic_${index + 1}`,
        severity: "critical",
        message: `La línea ${index + 1} no cumple cantidad × precio ≈ importe.`,
      });
    }
    if (!(item.description || "").match(/\p{L}{2,}/u)) {
      contradictions.push({
        code: `missing_item_description_${index + 1}`,
        severity: "critical",
        message: `La línea ${index + 1} no conserva una descripción reconocible.`,
      });
    }
  });
  itemSum = layout.items.length ? round2(itemSum) : 0;

  const printedTotal = summaryAmount(layout, ["TOTAL", "TOTALAPAGAR", "IMPORTETOTAL"]);
  const base = summaryAmount(layout, ["BASE", "BASEIMPONIBLE", "SUBTOTAL"]);
  const tax = summaryAmount(layout, ["IVA", "TOTALIVA"]);
  const basePlusTax = base !== null && tax !== null ? round2(base + tax) : null;
  const unparsedBodyRows = layout.unparsedBody?.length || 0;

  if (!layout.items.length) {
    contradictions.push({ code: "missing_items", severity: "critical", message: "No se reconocieron líneas de consumición válidas." });
  }
  if (unparsedBodyRows > 0) {
    contradictions.push({
      code: "unparsed_body_rows",
      severity: "critical",
      message: `Quedan ${unparsedBodyRows} fila(s) del cuerpo sin interpretar; no puede declararse completo.`,
    });
  }
  if (printedTotal === null) {
    contradictions.push({ code: "missing_total", severity: "critical", message: "No se ha identificado un total impreso fiable." });
  }
  if (printedTotal !== null && basePlusTax !== null && Math.abs(printedTotal - basePlusTax) > 0.03) {
    contradictions.push({
      code: "base_tax_total_mismatch",
      severity: "critical",
      message: `Base + IVA (${basePlusTax.toFixed(2)}) contradice el total impreso (${printedTotal.toFixed(2)}).`,
    });
  }
  if (printedTotal !== null && layout.items.length && !hasAdjustmentEvidence(rawTexts) && Math.abs(itemSum - printedTotal) > 0.05) {
    contradictions.push({
      code: "items_total_mismatch",
      severity: "critical",
      message: `La suma de líneas (${itemSum.toFixed(2)}) contradice el total impreso (${printedTotal.toFixed(2)}).`,
    });
  }

  const critical = contradictions.filter((item) => item.severity === "critical").length;
  let confidence = 100;
  confidence -= critical * 16;
  confidence -= invalidItems * 10;
  confidence -= Math.min(24, unparsedBodyRows * 8);
  if (!layout.header.length) confidence -= 8;
  if (!layout.footer.length) confidence -= 4;
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const status: ReceiptValidationStatus = layout.items.length === 0 && printedTotal === null
    ? "failed"
    : critical > 0
      ? "needs_review"
      : "complete";

  return {
    status,
    confidence,
    itemSum: layout.items.length ? itemSum : null,
    printedTotal,
    base,
    tax,
    basePlusTax,
    validItems,
    invalidItems,
    unparsedBodyRows,
    contradictions,
  };
}
