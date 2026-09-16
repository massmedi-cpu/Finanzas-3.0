import type { AnalysisSnapshot } from "./analysis-engine";

const MIN_PARTIAL_INCOME_COVERAGE_BPS = 1_000;

export type IncomeComparisonPresentation = {
  representative: boolean;
  changeBps: number | null;
  reason: "available" | "partial_income_pending" | "unavailable";
};

export type ExpenseComparisonPresentation = {
  representative: boolean;
  changeBps: number | null;
  reason: "available" | "no_previous_expense" | "unavailable";
  label: string | null;
};

export type SavingsRatePresentation = {
  representative: boolean;
  valueBps: number | null;
  deltaBps: number | null;
  reason: "available" | "partial_income_pending" | "unavailable";
};

export type ConcentrationKind = "category" | "merchant";

export type ConcentrationPresentation = {
  available: boolean;
  valueBps: number | null;
  count: number;
  reason: "available" | "no_eligible_spend" | "unavailable";
  label: string | null;
  detail: string | null;
};

export type BudgetProgressPresentation = {
  available: boolean;
  valueBps: number | null;
  reason: "available" | "empty" | "unfunded" | "unavailable";
  label: string;
};

function referenceIncomeCents(snapshot: AnalysisSnapshot) {
  const last3 = snapshot.averages.last3Months?.incomeCents ?? null;
  if (last3 !== null && last3 > 0) return last3;

  const last6 = snapshot.averages.last6Months?.incomeCents ?? null;
  if (last6 !== null && last6 > 0) return last6;

  return null;
}

function partialIncomePending(snapshot: AnalysisSnapshot) {
  if (!snapshot.selection.partial) return false;

  const referenceIncome = referenceIncomeCents(snapshot);
  if (referenceIncome === null) return false;

  const coverageBps = Math.round((snapshot.current.incomeCents * 10_000) / referenceIncome);
  return coverageBps < MIN_PARTIAL_INCOME_COVERAGE_BPS;
}

export function resolveIncomeComparisonPresentation(
  snapshot: AnalysisSnapshot,
): IncomeComparisonPresentation {
  if (partialIncomePending(snapshot)) {
    return {
      representative: false,
      changeBps: null,
      reason: "partial_income_pending",
    };
  }

  if (snapshot.comparison.incomeChangeBps === null) {
    return {
      representative: false,
      changeBps: null,
      reason: "unavailable",
    };
  }

  return {
    representative: true,
    changeBps: snapshot.comparison.incomeChangeBps,
    reason: "available",
  };
}

export function resolveExpenseComparisonPresentation(
  snapshot: AnalysisSnapshot,
): ExpenseComparisonPresentation {
  if (snapshot.previous.expenseCents === 0) {
    return {
      representative: false,
      changeBps: null,
      reason: "no_previous_expense",
      label: snapshot.current.expenseCents === 0
        ? "Sin gasto en ambos periodos"
        : "Sin base comparable · periodo anterior sin gasto",
    };
  }

  if (snapshot.comparison.expenseChangeBps === null) {
    return {
      representative: false,
      changeBps: null,
      reason: "unavailable",
      label: "Comparación no disponible",
    };
  }

  return {
    representative: true,
    changeBps: snapshot.comparison.expenseChangeBps,
    reason: "available",
    label: null,
  };
}

export function resolveConcentrationPresentation(
  snapshot: AnalysisSnapshot,
  kind: ConcentrationKind,
): ConcentrationPresentation {
  const items = kind === "merchant" ? snapshot.merchantDrivers : snapshot.categoryDrivers;
  const valueBps = kind === "merchant"
    ? snapshot.concentration.top3MerchantBps
    : snapshot.concentration.top3CategoryBps;
  const count = Math.min(3, Math.max(0, items.length));

  if (snapshot.current.expenseCents === 0 || count === 0) {
    return {
      available: false,
      valueBps: null,
      count,
      reason: "no_eligible_spend",
      label: "Sin gasto elegible",
      detail: kind === "merchant"
        ? "no hay comercios con gasto en el periodo"
        : "no hay categorías con gasto en el periodo",
    };
  }

  if (valueBps === null) {
    return {
      available: false,
      valueBps: null,
      count,
      reason: "unavailable",
      label: "Concentración no disponible",
      detail: null,
    };
  }

  return {
    available: true,
    valueBps,
    count,
    reason: "available",
    label: null,
    detail: null,
  };
}

export function prepareAnalysisPresentationSnapshot(
  snapshot: AnalysisSnapshot,
): AnalysisSnapshot {
  const incomeComparison = resolveIncomeComparisonPresentation(snapshot);
  if (incomeComparison.representative || snapshot.comparison.incomeChangeBps === null) {
    return snapshot;
  }

  return {
    ...snapshot,
    comparison: {
      ...snapshot.comparison,
      incomeChangeBps: null,
    },
  };
}

export function resolveSavingsRatePresentation(snapshot: AnalysisSnapshot): SavingsRatePresentation {
  if (partialIncomePending(snapshot)) {
    return {
      representative: false,
      valueBps: null,
      deltaBps: null,
      reason: "partial_income_pending",
    };
  }

  if (snapshot.current.savingsRateBps === null) {
    return {
      representative: false,
      valueBps: null,
      deltaBps: null,
      reason: "unavailable",
    };
  }

  return {
    representative: true,
    valueBps: snapshot.current.savingsRateBps,
    deltaBps: snapshot.comparison.savingsRateDeltaBps,
    reason: "available",
  };
}

export type BudgetSourcePresentation = {
  kind: "manual" | "automatic" | "unknown";
  label: string | null;
};

export function resolveBudgetSourcePresentation(
  total: NonNullable<NonNullable<AnalysisSnapshot["budget"]>["total"]>,
): BudgetSourcePresentation {
  if (total.manualAmountCents !== undefined && total.manualAmountCents !== null) {
    return { kind: "manual", label: "Límite manual" };
  }

  if (total.automaticAmountCents !== undefined) {
    return { kind: "automatic", label: "Referencia automática · media de 3 meses" };
  }

  return { kind: "unknown", label: null };
}

export function resolveBudgetProgressPresentation(
  total: NonNullable<NonNullable<AnalysisSnapshot["budget"]>["total"]>,
): BudgetProgressPresentation {
  if (total.progressBps !== null) {
    return {
      available: true,
      valueBps: total.progressBps,
      reason: "available",
      label: "consumido",
    };
  }

  if (total.status === "empty") {
    return {
      available: false,
      valueBps: null,
      reason: "empty",
      label: "Sin límite ni gasto",
    };
  }

  if (total.status === "unfunded") {
    return {
      available: false,
      valueBps: null,
      reason: "unfunded",
      label: "Gasto sin límite configurado",
    };
  }

  return {
    available: false,
    valueBps: null,
    reason: "unavailable",
    label: "Progreso no disponible",
  };
}
