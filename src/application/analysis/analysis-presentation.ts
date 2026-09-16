import type { AnalysisSnapshot } from "./analysis-engine";

const MIN_PARTIAL_INCOME_COVERAGE_BPS = 1_000;

export type IncomeComparisonPresentation = {
  representative: boolean;
  changeBps: number | null;
  reason: "available" | "partial_income_pending" | "unavailable";
};

export type SavingsRatePresentation = {
  representative: boolean;
  valueBps: number | null;
  deltaBps: number | null;
  reason: "available" | "partial_income_pending" | "unavailable";
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
