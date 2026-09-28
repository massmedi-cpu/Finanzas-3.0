export type SourceSyncIncidentInput = {
  status?: string | null;
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
