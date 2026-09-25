import { expect, test } from "@playwright/test";
import {
  assembleBudgetPlanning,
  budgetPlanningRange,
  isBudgetSnapshot,
  type BudgetSnapshot,
} from "../../src/application/budgets/budget-planning";

function snapshot(manualAmountCents: number | null): BudgetSnapshot {
  const automaticAmountCents = 120_000;
  const effectiveAmountCents = manualAmountCents ?? automaticAmountCents;
  const actualExpenseCents = 40_000;
  return {
    contractVersion: 1,
    month: "2026-09",
    monthStart: "2026-09-01",
    monthEnd: "2026-09-30",
    total: {
      id: null,
      persisted: false,
      categoryId: null,
      categoryName: null,
      categoryLifecycle: null,
      automaticAmountCents,
      manualAmountCents,
      effectiveAmountCents,
      actualExpenseCents,
      remainingCents: effectiveAmountCents - actualExpenseCents,
      progressBps: Math.round((actualExpenseCents * 10_000) / effectiveAmountCents),
      status: "on_track",
      automaticExplanation: "Media del gasto elegible de los 3 meses completos anteriores.",
      historyMonths: [
        { month: "2026-06", expenseCents: 100_000 },
        { month: "2026-07", expenseCents: 120_000 },
        { month: "2026-08", expenseCents: 140_000 },
      ],
    },
    categories: [],
    principles: {
      bankSource: "read_only",
      actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average",
      transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false,
      manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false,
      manualOverrideWins: true,
      parentCategoryIncludesDescendants: true,
    },
  };
}

function monthly(incomes = [190_000, 200_000, 210_000], expenses = [100_000, 120_000, 140_000]) {
  return {
    dateFrom: "2026-06-01",
    dateTo: "2026-08-31",
    accountId: null,
    rows: ["2026-06", "2026-07", "2026-08"].map((month, index) => {
      const incomeCents = incomes[index] ?? 0;
      const expenseCents = expenses[index] ?? 0;
      const savingsCents = incomeCents - expenseCents;
      return {
        monthStart: `${month}-01`,
        rows: 2,
        incomeCents,
        expenseCents,
        operatingNetCents: savingsCents,
        savingsCents,
      };
    }),
  };
}

test("PRE-022 separa referencia histórica, límite elegido y objetivo de ahorro", () => {
  const result = assembleBudgetPlanning(snapshot(100_000), monthly());

  expect(result.planning).toMatchObject({
    state: "ready",
    objectiveState: "ready",
    historicalBaselineCents: 120_000,
    selectedLimitCents: 100_000,
    trackingReferenceCents: 100_000,
    differenceFromBaselineCents: -20_000,
    averageIncomeCents: 200_000,
    targetSavingsCents: 100_000,
    targetSavingsRateBps: 5_000,
  });
  expect(result.planning.principles).toEqual({
    historicalBaseline: "trailing_3_complete_month_expense_average",
    chosenLimit: "manual_total_budget_only",
    objective: "average_income_minus_chosen_limit",
    incomeSource: "financial_monthly_series",
    financialAdvice: false,
  });
});

test("PRE-022 no convierte la media histórica en un objetivo cuando falta límite elegido", () => {
  const result = assembleBudgetPlanning(snapshot(null), monthly());

  expect(result.planning.state).toBe("ready");
  expect(result.planning.objectiveState).toBe("needs_limit");
  expect(result.planning.historicalBaselineCents).toBe(120_000);
  expect(result.planning.selectedLimitCents).toBeNull();
  expect(result.planning.targetSavingsCents).toBeNull();
  expect(result.planning.targetSavingsRateBps).toBeNull();
});

test("PRE-022 falla cerrado si ingresos y gasto histórico no concilian", () => {
  const result = assembleBudgetPlanning(snapshot(100_000), monthly(undefined, [100_000, 120_000, 139_999]));

  expect(result.planning.state).toBe("mismatch");
  expect(result.planning.objectiveState).toBe("mismatch");
  expect(result.planning.averageIncomeCents).toBeNull();
  expect(result.planning.targetSavingsCents).toBeNull();

  const invalidBaseline = snapshot(100_000);
  invalidBaseline.total.automaticAmountCents = 119_999;
  const invalidBaselineResult = assembleBudgetPlanning(invalidBaseline, monthly());
  expect(invalidBaselineResult.planning.state).toBe("mismatch");

  const unsafeIncomeResult = assembleBudgetPlanning(
    snapshot(100_000),
    monthly([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]),
  );
  expect(unsafeIncomeResult.planning.state).toBe("mismatch");

  const unsafeRateSnapshot = snapshot(Number.MAX_SAFE_INTEGER);
  const unsafeRateResult = assembleBudgetPlanning(unsafeRateSnapshot, monthly([1, 1, 1]));
  expect(unsafeRateResult.planning.state).toBe("mismatch");
});

test("PRE-022 degrada sólo el contexto de ingresos si la serie financiera no está disponible", () => {
  const result = assembleBudgetPlanning(snapshot(100_000), null);

  expect(result.total.effectiveAmountCents).toBe(100_000);
  expect(result.planning.state).toBe("unavailable");
  expect(result.planning.objectiveState).toBe("unavailable");
  expect(result.planning.historicalBaselineCents).toBe(120_000);
  expect(result.planning.selectedLimitCents).toBe(100_000);
});

test("PRE-022 no fabrica sostenibilidad sin ingresos y resuelve el rango entre años", () => {
  const result = assembleBudgetPlanning(snapshot(100_000), monthly([0, 0, 0]));

  expect(result.planning.state).toBe("ready");
  expect(result.planning.objectiveState).toBe("no_income");
  expect(result.planning.averageIncomeCents).toBe(0);
  expect(result.planning.targetSavingsCents).toBeNull();
  expect(budgetPlanningRange("2026-01")).toEqual({
    months: ["2025-10", "2025-11", "2025-12"],
    dateFrom: "2025-10-01",
    dateTo: "2025-12-31",
  });
});

test("PRE-022 valida el contrato del motor antes de componer la planificación", () => {
  expect(isBudgetSnapshot(snapshot(null))).toBe(true);
  expect(isBudgetSnapshot({ ...snapshot(null), contractVersion: 2 })).toBe(false);
  expect(isBudgetSnapshot({ ...snapshot(null), total: null })).toBe(false);
  expect(isBudgetSnapshot({ ...snapshot(null), monthEnd: "2026-09-29" })).toBe(false);
  expect(isBudgetSnapshot({
    ...snapshot(null),
    total: { ...snapshot(null).total, automaticAmountCents: 12.5 },
  })).toBe(false);
});
