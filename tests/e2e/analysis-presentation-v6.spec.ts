import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import {
  prepareAnalysisPresentationSnapshot,
  resolveIncomeComparisonPresentation,
} from "../../src/application/analysis/analysis-presentation";

function partialSnapshot(incomeCents = 38): AnalysisSnapshot {
  return {
    contractVersion: 2,
    selection: {
      range: "1m",
      month: "2026-09",
      accountId: null,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-16",
      previousDateFrom: "2026-08-01",
      previousDateTo: "2026-08-16",
      partial: true,
      partialMonthStart: "2026-09-01",
    },
    current: {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-16",
      incomeCents,
      expenseCents: 14121,
      operatingNetCents: incomeCents - 14121,
      savingsCents: incomeCents - 14121,
      savingsRateBps: incomeCents > 0 ? Math.round(((incomeCents - 14121) * 10_000) / incomeCents) : null,
    },
    previous: {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-16",
      incomeCents: 1333,
      expenseCents: 28238,
      operatingNetCents: -26905,
      savingsCents: -26905,
      savingsRateBps: -201838,
    },
    comparison: {
      incomeDeltaCents: incomeCents - 1333,
      incomeChangeBps: Math.round(((incomeCents - 1333) * 10_000) / 1333),
      expenseDeltaCents: -14117,
      expenseChangeBps: -5000,
      netDeltaCents: incomeCents - 14121 + 26905,
      netChangeBps: null,
      savingsDeltaCents: incomeCents - 14121 + 26905,
      savingsChangeBps: null,
      savingsRateDeltaBps: null,
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
    history: [],
    trends: {
      income: { direction: "insufficient", delta: null, recentAverage: null, previousAverage: null, sampleMonths: 0 },
      expense: { direction: "insufficient", delta: null, recentAverage: null, previousAverage: null, sampleMonths: 0 },
      savings: { direction: "insufficient", delta: null, recentAverage: null, previousAverage: null, sampleMonths: 0 },
      net: { direction: "insufficient", delta: null, recentAverage: null, previousAverage: null, sampleMonths: 0 },
      savingsRate: { direction: "insufficient", delta: null, recentAverage: null, previousAverage: null, sampleMonths: 0 },
    },
    categoryDrivers: [],
    merchantDrivers: [],
    changeDrivers: [],
    concentration: { top3CategoryBps: null, top3MerchantBps: null },
    anomalies: [],
    fixedVariable: {
      available: false,
      reliableRecurrences: 0,
      fixedExpenseCents: 0,
      variableExpenseCents: 14121,
      fixedShareBps: null,
    },
    budget: null,
    forecast: null,
    accounts: [],
    quality: {
      reconciled: true,
      categoryExpenseCents: 14121,
      expenseRows: 6,
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
}

test("Análisis v6 · un ingreso residual parcial conserva el importe pero no fabrica un porcentaje", () => {
  const snapshot = partialSnapshot(38);

  expect(resolveIncomeComparisonPresentation(snapshot)).toEqual({
    representative: false,
    changeBps: null,
    reason: "partial_income_pending",
  });

  const presented = prepareAnalysisPresentationSnapshot(snapshot);
  expect(presented.current.incomeCents).toBe(38);
  expect(presented.comparison.incomeDeltaCents).toBe(snapshot.comparison.incomeDeltaCents);
  expect(presented.comparison.incomeChangeBps).toBeNull();
});

test("Análisis v6 · un ingreso parcial ya representativo conserva su comparación real", () => {
  const snapshot = partialSnapshot(210000);
  const presented = prepareAnalysisPresentationSnapshot(snapshot);

  expect(resolveIncomeComparisonPresentation(snapshot).representative).toBe(true);
  expect(presented.comparison.incomeChangeBps).toBe(snapshot.comparison.incomeChangeBps);
});

test("Análisis v7 · la concentración visible usa sólo grupos con gasto actual y no presupone siempre tres", () => {
  const source = readFileSync(resolve(process.cwd(), "app/analysis/analysis-client.tsx"), "utf8");

  expect(source).toContain("function topConcentrationContext");
  expect(source).toContain("currentExpenseDrivers(snapshot.merchantDrivers)");
  expect(source).toContain("currentExpenseDrivers(snapshot.categoryDrivers)");
  expect(source).toContain('topConcentrationContext(merchantConcentration.count, "comercio", "comercios")');
  expect(source).toContain('topConcentrationContext(categoryConcentrationPresentation.count, "categoría", "categorías")');
  expect(source).toContain('href="#comercios-heading"');
  expect(source).not.toContain("del gasto en 3 comercios");
  expect(source).not.toContain("en 3 categorías</span>");
  expect(source).not.toContain("en los 3 primeros</span>");
});

test("Análisis v7 · la UI explica por qué la comparación de ingresos parciales está pendiente", () => {
  const source = readFileSync(resolve(process.cwd(), "app/analysis/analysis-client.tsx"), "utf8");

  expect(source).toContain("resolveIncomeComparisonPresentation(snapshot)");
  expect(source).toContain("Comparación pendiente · ingresos aún no representativos");
  expect(source).not.toContain('comparison={`${formatPercentBps(snapshot.comparison.incomeChangeBps, true)} vs. periodo anterior`}');
});

test("Análisis · los estados auxiliares evitan guiones ambiguos y usan lenguaje de comercios", () => {
  const source = readFileSync(resolve(process.cwd(), "app/analysis/analysis-client.tsx"), "utf8");

  expect(source).toContain('forecast ? "Sin previsiones" : "Fuera del periodo"');
  expect(source).toContain('"previsión no aplicable al periodo"');
  expect(source).toContain('items.length === 1 ? "comercio" : "comercios"');
  expect(source).toContain('>Sin filtro</span>');
  expect(source).not.toContain('forecast ? "Sin previsiones" : "—"');
  expect(source).not.toContain('<span className={styles.noLink}>—</span>');
});
