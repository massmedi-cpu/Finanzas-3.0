import { hasCompletedSourceSyncEvidence, hasSourceSyncIncidents, type SourceSyncIncidentInput } from "./source-sync-incidents";

export type PeriodCoverageState = "unknown" | "none" | "partial" | "covered";

export type PeriodCoverage = {
  state: PeriodCoverageState;
  latestMovementDate: string | null;
  throughDate: string | null;
  /** First imported banking date; absence means historic coverage unverified. */
  fromDate?: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | null | undefined) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

/**
 * Describes what can safely be concluded from imported banking coverage.
 * It never changes financial amounts: it only decides whether an observed
 * amount is complete enough to compare or must stay partial/unknown.
 */
export function resolvePeriodCoverage(input: {
  dateFrom: string;
  dateTo: string;
  latestMovementDate: string | null | undefined;
  earliestMovementDate?: string | null | undefined;
  sync?: SourceSyncIncidentInput | null;
  /** Some financial conclusions demand a verifiably finished import, not just date bounds. */
  requireCompletedSyncEvidence?: boolean;
}): PeriodCoverage {
  const latestMovementDate = validDate(input.latestMovementDate);
  const earliestMovementDate = validDate(input.earliestMovementDate);
  const invalidEarliest = input.earliestMovementDate != null && !earliestMovementDate;
  const fromDate = earliestMovementDate ? { fromDate: earliestMovementDate } : {};
  if (!validDate(input.dateFrom) || !validDate(input.dateTo)
    || input.dateFrom > input.dateTo || !latestMovementDate
    || invalidEarliest || (earliestMovementDate !== null && earliestMovementDate > latestMovementDate)) {
    return { state: "unknown", latestMovementDate, throughDate: null, ...fromDate };
  }
  // A period entirely outside the observed bank date bounds is not a
  // confirmed zero. Start and end are both needed to avoid historical gaps.
  if (latestMovementDate < input.dateFrom || (earliestMovementDate !== null && earliestMovementDate > input.dateTo)) {
    return { state: "none", latestMovementDate, throughDate: null, ...fromDate };
  }
  const throughDate = latestMovementDate < input.dateTo ? latestMovementDate : input.dateTo;
  // The backwards-compatible gateway returns only a latest date. That date
  // cannot establish where the historic bank data begins, even when it falls
  // after the end of the selected period. Keep the observed figures visible
  // but never label the historic comparison as fully covered.
  if (earliestMovementDate === null) {
    // Without a first date, a latest movement in a later period gives no
    // evidence that this historical interval has any imported transactions.
    // Never turn that uncertainty into a confirmed zero or even a partial
    // observation. If the latest date itself falls in the interval, at least
    // one imported banking movement is known and partial is justified.
    return latestMovementDate > input.dateTo
      ? { state: "unknown", latestMovementDate, throughDate: null }
      : { state: "partial", latestMovementDate, throughDate };
  }
  // Even good date bounds do not establish a complete data import when the
  // source is still running or its latest sync reports missing/failed rows,
  // duplicates or warnings. Keep observed amounts visible but do not certify
  // their trend or treat the interval as financially complete.
  const syncUnverified = (input.requireCompletedSyncEvidence === true
    && !hasCompletedSourceSyncEvidence(input.sync))
    || (input.sync !== null && input.sync !== undefined
      && !hasCompletedSourceSyncEvidence(input.sync))
    || hasSourceSyncIncidents(input.sync);
  if (latestMovementDate < input.dateTo || earliestMovementDate > input.dateFrom || syncUnverified) {
    return { state: "partial", latestMovementDate, throughDate, ...fromDate };
  }
  // Min/max do NOT certify intervening days or completeness of the source:
  // a richer per-source interval model is still required for full assurance.
  return { state: "covered", latestMovementDate, throughDate, ...fromDate };
}

export function periodHasObservedData(coverage: PeriodCoverage) {
  return coverage.state === "partial" || coverage.state === "covered";
}

export function periodComparisonIsReliable(coverage: PeriodCoverage) {
  return coverage.state === "covered";
}

export function dateHasConfirmedCoverage(date: string, coverage: PeriodCoverage) {
  if (!validDate(date)) return false;
  if (!coverage.throughDate || !coverage.fromDate) return false;
  if (date < coverage.fromDate) return false;
  return (coverage.state === "covered" || coverage.state === "partial")
    && date <= coverage.throughDate;
}
