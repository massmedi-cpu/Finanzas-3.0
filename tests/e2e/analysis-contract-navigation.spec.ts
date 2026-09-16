import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { isAnalysisSnapshot } from "../../src/application/analysis/analysis-contract";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import { resolveSavingsRatePresentation } from "../../src/application/analysis/analysis-presentation";
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

test("Análisis v5 · un fallo de recuperación no deja un esqueleto infinito", () => {
  const source = readFileSync(resolve(process.cwd(), "app/analysis/analysis-client.tsx"), "utf8");

  expect(source).toContain("Reintentar");
  expect(source).toMatch(/!snapshot && loading && <LoadingSkeleton \/>/);
  expect(source).not.toMatch(/!snapshot && <LoadingSkeleton \/>/);
});

test("Análisis v6 · los fallos del gateway conservan status y código hasta los logs de diagnóstico", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "app/analysis/page.tsx"), "utf8");
  const routeSource = readFileSync(resolve(process.cwd(), "app/api/analysis/route.ts"), "utf8");
  const recoverySource = readFileSync(resolve(process.cwd(), "app/analysis/analysis-page-client.tsx"), "utf8");

  expect(pageSource).toContain("PersistenceGatewayError");
  expect(pageSource).toContain("status: error.status");
  expect(pageSource).toContain("code: error.code ?? null");
  expect(routeSource).toContain("analysis-api-gateway");
  expect(routeSource).toContain("status: error.status");
  expect(routeSource).toContain("code: error.code ?? null");
  expect(recoverySource).toContain("responseErrorCode");
  expect(recoverySource).toContain("analysis_contract_invalid");
  expect(recoverySource).not.toMatch(/!response\.ok \|\| !isAnalysisSnapshot\(payload\)/);
});

test("Análisis v6 · la frescura de fuente es auxiliar y no bloquea el snapshot principal", () => {
  const routeSource = readFileSync(resolve(process.cwd(), "app/api/analysis/source-freshness/route.ts"), "utf8");
  const freshnessSource = readFileSync(resolve(process.cwd(), "app/analysis/analysis-source-freshness.tsx"), "utf8");
  const pageClientSource = readFileSync(resolve(process.cwd(), "app/analysis/analysis-page-client.tsx"), "utf8");
  const loaderSource = readFileSync(resolve(process.cwd(), "src/application/analysis/analysis-loader.ts"), "utf8");

  expect(routeSource).toContain("callPersistenceGatewayBatch");
  expect(routeSource).toContain('action: "source.google_connection_status"');
  expect(routeSource).toContain('action: "transaction.query", payload: { limit: 1 }');
  expect(routeSource).toContain('"source.status"');
  expect(routeSource).toContain("rowsFailed: integer(run.rows_failed)");
  expect(routeSource).toContain("warningsCount: integer(run.warnings_count)");
  expect(freshnessSource).toContain('fetch("/api/analysis/source-freshness"');
  expect(freshnessSource).toContain("if (!freshness) return null");
  expect(freshnessSource).toContain("function nullableFiniteNumber");
  expect(freshnessSource).toContain("Number.isFinite(value)");
  expect(freshnessSource).toContain("Number.isNaN(date.getTime())");
  expect(freshnessSource).toContain("function syncHasIncidents");
  expect(freshnessSource).toContain('warnings > 0 ? " con avisos"');
  expect(freshnessSource).toContain('failedRows > 0 ? " con incidencias"');
  expect(freshnessSource).toContain("syncHasIncidents(freshness.sync)");
  expect(freshnessSource).toContain("Última sincronización con incidencias${when}${rows}${health.detail}${movement}");
  expect(pageClientSource).toMatch(/if \(!resolved\)[\s\S]*AnalysisLoadingFrame[\s\S]*<AnalysisSourceFreshness \/>[\s\S]*<AnalysisClient/);
  expect(loaderSource).not.toContain("source.google_connection_status");
  expect(loaderSource).not.toContain("source.status");
});

test("Análisis v5 · un ingreso residual o todavía inexistente no fabrica una tasa parcial", () => {
  const snapshot = {
    ...VALID_SNAPSHOT,
    selection: {
      ...VALID_SNAPSHOT.selection,
      range: "1m",
      month: "2026-09",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-16",
      previousDateFrom: "2026-08-01",
      previousDateTo: "2026-08-16",
      partial: true,
      partialMonthStart: "2026-09-01",
    },
    current: {
      ...VALID_SNAPSHOT.current,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-16",
      incomeCents: 38,
      expenseCents: 14121,
      operatingNetCents: -14083,
      savingsCents: -14083,
      savingsRateBps: -3706053,
    },
    comparison: {
      incomeDeltaCents: -1295,
      incomeChangeBps: -9715,
      expenseDeltaCents: -14117,
      expenseChangeBps: -5000,
      netDeltaCents: 12822,
      netChangeBps: 4766,
      savingsDeltaCents: 12822,
      savingsChangeBps: 4766,
      savingsRateDeltaBps: -3504215,
    },
    averages: {
      last3Months: {
        months: 3,
        incomeCents: 217277,
        expenseCents: 128633,
        operatingNetCents: 88644,
        savingsCents: 88644,
        savingsRateBps: 3011,
      },
      last6Months: null,
    },
  } as unknown as AnalysisSnapshot;

  const pending = {
    representative: false,
    valueBps: null,
    deltaBps: null,
    reason: "partial_income_pending",
  } as const;

  expect(resolveSavingsRatePresentation(snapshot)).toEqual(pending);
  expect(resolveSavingsRatePresentation({
    ...snapshot,
    current: {
      ...snapshot.current,
      incomeCents: 0,
      savingsRateBps: null,
    },
  })).toEqual(pending);
});
