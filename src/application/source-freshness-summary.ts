/**
 * Normalized, private source sync evidence shared by Inicio, Análisis and
 * Cash Flow. Only the gateway's source.status is authoritative here.
 */
type Data = Record<string, unknown>;

function record(value: unknown): Data | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Data : null;
}
function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function sourceConnectionFileId(payload: unknown) {
  const connection = record(record(payload)?.connection);
  return text(connection?.source_file_id) ?? text(connection?.sourceFileId);
}
export function syncSummary(payload: unknown) {
  const run = record(record(payload)?.run);
  if (!run) return null;
  const status = text(run.status);
  if (status !== "success" && status !== "failed" && status !== "started" && status !== "partial") return null;
  return {
    status,
    finishedAt: text(run.finished_at) ?? text(run.finishedAt),
    startedAt: text(run.started_at) ?? text(run.startedAt),
    rowsSeen: count(run.rows_seen) ?? count(run.rowsSeen),
    rowsFailed: count(run.rows_failed) ?? count(run.rowsFailed),
    rowsMissing: count(run.rows_missing) ?? count(run.rowsMissing),
    duplicatesDetected: count(run.duplicates_detected) ?? count(run.duplicatesDetected),
    warningsCount: count(run.warnings_count) ?? count(run.warningsCount),
  };
}
