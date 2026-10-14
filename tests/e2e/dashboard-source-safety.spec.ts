import { expect, test } from "@playwright/test";
import { isHomeDashboardSourceSafe } from "../../src/application/dashboard/dashboard-source-safety";

const samples = {
  financial: {
    period: { incomeCents: 120000, expenseCents: 50000, operatingNetCents: 70000, quality: { signMismatchRows: 0 } },
    balances: { activeBalanceCents: 36000, accounts: [{ name: "Cuenta", lifecycle: "active", balanceCents: 36000 }] },
  },
  monthly: { rows: [{ monthStart: "2026-09-01", incomeCents: 120000, expenseCents: 50000, operatingNetCents: 70000 }] },
  budgets: { month: "2026-09", total: { effectiveAmountCents: 90000, actualExpenseCents: 50000 },
    categories: [{ actualExpenseCents: 50000 }] },
  forecast: { summary: { plannedItems: 1, projectedNetCents: 22000, projectedClosingBalanceCents: 58000 },
    items: [{ id: "f1", concept: "Internet", amountCents: -2500, date: "2026-10-15", status: "planned", affectsProjection: true }] },
  transactions: { rows: [{ id: "t1", bankDate: "2026-10-14", amountCents: -2000, account: { name: "Cuenta" },
    concept: { effective: "Compra" }, category: { effectiveId: null, effectiveName: null },
    kind: { effective: "expense" }, merchant: { effectiveName: null } }], totalCount: 1 },
};

test("REC-HOME-DATA-001 · all five canonical Inicio sources have renderable minimum contracts", () => {
  for (const [source, value] of Object.entries(samples)) {
    expect(isHomeDashboardSourceSafe(source as keyof typeof samples, value), source).toBe(true);
  }
});

test("REC-HOME-DATA-002 · malformed account money cannot crash financial totals", () => {
  for (const value of [
    { ...samples.financial, balances: null },
    { ...samples.financial, period: { ...samples.financial.period, quality: null } },
    { ...samples.financial, balances: { activeBalanceCents: Number.NaN, accounts: [] } },
    { ...samples.financial, balances: { activeBalanceCents: 36000, accounts: [{}] } },
    { ...samples.financial, period: { ...samples.financial.period, expenseCents: 1.25 } },
  ]) {
    expect(isHomeDashboardSourceSafe("financial", value)).toBe(false);
  }
});

test("REC-HOME-DATA-003 · malformed chart, budgets or forecasts cannot reach React maps", () => {
  expect(isHomeDashboardSourceSafe("monthly", { rows: null })).toBe(false);
  expect(isHomeDashboardSourceSafe("monthly", { rows: [{ monthStart: "2026-02-30", incomeCents: 0, expenseCents: 0, operatingNetCents: 0 }] })).toBe(false);
  expect(isHomeDashboardSourceSafe("budgets", { ...samples.budgets, categories: null })).toBe(false);
  expect(isHomeDashboardSourceSafe("forecast", { ...samples.forecast, items: [{}] })).toBe(false);
  expect(isHomeDashboardSourceSafe("forecast", { ...samples.forecast, summary: { plannedItems: 1 } })).toBe(false);
});

test("REC-HOME-DATA-004 · incomplete transaction rows cannot be trusted as bank activity", () => {
  expect(isHomeDashboardSourceSafe("transactions", { ...samples.transactions, rows: [{}] })).toBe(false);
  expect(isHomeDashboardSourceSafe("transactions", { ...samples.transactions,
    rows: [{ ...samples.transactions.rows[0], amountCents: Number.POSITIVE_INFINITY }] })).toBe(false);
  expect(isHomeDashboardSourceSafe("transactions", { ...samples.transactions,
    rows: [{ ...samples.transactions.rows[0], concept: null }] })).toBe(false);
});

test("REC-HOME-DATA-006 · movements with malformed category, type or merchant cannot crash Inicio", () => {
  const row = samples.transactions.rows[0];
  for (const altered of [
    { ...row, category: null },
    { ...row, category: { effectiveId: 1234, effectiveName: "Hogar" } },
    { ...row, kind: null },
    { ...row, kind: { effective: "unexpected_bank_type" } },
    { ...row, merchant: { effectiveName: 1234 } },
    { ...row, id: "" },
  ]) {
    expect(isHomeDashboardSourceSafe("transactions", {
      ...samples.transactions, rows: [altered],
    })).toBe(false);
  }
  expect(isHomeDashboardSourceSafe("transactions", {
    ...samples.transactions, rows: [{ ...row, merchant: null }],
  })).toBe(true);
  expect(isHomeDashboardSourceSafe("transactions", {
    ...samples.transactions, rows: [{ ...row, category: { effectiveName: "Compras" } }],
  })).toBe(true);
});

test("REC-HOME-DATA-007 · invalid projected amounts and labels cannot reach currency or React", () => {
  const item = samples.forecast.items[0];
  for (const altered of [
    { ...item, amountCents: Number.NaN },
    { ...item, amountCents: undefined },
    { ...item, concept: { unsafe: "unexpected React child" } },
    { ...item, id: "" },
  ]) {
    expect(isHomeDashboardSourceSafe("forecast", {
      ...samples.forecast, items: [altered],
    })).toBe(false);
  }
});
