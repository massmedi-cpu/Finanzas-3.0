import { APP_CURRENCY, APP_LOCALE } from "@/lib/version";

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: APP_CURRENCY,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function parseSpanishMoneyToCents(value: string): number {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Importe no válido: ${value}`);
  return Math.round(parsed * 100);
}
