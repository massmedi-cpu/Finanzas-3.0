import { resolvePeriodCoverage, type PeriodCoverage } from "../data-coverage";
import type { SourceSyncIncidentInput } from "../source-sync-incidents";

export type HomeBankFreshness = {
  available: boolean;
  earliestMovementDate: string | null;
  latestMovementDate: string | null;
  sync: SourceSyncIncidentInput | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDateOrNull(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function countOrNull(value: unknown) {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

/** Do not turn a successful HTTP response with malformed coverage into bank evidence. */
export function parseHomeBankFreshness(value: unknown): HomeBankFreshness | null {
  if (!record(value) || typeof value.available !== "boolean"
    || !validDateOrNull(value.latestMovementDate)
    || !validDateOrNull(value.earliestMovementDate)) return null;
  if (value.sync !== null) {
    if (!record(value.sync)
      || !["success", "failed", "started", "partial"].includes(String(value.sync.status))
      || (value.sync.finishedAt !== null && typeof value.sync.finishedAt !== "string")
      || (value.sync.startedAt !== null && typeof value.sync.startedAt !== "string")
      || !["rowsSeen", "rowsFailed", "rowsMissing", "duplicatesDetected", "warningsCount"].every((key) =>
        countOrNull((value.sync as Record<string, unknown>)[key]))) {
      return null;
    }
  }
  return value as HomeBankFreshness;
}

/**
 * Home cannot infer complete coverage from its most recent transaction card.
 * The bounds and finished-import evidence must come from the explicit source
 * endpoint, never a dashboard timestamp or a favourable zero.
 */
export function resolveHomeBankCoverage(input: {
  dateFrom: string;
  dateTo: string;
  freshness: HomeBankFreshness | null;
  activityLatestDate?: string | null;
}): PeriodCoverage {
  const freshness = input.freshness;
  if (!freshness?.available || !freshness.latestMovementDate
    || (input.activityLatestDate && input.activityLatestDate !== freshness.latestMovementDate)) {
    return { state: "unknown", latestMovementDate: null, throughDate: null };
  }
  return resolvePeriodCoverage({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    earliestMovementDate: freshness.earliestMovementDate,
    latestMovementDate: freshness.latestMovementDate,
    sync: freshness.sync,
    requireCompletedSyncEvidence: true,
  });
}
