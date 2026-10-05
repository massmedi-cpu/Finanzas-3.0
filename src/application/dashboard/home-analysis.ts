import type { AnalysisSnapshot } from "../analysis/analysis-engine";

export type HomeAnalysisSummary = {
  contractVersion: 1;
  source: "analysis";
  period: {
    month: string;
    dateFrom: string;
    dateTo: string;
    previousDateFrom: string;
    previousDateTo: string;
  };
  netComparison: {
    currentNetCents: number;
    previousNetCents: number;
    deltaCents: number;
  };
  expenseAverage3m: null | {
    cents: number;
    months: number;
  };
  trends: {
    income: AnalysisSnapshot["trends"]["income"];
    expense: AnalysisSnapshot["trends"]["expense"];
    net: AnalysisSnapshot["trends"]["net"];
  };
  principles: {
    totals: AnalysisSnapshot["principles"]["totals"];
    history: AnalysisSnapshot["principles"]["history"];
    bankSource: AnalysisSnapshot["principles"]["bankSource"];
  };
};

/**
 * Inicio only adapts already-calculated Analysis values. It never rebuilds
 * period totals, comparisons, averages or trends from monthly rows.
 */
export function buildHomeAnalysisSummary(snapshot: AnalysisSnapshot): HomeAnalysisSummary {
  return {
    contractVersion: 1,
    source: "analysis",
    period: {
      month: snapshot.selection.month,
      dateFrom: snapshot.selection.dateFrom,
      dateTo: snapshot.selection.dateTo,
      previousDateFrom: snapshot.selection.previousDateFrom,
      previousDateTo: snapshot.selection.previousDateTo,
    },
    netComparison: {
      currentNetCents: snapshot.current.operatingNetCents,
      previousNetCents: snapshot.previous.operatingNetCents,
      deltaCents: snapshot.comparison.netDeltaCents,
    },
    expenseAverage3m: snapshot.averages.last3Months
      ? {
          cents: snapshot.averages.last3Months.expenseCents,
          months: snapshot.averages.last3Months.months,
        }
      : null,
    trends: {
      income: snapshot.trends.income,
      expense: snapshot.trends.expense,
      net: snapshot.trends.net,
    },
    principles: {
      totals: snapshot.principles.totals,
      history: snapshot.principles.history,
      bankSource: snapshot.principles.bankSource,
    },
  };
}
