import { periodComparisonIsReliable, type PeriodCoverage } from "../data-coverage";
import { resolveHomeBankCoverage, type HomeBankFreshness } from "./home-bank-coverage";

/**
 * A calculated three-month average is not a trustworthy current balance:
 * it is only presentable once the whole source interval has proven banking
 * coverage. In particular, an upper date alone cannot verify historic zeros.
 */
export function getHomeExpenseAverageCoverage(input: {
  periodEnd: string;
  months: number;
  freshness: HomeBankFreshness | null;
  activityLatestDate: string | null;
}): PeriodCoverage | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)
    || !Number.isSafeInteger(input.months)
    || input.months < 1 || input.months > 3) return null;
  const periodEnd = new Date(`${input.periodEnd}T00:00:00Z`);
  if (!Number.isFinite(periodEnd.getTime()) || periodEnd.toISOString().slice(0, 10) !== input.periodEnd) return null;
  const from = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - input.months + 1, 1));
  const dateFrom = from.toISOString().slice(0, 10);
  return resolveHomeBankCoverage({
    dateFrom,
    dateTo: input.periodEnd,
    freshness: input.freshness,
    activityLatestDate: input.activityLatestDate,
  });
}

export function isHomeExpenseAverageVerified(input: {
  periodEnd: string;
  months: number;
  freshness: HomeBankFreshness | null;
  activityLatestDate: string | null;
}): boolean {
  const coverage = getHomeExpenseAverageCoverage(input);
  return coverage !== null && periodComparisonIsReliable(coverage);
}
