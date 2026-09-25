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
  useGrouping: "always",
});

const decimalFormatter = new Intl.NumberFormat(REGIONAL_CONFIG.locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

const digitFormatters = new Map<string, Intl.NumberFormat>();

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

export function formatNumberWithDigits(value: number, fractionDigits: number, minimumFractionDigits = fractionDigits): string {
  if (!Number.isFinite(value) || !Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 2
    || !Number.isInteger(minimumFractionDigits) || minimumFractionDigits < 0 || minimumFractionDigits > fractionDigits) {
    throw new RangeError("Número o precisión no válidos");
  }
  const key = `${minimumFractionDigits}:${fractionDigits}`;
  let formatter = digitFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(REGIONAL_CONFIG.locale, {
      minimumFractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: "always",
    });
    digitFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatBasisPoints(value: number, fractionDigits = 1, unit: "%" | "pp" = "%", minimumFractionDigits = fractionDigits): string {
  if (!Number.isSafeInteger(value)) throw new RangeError("Puntos básicos no válidos");
  return `${formatNumberWithDigits(value / 100, fractionDigits, minimumFractionDigits)} ${unit}`;
}

export function formatPercentage(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat(REGIONAL_CONFIG.locale, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: "always",
  }).format(value);
}

export function formatDate(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Fecha no válida");
  }

  return dateFormatter.format(date);
}
