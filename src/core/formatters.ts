import { REGIONAL_CONFIG } from "./regional";

const moneyFormatter = new Intl.NumberFormat(REGIONAL_CONFIG.locale, {
  style: "currency",
  currency: REGIONAL_CONFIG.currency,
  currencyDisplay: "symbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

const integerFormatter = new Intl.NumberFormat(REGIONAL_CONFIG.locale, {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat(REGIONAL_CONFIG.locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat(REGIONAL_CONFIG.locale, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: REGIONAL_CONFIG.timeZone,
});

export function formatMoney(value: number | bigint): string {
  return moneyFormatter.format(value);
}

export function formatInteger(value: number | bigint): string {
  return integerFormatter.format(value);
}

export function formatNumber(value: number | bigint): string {
  return decimalFormatter.format(value);
}

export function formatPercentage(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat(REGIONAL_CONFIG.locale, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatDate(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Fecha no válida");
  }

  return dateFormatter.format(date);
}
