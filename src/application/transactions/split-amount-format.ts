import { formatMoneyInputCents } from "../../core/money";

/** Exact cent-by-cent representation; floating-point euros can lose one cent. */
export function formatSplitAmountInput(cents: number) {
  return formatMoneyInputCents(Math.abs(cents), true);
}

export function parseSplitAmountInput(value: string): number | null {
  const raw = value.trim().replace(/\s*€$/, "").trim();
  if (!raw || !/^[\d.,]+$/.test(raw)) return null;
  // 1.234 sin coma es ambiguo: no inferimos miles ni redondeamos tres decimales.
  const grouped = /^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(raw);
  const commaDecimal = /^\d+(?:,\d{1,2})?$/.test(raw);
  const dotDecimal = /^\d+(?:\.\d{1,2})?$/.test(raw);
  if (!grouped && !commaDecimal && !dotDecimal) return null;
  const normalized = grouped ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(",", ".");
  const [euros, decimals = ""] = normalized.split(".");
  // Assemble exact cents first; do not multiply floating-point euros by 100.
  const cents = BigInt(euros) * BigInt(100) + BigInt(decimals.padEnd(2, "0"));
  return cents > BigInt(0) && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}
