import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { isAnalysisSnapshot } from "../../src/application/analysis/analysis-contract";
import { analysisSelectionFromSearchParams } from "../../src/application/analysis/analysis-query-state";

const VALID_SNAPSHOT = {
  contractVersion: 2,
  selection: {
    range: "6m",
    month: "2026-08",
    accountId: null,
    dateFrom: "2026-03-01",
    dateTo: "2026-08-31",
    previousDateFrom: "2025-09-01",
    previousDateTo: "2026-02-28",
    partial: false,
    partialMonthStart: null,
  },
  current: {
    dateFrom: "2026-03-01",
    dateTo: "2026-08-31",
    incomeCents: 1200000,
    expenseCents: 420000,
    operatingNetCents: 780000,
    savingsCents: 780000,
    savingsRateBps: 6500,
  },
  previous: {
    dateFrom: "2025-09-01",
    dateTo: "2026-02-28",
    incomeCents: 1180000,
    expenseCents: 440000,
    operatingNetCents: 740000,
    savingsCents: 740000,
    savingsRateBps: 6271,
  },
  comparison: {},
  averages: { last3Months: null, last6Months: null },
  history: [],
  trends: {},
  categoryDrivers: [],
  merchantDrivers: [],
  changeDrivers: [],
  concentration: { top3CategoryBps: null, top3MerchantBps: null },
  anomalies: [],
  fixedVariable: {
    available: false,
    reliableRecurrences: 0,
    fixedExpenseCents: 0,
    variableExpenseCents: 420000,
    fixedShareBps: null,
  },
  budget: null,
  forecast: null,
  accounts: [],
  quality: {
    reconciled: true,
    categoryExpenseCents: 420000,
    expenseRows: 24,
    excludedRows: 0,
    confirmedDuplicateRows: 0,
  },
  principles: {
    bankSource: "read_only",
    totals: "financial_period",
    history: "financial_monthly_series",
    drivers: "financial_transaction_facts_aggregate",
    anomalies: "deterministic_history_threshold",
    generativeAi: false,
  },
};

test("Análisis v3 · el estado de URL conserva mes, rango y cuenta sin mezclar valores repetidos", () => {
  expect(analysisSelectionFromSearchParams({
    month: ["2026-08", "2026-07"],
    range: "6m",
    accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  })).toEqual({
    month: "2026-08",
    range: "6m",
    accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
});

test("Análisis v3 · el cliente acepta sólo snapshots reconciliados y con principios financieros intactos", () => {
  expect(isAnalysisSnapshot(VALID_SNAPSHOT)).toBe(true);
  expect(isAnalysisSnapshot({ ...VALID_SNAPSHOT, contractVersion: 1 })).toBe(false);
  expect(isAnalysisSnapshot({
    ...VALID_SNAPSHOT,
    quality: { ...VALID_SNAPSHOT.quality, reconciled: false },
  })).toBe(false);
  expect(isAnalysisSnapshot({
    ...VALID_SNAPSHOT,
    principles: { ...VALID_SNAPSHOT.principles, bankSource: "mutable" },
  })).toBe(false);
  expect(isAnalysisSnapshot({
    ...VALID_SNAPSHOT,
    principles: { ...VALID_SNAPSHOT.principles, generativeAi: true },
  })).toBe(false);
});

test("Análisis v5 · el shell queda fuera de la espera del snapshot financiero", () => {
  const source = readFileSync(resolve(process.cwd(), "app/analysis/page.tsx"), "utf8");

  expect(source).toMatch(/async function AnalysisData[\s\S]*loadAnalysisSnapshot\(fallbackSelection\)/);
  expect(source).toMatch(/<AppShell>[\s\S]*<Suspense fallback=\{<AnalysisLoadingFrame \/>}?>[\s\S]*<AnalysisData searchParams=\{searchParams\} \/>/);

  const shellIndex = source.indexOf("<AppShell>");
  const suspenseIndex = source.indexOf("<Suspense");
  const dataIndex = source.indexOf("<AnalysisData");
  expect(shellIndex).toBeGreaterThanOrEqual(0);
  expect(suspenseIndex).toBeGreaterThan(shellIndex);
  expect(dataIndex).toBeGreaterThan(suspenseIndex);
});
