import type { MoneyCents } from "../domain/models";
import { formatMoney } from "./formatters";

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

export function formatMoneyCents(cents: MoneyCents): string {
  assertMoneyCents(cents);
  return formatMoney(cents / 100);
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
