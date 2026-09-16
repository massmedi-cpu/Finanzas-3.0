import { expect, test } from "@playwright/test";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import {
  resolveBudgetProgressPresentation,
  resolveConcentrationPresentation,
  resolveExpenseComparisonPresentation,
} from "../../src/application/analysis/analysis-presentation";

function presentationSnapshot(input: {
  currentExpenseCents: number;
  previousExpenseCents: number;
  expenseChangeBps: number | null;
  merchantCount?: number;
  categoryCount?: number;
  top3MerchantBps?: number | null;
  top3CategoryBps?: number | null;
}): AnalysisSnapshot {
  const merchantCount = input.merchantCount ?? 0;
  const categoryCount = input.categoryCount ?? 0;

  return {
    current: { expenseCents: input.currentExpenseCents },
    previous: { expenseCents: input.previousExpenseCents },
    comparison: { expenseChangeBps: input.expenseChangeBps },
    merchantDrivers: Array.from({ length: merchantCount }, (_, index) => ({ id: `merchant-${index}` })),
    categoryDrivers: Array.from({ length: categoryCount }, (_, index) => ({ id: `category-${index}` })),
    concentration: {
      top3MerchantBps: input.top3MerchantBps ?? null,
      top3CategoryBps: input.top3CategoryBps ?? null,
    },
  } as unknown as AnalysisSnapshot;
}

test("E2 · gastos sin periodo previo explican por qué no hay porcentaje comparable", () => {
  const withCurrentSpend = presentationSnapshot({
    currentExpenseCents: 12500,
    previousExpenseCents: 0,
    expenseChangeBps: null,
  });
  expect(resolveExpenseComparisonPresentation(withCurrentSpend)).toEqual({
    representative: false,
    changeBps: null,
    reason: "no_previous_expense",
    label: "Sin base comparable · periodo anterior sin gasto",
  });

  const withoutSpend = presentationSnapshot({
    currentExpenseCents: 0,
    previousExpenseCents: 0,
    expenseChangeBps: null,
  });
  expect(resolveExpenseComparisonPresentation(withoutSpend).label).toBe("Sin gasto en ambos periodos");
});

test("E2 · gastos con base previa conservan el porcentaje real", () => {
  const snapshot = presentationSnapshot({
    currentExpenseCents: 12500,
    previousExpenseCents: 10000,
    expenseChangeBps: 2500,
  });
  expect(resolveExpenseComparisonPresentation(snapshot)).toEqual({
    representative: true,
    changeBps: 2500,
    reason: "available",
    label: null,
  });
});

test("E2 · concentración sin gasto elegible muestra un estado explícito en lugar de un guion", () => {
  const snapshot = presentationSnapshot({
    currentExpenseCents: 0,
    previousExpenseCents: 10000,
    expenseChangeBps: -10000,
  });

  expect(resolveConcentrationPresentation(snapshot, "merchant")).toEqual({
    available: false,
    valueBps: null,
    count: 0,
    reason: "no_eligible_spend",
    label: "Sin gasto elegible",
    detail: "no hay comercios con gasto en el periodo",
  });
  expect(resolveConcentrationPresentation(snapshot, "category").detail).toBe("no hay categorías con gasto en el periodo");
});

test("E2 · concentración conserva porcentaje y número real de grupos cuando hay gasto", () => {
  const snapshot = presentationSnapshot({
    currentExpenseCents: 50000,
    previousExpenseCents: 40000,
    expenseChangeBps: 2500,
    merchantCount: 2,
    categoryCount: 4,
    top3MerchantBps: 6500,
    top3CategoryBps: 8200,
  });

  expect(resolveConcentrationPresentation(snapshot, "merchant")).toMatchObject({
    available: true,
    valueBps: 6500,
    count: 2,
    reason: "available",
  });
  expect(resolveConcentrationPresentation(snapshot, "category")).toMatchObject({
    available: true,
    valueBps: 8200,
    count: 3,
    reason: "available",
  });
});

test("E2 · presupuesto con límite cero explica empty y unfunded sin mostrar un porcentaje indefinido", () => {
  const base = {
    automaticAmountCents: 0,
    manualAmountCents: null,
    effectiveAmountCents: 0,
    actualExpenseCents: 0,
    remainingCents: 0,
    progressBps: null,
    status: "empty",
  };

  expect(resolveBudgetProgressPresentation(base)).toEqual({
    available: false,
    valueBps: null,
    reason: "empty",
    label: "Sin límite ni gasto",
  });

  expect(resolveBudgetProgressPresentation({
    ...base,
    actualExpenseCents: 12500,
    remainingCents: -12500,
    status: "unfunded",
  })).toEqual({
    available: false,
    valueBps: null,
    reason: "unfunded",
    label: "Gasto sin límite configurado",
  });

  expect(resolveBudgetProgressPresentation({
    ...base,
    automaticAmountCents: 100000,
    effectiveAmountCents: 100000,
    actualExpenseCents: 25000,
    remainingCents: 75000,
    progressBps: 2500,
    status: "on_track",
  })).toEqual({
    available: true,
    valueBps: 2500,
    reason: "available",
    label: "consumido",
  });
});
