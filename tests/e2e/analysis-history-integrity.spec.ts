import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  buildAnalysisSnapshot,
  type AnalysisGatewaySnapshot,
} from "../../src/application/analysis/analysis-engine";
import { analysisHistoryCoverage } from "../../src/application/analysis/analysis-history-coverage";

function gatewayWithHistory(): AnalysisGatewaySnapshot {
  const history = Array.from({ length: 6 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const incomeCents = index === 4 ? 0 : 100_000;
    const expenseCents = 40_000;
    const savingsCents = incomeCents - expenseCents;
    return {
      monthStart: `2026-${month}-01`,
      rows: 4,
      incomeCents,
      expenseCents,
      operatingNetCents: savingsCents,
      savingsCents,
      savingsRateBps: incomeCents > 0 ? Math.round((savingsCents * 10_000) / incomeCents) : null,
    };
  });

  return {
    current: {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      incomeCents: 100_000,
      expenseCents: 40_000,
      operatingNetCents: 60_000,
      savingsCents: 60_000,
      savingsRateBps: 6_000,
      quality: { includedRows: 4, manuallyExcludedRows: 0, confirmedDuplicateRows: 0 },
    },
    previous: {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      incomeCents: 100_000,
      expenseCents: 40_000,
      operatingNetCents: 60_000,
      savingsCents: 60_000,
      savingsRateBps: 6_000,
    },
    history: { rows: history },
    accounts: [],
    categories: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "General",
      currentExpenseCents: 40_000,
      previousExpenseCents: 40_000,
      currentRows: 4,
      previousRows: 4,
    }],
    merchants: [],
    dailySpend: [],
    weekdaySpend: [],
    amountBands: [],
    concepts: [],
    accountSpend: [],
    topTransactions: [],
    concentration: { top3CategoryBps: 10_000, top3MerchantBps: null },
    anomalies: [],
    fixedVariable: {
      available: false,
      reliableRecurrences: 0,
      fixedExpenseCents: 0,
      variableExpenseCents: 40_000,
    },
    budget: null,
    forecast: null,
  };
}

test("QA-06 · la tasa de ahorro usa ventanas agregadas y un mes sin ingresos no domina el trimestre", () => {
  const snapshot = buildAnalysisSnapshot({
    range: "6m",
    month: "2026-07",
    accountId: null,
    dateFrom: "2026-02-01",
    dateTo: "2026-07-31",
    previousDateFrom: "2025-08-01",
    previousDateTo: "2026-01-31",
    partial: false,
    partialMonthStart: null,
    gateway: gatewayWithHistory(),
  });

  expect(snapshot.averages.last3Months?.savingsRateBps).toBe(4_000);
  expect(snapshot.averages.last6Months?.savingsRateBps).toBe(5_200);
  expect(snapshot.trends.savingsRate).toEqual({
    direction: "down",
    delta: -2_000,
    recentAverage: 4_000,
    previousAverage: 6_000,
    sampleMonths: 6,
  });
  expect(snapshot.trends.expense.sampleMonths).toBe(6);
});

test("REC-ANALYSIS-056 · las ventanas históricas exigen meses continuos y cobertura de sus fechas exactas", () => {
  const snapshot = buildAnalysisSnapshot({
    range: "1m", month: "2026-07", accountId: null,
    dateFrom: "2026-07-01", dateTo: "2026-07-15",
    previousDateFrom: "2026-06-01", previousDateTo: "2026-06-15",
    partial: true, partialMonthStart: "2026-07-01", gateway: gatewayWithHistory(),
  });
  const sync = {
    status: "success", finishedAt: "2026-07-15T10:00:00Z", rowsSeen: 24,
    rowsFailed: 0, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0,
  };
  const source = { available: true, earliestMovementDate: "2026-01-01", latestMovementDate: "2026-07-15", sync };
  // May has real observed transactions but zero income: a genuine zero is valid.
  expect(analysisHistoryCoverage(snapshot, 3, source)).toBe("covered");
  expect(analysisHistoryCoverage(snapshot, 6, source)).toBe("covered");
  expect(analysisHistoryCoverage(snapshot, 3, { ...source, available: false })).toBe("unverified");
  expect(analysisHistoryCoverage(snapshot, 3, { ...source, sync: null })).toBe("unverified");
  expect(analysisHistoryCoverage(snapshot, 3, { ...source, sync: { ...sync, rowsMissing: 1 } })).toBe("unverified");
  expect(analysisHistoryCoverage(snapshot, 3, { ...source, latestMovementDate: "2026-05-31" })).toBe("unverified");
  expect(analysisHistoryCoverage(snapshot, 3, { ...source, earliestMovementDate: "2026-04-01" })).toBe("covered");
  expect(analysisHistoryCoverage(snapshot, 6, { ...source, earliestMovementDate: "2026-04-01" })).toBe("unverified");
  expect(analysisHistoryCoverage({ ...snapshot, history: snapshot.history.slice(0, 2) }, 3, source)).toBe("insufficient");
  const missingMonth = { ...snapshot, history: snapshot.history.filter((row) => row.monthStart !== "2026-05-01") };
  expect(analysisHistoryCoverage(missingMonth, 3, source)).toBe("unverified");
  const duplicatedMonth = structuredClone(snapshot);
  duplicatedMonth.history[4].monthStart = duplicatedMonth.history[3].monthStart;
  expect(analysisHistoryCoverage(duplicatedMonth, 3, source)).toBe("unverified");
});

test("Análisis · la comparación visual no fabrica barra para un valor de cero", () => {
  const source = readFileSync(resolve(process.cwd(), "src/design/contribution-chart.tsx"), "utf8");
  expect(source).toContain("function comparisonBarWidth");
  expect(source).toContain("if (value <= 0) return 0");
  expect(source).not.toContain("Math.max(2, Math.round((row.expenseCents / compareMaximum) * 100))");
});

test("Análisis · el loader valida el snapshot completo antes de entregarlo", () => {
  const source = readFileSync(resolve(process.cwd(), "src/application/analysis/analysis-loader.ts"), "utf8");
  expect(source).toContain('import { isAnalysisSnapshot } from "./analysis-contract"');
  expect(source).toContain("if (!isAnalysisSnapshot(snapshot))");
  expect(source).toContain('throw new Error("analysis_contract_invalid")');
});
