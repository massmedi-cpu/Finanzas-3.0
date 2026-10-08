export function formatSplitAmountInput(cents: number) {
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(cents) / 100);
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
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
