export type SourceSyncIncidentInput = {
  status?: string | null;
  finishedAt?: string | null;
  rowsSeen?: number | null;
  rowsFailed?: number | null;
  rowsMissing?: number | null;
  duplicatesDetected?: number | null;
  warningsCount?: number | null;
  errorCode?: string | null;
};

export type SourceSyncIncidentCounts = {
  failedRows: number;
  missingRows: number;
  duplicates: number;
  additionalWarnings: number;
};

function nonNegativeCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

export function normalizeSourceSyncIncidents(
  value: SourceSyncIncidentInput | null | undefined,
): SourceSyncIncidentCounts {
  const failedRows = nonNegativeCount(value?.rowsFailed);
  const missingRows = nonNegativeCount(value?.rowsMissing);
  const duplicates = nonNegativeCount(value?.duplicatesDetected);
  const warnings = nonNegativeCount(value?.warningsCount);

  return {
    failedRows,
    missingRows,
    duplicates,
    additionalWarnings: Math.max(0, warnings - missingRows),
  };
}

export function hasSourceSyncIncidents(
  value: SourceSyncIncidentInput | null | undefined,
) {
  const counts = normalizeSourceSyncIncidents(value);
  return value?.status === "failed"
    || value?.status === "partial"
    || Boolean(value?.errorCode)
    || counts.failedRows > 0
    || counts.missingRows > 0
    || counts.duplicates > 0
    || counts.additionalWarnings > 0;
}

// "success" without an actual end-time and complete integer counters is not
// proof of a finished import, even if min/max movement dates exist.
// This is deliberately separate from incident detection: a completed run
// may still contain failures and must then be shown as partial/warning.
export function hasCompletedSourceSyncEvidence(value: SourceSyncIncidentInput | null | undefined) {
  if (value?.status !== "success") return false;
  const ended = value.finishedAt;
  return typeof ended === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(ended)
    && Number.isFinite(Date.parse(ended))
    && [value.rowsSeen, value.rowsFailed, value.rowsMissing, value.duplicatesDetected, value.warningsCount]
      .every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0);
}
