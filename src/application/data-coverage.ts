export type PeriodCoverageState = "unknown" | "none" | "partial" | "covered";

export type PeriodCoverage = {
  state: PeriodCoverageState;
  latestMovementDate: string | null;
  throughDate: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | null | undefined) {
  return typeof value === "string" && ISO_DATE.test(value) ? value : null;
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
}): PeriodCoverage {
  const latestMovementDate = validDate(input.latestMovementDate);
  if (!validDate(input.dateFrom) || !validDate(input.dateTo) || !latestMovementDate) {
    return { state: "unknown", latestMovementDate, throughDate: null };
  }
  if (latestMovementDate < input.dateFrom) {
    return { state: "none", latestMovementDate, throughDate: null };
  }
  if (latestMovementDate < input.dateTo) {
    return { state: "partial", latestMovementDate, throughDate: latestMovementDate };
  }
  return { state: "covered", latestMovementDate, throughDate: input.dateTo };
}

export function periodHasObservedData(coverage: PeriodCoverage) {
  return coverage.state === "partial" || coverage.state === "covered";
}

export function periodComparisonIsReliable(coverage: PeriodCoverage) {
  return coverage.state === "covered";
}

export function dateHasConfirmedCoverage(date: string, coverage: PeriodCoverage) {
  if (!validDate(date)) return false;
  if (coverage.state === "covered") return true;
  return coverage.state === "partial"
    && Boolean(coverage.throughDate)
    && date <= coverage.throughDate!;
}
