import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  buildAnalysisSnapshot,
  type AnalysisGatewaySnapshot,
  type AnalysisMonthlyRow,
} from "../../src/application/analysis/analysis-engine";

const CORE_SQL = "supabase/migrations/20260905225500_phase5_financial_logic_core.sql";

function zeroPeriod(dateFrom: string, dateTo: string) {
  return {
    dateFrom,
    dateTo,
    incomeCents: 0,
    expenseCents: 0,
    operatingNetCents: 0,
    savingsCents: 0,
    savingsRateBps: null,
    quality: {
      scopedRows: 0,
      includedRows: 0,
      manuallyExcludedRows: 0,
      confirmedDuplicateRows: 0,
      suspectedDuplicateRows: 0,
      signMismatchRows: 0,
    },
  };
}

function gateway(history: AnalysisMonthlyRow[] = []): AnalysisGatewaySnapshot {
  return {
    current: zeroPeriod("2026-01-01", "2026-04-15"),
    previous: zeroPeriod("2025-09-01", "2025-12-31"),
    history: { rows: history },
    accounts: [],
    categories: [],
    merchants: [],
    dailySpend: [],
    weekdaySpend: [],
    amountBands: [],
    concepts: [],
    accountSpend: [],
    topTransactions: [],
    concentration: { top3CategoryBps: null, top3MerchantBps: null },
    anomalies: [],
    fixedVariable: {
      available: false,
      reliableRecurrences: 0,
      fixedExpenseCents: 0,
      variableExpenseCents: 0,
    },
    budget: null,
    forecast: null,
  };
}

function month(
  monthStart: string,
  incomeCents = 100_000,
  expenseCents = 40_000,
): AnalysisMonthlyRow {
  const savingsCents = incomeCents - expenseCents;
  return {
    monthStart,
    rows: 2,
    incomeCents,
    expenseCents,
    operatingNetCents: savingsCents,
    savingsCents,
    savingsRateBps: incomeCents > 0
      ? Math.round((savingsCents * 10_000) / incomeCents)
      : null,
  };
}

test("10.0.32 · una cuenta vacía produce un snapshot explícito y finito, no datos inventados", () => {
  const snapshot = buildAnalysisSnapshot({
    range: "1m",
    month: "2026-04",
    accountId: null,
    dateFrom: "2026-04-01",
    dateTo: "2026-04-15",
    previousDateFrom: "2026-03-01",
    previousDateTo: "2026-03-15",
    partial: true,
    partialMonthStart: "2026-04-01",
    gateway: gateway(),
  });

  expect(snapshot.accounts).toEqual([]);
  expect(snapshot.current).toMatchObject({
    incomeCents: 0,
    expenseCents: 0,
    operatingNetCents: 0,
    savingsCents: 0,
    savingsRateBps: null,
  });
  expect(snapshot.categoryDrivers).toEqual([]);
  expect(snapshot.merchantDrivers).toEqual([]);
  expect(snapshot.topTransactions).toEqual([]);
  expect(snapshot.averages.last3Months).toBeNull();
  expect(snapshot.averages.last6Months).toBeNull();
  expect(snapshot.trends.expense.direction).toBe("insufficient");
});

test("10.0.32 · duplicados confirmados no contaminan analítica y los sospechosos siguen visibles como calidad", () => {
  const sql = readFileSync(CORE_SQL, "utf8");

  expect(sql).toContain("(t.duplicate_state <> 'confirmed' and not coalesce(o.excluded_from_analytics,false)) as analytics_eligible");
  expect(sql).toContain("select * from scoped where analytics_eligible");
  expect(sql).toContain("count(*) filter (where duplicate_state='confirmed')::int as confirmed_duplicate_rows");
  expect(sql).toContain("count(*) filter (where duplicate_state='suspected')::int as suspected_duplicate_rows");
  expect(sql).toContain("t.duplicate_state<>'confirmed'");
});

test("10.0.32 · un año incompleto excluye el mes parcial de medias y no completa historial ficticio", () => {
  const snapshot = buildAnalysisSnapshot({
    range: "ytd",
    month: "2026-04",
    accountId: null,
    dateFrom: "2026-01-01",
    dateTo: "2026-04-15",
    previousDateFrom: "2025-09-01",
    previousDateTo: "2025-12-31",
    partial: true,
    partialMonthStart: "2026-04-01",
    gateway: gateway([
      month("2026-01-01", 100_000, 30_000),
      month("2026-02-01", 110_000, 40_000),
      month("2026-03-01", 120_000, 50_000),
      month("2026-04-01", 9_999_999, 9_000_000),
    ]),
  });

  expect(snapshot.selection.partial).toBe(true);
  expect(snapshot.selection.partialMonthStart).toBe("2026-04-01");
  expect(snapshot.averages.last3Months).toMatchObject({
    months: 3,
    incomeCents: 110_000,
    expenseCents: 40_000,
  });
  expect(snapshot.averages.last6Months).toBeNull();
  expect(snapshot.trends.income.direction).toBe("insufficient");
  expect(snapshot.trends.income.sampleMonths).toBe(3);
});

test("10.0.32 · la serie mensual atraviesa diciembre y enero sin una condición especial de año", () => {
  const sql = readFileSync(CORE_SQL, "utf8");
  expect(sql).toContain(
    "generate_series(date_trunc('month',v_date_from::timestamp),date_trunc('month',v_date_to::timestamp),interval '1 month')::date as month_start",
  );

  const snapshot = buildAnalysisSnapshot({
    range: "6m",
    month: "2026-02",
    accountId: null,
    dateFrom: "2025-11-01",
    dateTo: "2026-02-28",
    previousDateFrom: "2025-07-01",
    previousDateTo: "2025-10-31",
    partial: false,
    partialMonthStart: null,
    gateway: gateway([
      month("2025-11-01"),
      month("2025-12-01"),
      month("2026-01-01"),
      month("2026-02-01"),
    ]),
  });

  expect(snapshot.history.map((row) => row.monthStart)).toEqual([
    "2025-11-01",
    "2025-12-01",
    "2026-01-01",
    "2026-02-01",
  ]);
  expect(snapshot.averages.last3Months?.months).toBe(3);
});

test("10.0.32 · con histórico insuficiente las tendencias se declaran insuficientes", () => {
  const snapshot = buildAnalysisSnapshot({
    range: "6m",
    month: "2026-02",
    accountId: null,
    dateFrom: "2026-01-01",
    dateTo: "2026-02-28",
    previousDateFrom: "2025-11-01",
    previousDateTo: "2025-12-31",
    partial: false,
    partialMonthStart: null,
    gateway: gateway([
      month("2026-01-01"),
      month("2026-02-01"),
    ]),
  });

  for (const trend of Object.values(snapshot.trends)) {
    expect(trend.direction).toBe("insufficient");
    expect(trend.delta).toBeNull();
    expect(trend.recentAverage).toBeNull();
    expect(trend.previousAverage).toBeNull();
  }
  expect(snapshot.averages.last3Months).toBeNull();
  expect(snapshot.averages.last6Months).toBeNull();
});

test("10.0.32 · el núcleo mantiene fuente bancaria de solo lectura y ajustes manuales separados", () => {
  const sql = readFileSync(CORE_SQL, "utf8");
  const management = readFileSync(
    "supabase/functions/financial-app-db-gateway/transaction-management.ts",
    "utf8",
  );

  expect(sql).toContain("left join financial_app.transaction_overrides o on o.transaction_id=t.id");
  expect(management).toContain("financial_app.apply_transaction_override_patch");
  expect(management).toContain("test_transaction_management_source_mutated");
  expect(management).toContain("test_transaction_management_clear_override_failed");
});

test("10.0.32 · recurrentes irregulares conservan ciclos omitidos, caducidad y confianza explícita", () => {
  const recurrences = readFileSync("tests/e2e/recurrences.spec.ts", "utf8");

  expect(recurrences).toContain("missedCycles: 1");
  expect(recurrences).toContain("stale: true");
  expect(recurrences).toContain('observedConfidence: "high"');
  expect(recurrences).toContain('confidence: "medium"');
  expect(recurrences).toContain("1 ciclo no observado");
  expect(recurrences).toContain("missedCyclesReduceConfidence: true");
});
