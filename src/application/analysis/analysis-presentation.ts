import type { AnalysisSnapshot } from "./analysis-engine";

const MIN_PARTIAL_INCOME_COVERAGE_BPS = 1_000;

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

export function resolveSavingsRatePresentation(snapshot: AnalysisSnapshot): SavingsRatePresentation {
  if (snapshot.selection.partial) {
    const referenceIncome = referenceIncomeCents(snapshot);
    if (referenceIncome !== null) {
      const coverageBps = Math.round((snapshot.current.incomeCents * 10_000) / referenceIncome);
      if (coverageBps < MIN_PARTIAL_INCOME_COVERAGE_BPS) {
        return {
          representative: false,
          valueBps: null,
          deltaBps: null,
          reason: "partial_income_pending",
        };
      }
    }
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
