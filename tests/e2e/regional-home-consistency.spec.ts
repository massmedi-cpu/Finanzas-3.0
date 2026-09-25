import { expect, test } from "@playwright/test";
import { checkHomeConsistency } from "../../src/application/dashboard/home-consistency";
import { formatBasisPoints } from "../../src/core/formatters";
import { formatMoneyCents, formatMoneyInputCents, parseMoneyInputToCents } from "../../src/core/money";

const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-25",
    incomeCents: 200000,
    expenseCents: 75000,
    operatingNetCents: 125000,
  },
  balances: {
    activeBalanceCents: 125000,
    accounts: [
      { lifecycle: "active" as const, balanceCents: 100000 },
      { lifecycle: "active" as const, balanceCents: 25000 },
      { lifecycle: "archived" as const, balanceCents: 50000 },
    ],
  },
};

const monthly = {
  dateTo: "2026-09-25",
  rows: [{ monthStart: "2026-09-01", incomeCents: 200000, expenseCents: 75000, operatingNetCents: 125000 }],
};

test("el formato común conserva céntimos y miles en todo el rango seguro", () => {
  expect(formatMoneyCents(0)).toBe("0,00\u00a0€");
  expect(formatMoneyCents(100000)).toBe("1.000,00\u00a0€");
  expect(formatMoneyCents(-123456)).toBe("-1.234,56\u00a0€");
  expect(formatMoneyCents(Number.MAX_SAFE_INTEGER)).toBe("90.071.992.547.409,91\u00a0€");
  expect(formatMoneyCents(-Number.MAX_SAFE_INTEGER)).toBe("-90.071.992.547.409,91\u00a0€");
  expect(() => formatMoneyCents(1.5)).toThrow(RangeError);
  expect(formatBasisPoints(6250, 2)).toBe("62,50 %");
  expect(formatBasisPoints(10000, 1, "%", 0)).toBe("100 %");
  for (const cents of [0, 1, -1, 100000, -123456, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
    expect(parseMoneyInputToCents(formatMoneyInputCents(cents))).toBe(cents);
    expect(parseMoneyInputToCents(formatMoneyInputCents(cents, true))).toBe(cents);
  }
  expect(parseMoneyInputToCents("1234.56")).toBe(123456);
  expect(parseMoneyInputToCents("1.234")).toBe(123400);
  expect(() => parseMoneyInputToCents("1.23,456")).toThrow(RangeError);
});

test("Inicio muestra solo fuentes conciliadas y rechaza una respuesta de otro mes", () => {
  const input = { financial, monthly, budgetMonth: "2026-09", today: "2026-09-25" };
  expect(checkHomeConsistency(input)).toEqual({
    balancesMatch: true,
    currentMonthMatches: true,
    budgetMonthMatches: true,
  });

  expect(checkHomeConsistency({
    ...input,
    financial: { ...financial, balances: { ...financial.balances, activeBalanceCents: 125001 } },
    monthly: { ...monthly, rows: [{ ...monthly.rows[0], expenseCents: 75001 }] },
    budgetMonth: "2026-08",
  })).toEqual({ balancesMatch: false, currentMonthMatches: false, budgetMonthMatches: false });

  // Independent reads taken at different date boundaries cannot be compared.
  expect(checkHomeConsistency({
    ...input,
    monthly: { ...monthly, dateTo: "2026-09-24", rows: [{ ...monthly.rows[0], incomeCents: 0 }] },
  }).currentMonthMatches).toBe(true);
});
