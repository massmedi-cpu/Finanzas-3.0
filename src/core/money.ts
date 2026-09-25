import type { MoneyCents } from "../domain/models";
import { formatInteger } from "./formatters";

const SPANISH_MONEY_PATTERN = /^([+-]?)(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/;

export function assertMoneyCents(value: number): asserts value is MoneyCents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("El importe en céntimos debe ser un entero seguro");
  }
}

export function parseSpanishMoneyToCents(rawValue: string): MoneyCents {
  const normalized = rawValue
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s*€\s*$/, "")
    .replace(/\s+/g, "");

  const match = SPANISH_MONEY_PATTERN.exec(normalized);

  if (!match) {
    throw new RangeError(`Importe no válido: ${rawValue}`);
  }

  const [, sign, integerPart, decimalPart = ""] = match;
  const integerDigits = integerPart.replace(/\./g, "");
  const centsDigits = decimalPart.padEnd(2, "0");
  const absoluteCents = Number(`${integerDigits}${centsDigits}`);

  if (!Number.isSafeInteger(absoluteCents)) {
    throw new RangeError("El importe supera el rango seguro soportado");
  }

  return (sign === "-" ? -absoluteCents : absoluteCents) as MoneyCents;
}

function moneyParts(cents: MoneyCents) {
  assertMoneyCents(cents);
  const absolute = cents < 0 ? -BigInt(cents) : BigInt(cents);
  return {
    sign: cents < 0 ? "-" : "",
    euros: absolute / BigInt(100),
    decimals: (absolute % BigInt(100)).toString().padStart(2, "0"),
  };
}

export function formatMoneyCents(cents: MoneyCents): string {
  // Divide as integers: converting large safe cent values to floating-point
  // euros can round away the final cent before Intl sees the value.
  const { sign, euros, decimals } = moneyParts(cents);
  return `${sign}${formatInteger(euros)},${decimals}\u00a0€`;
}

export function formatMoneyInputCents(cents: MoneyCents, grouped = false): string {
  const { sign, euros, decimals } = moneyParts(cents);
  return `${sign}${grouped ? formatInteger(euros) : euros.toString()},${decimals}`;
}

// Accept a plain decimal dot for existing forms, while a dot followed by
// three digits continues to mean Spanish thousands grouping.
export function parseMoneyInputToCents(value: string): MoneyCents {
  const compact = value.trim().replace(/\s/g, "");
  const normalized = /^[+-]?\d+\.\d{1,2}$/.test(compact)
    ? compact.replace(".", ",")
    : compact;
  return parseSpanishMoneyToCents(normalized);
}

export function addMoney(...values: MoneyCents[]): MoneyCents {
  const total = values.reduce((sum, value) => {
    assertMoneyCents(value);
    return sum + value;
  }, 0);

  assertMoneyCents(total);
  return total;
}

export function subtractMoney(left: MoneyCents, right: MoneyCents): MoneyCents {
  assertMoneyCents(left);
  assertMoneyCents(right);
  const result = left - right;
  assertMoneyCents(result);
  return result;
}
