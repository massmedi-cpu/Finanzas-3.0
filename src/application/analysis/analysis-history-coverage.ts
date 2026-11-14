import { periodComparisonIsReliable, resolvePeriodCoverage } from "../data-coverage";
import type { SourceSyncIncidentInput } from "../source-sync-incidents";
import type { AnalysisSnapshot } from "./analysis-engine";

export type HistoryCoverage = "covered" | "unverified" | "insufficient";

/** Assess the exact calendar months used by the engine's historical averages. */
export function analysisHistoryCoverage(
  snapshot: AnalysisSnapshot,
  months: 3 | 6,
  source: {
    available: boolean;
    latestMovementDate: string | null;
    earliestMovementDate: string | null;
    sync: SourceSyncIncidentInput | null;
  },
): HistoryCoverage {
  const history = snapshot.selection.partialMonthStart
    ? snapshot.history.filter((row) => row.monthStart !== snapshot.selection.partialMonthStart)
    : snapshot.history;
  const sample = history.slice(-months);
  if (sample.length < months) return "insufficient";
  if (!source.available) return "unverified";

  // The API can provide empty calendar rows; keep genuine zero months, but
  // never compare a sequence with missing, duplicated or invalid months.
  const serialMonths = sample.map(({ monthStart }) => {
    const match = /^(\d{4})-(0[1-9]|1[0-2])-01$/.exec(monthStart);
    return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
  });
  const first = serialMonths[0];
  if (first === null || serialMonths.some((value, index) => value !== first + index)) {
    return "unverified";
  }

  const lastStart = sample[sample.length - 1].monthStart;
  const year = Number(lastStart.slice(0, 4));
  const month = Number(lastStart.slice(5, 7));
  if (year < 100) return "unverified";
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dateTo = `${lastStart.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  const coverage = resolvePeriodCoverage({
    dateFrom: sample[0].monthStart,
    dateTo,
    latestMovementDate: source.latestMovementDate,
    earliestMovementDate: source.earliestMovementDate,
    sync: source.sync,
    requireCompletedSyncEvidence: true,
  });
  return periodComparisonIsReliable(coverage) ? "covered" : "unverified";
}
