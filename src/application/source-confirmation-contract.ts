import type { OfficialSourcePreflightSummary } from "./source-preflight";
import type { SourceSyncBatchResult } from "./source-sync-service";

// The HTTP status is not evidence of persistence or a valid preflight. Decode
// the untrusted body before exposing a completed state or enabling import.
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function filled(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function money(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function fingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function bankDate(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isConfirmedSourcePreflight(value: unknown): value is OfficialSourcePreflightSummary {
  if (!record(value) || !filled(value.sourceFileId)
    || (value.sourceRevision !== null && !filled(value.sourceRevision))
    || !fingerprint(value.schemaFingerprint) || !fingerprint(value.snapshotFingerprint)
    || !count(value.totalAuthoritativeRows) || value.totalAuthoritativeRows === 0
    || !Array.isArray(value.accounts) || !value.accounts.length
    || !Array.isArray(value.cursors) || !value.cursors.length) return false;

  let productRows = 0;
  const accountKeys = new Set<string>();
  for (const account of value.accounts) {
    if (!record(account) || !filled(account.accountExternalKey) || !filled(account.accountName)
      || !filled(account.accountType) || !filled(account.lifecycle)
      || !count(account.authoritativeRows) || account.authoritativeRows === 0
      || !money(account.openingBalanceCents) || !bankDate(account.newestBankDate)
      || !bankDate(account.oldestBankDate)
      || !(account.latestBalanceAfterCents === null || money(account.latestBalanceAfterCents))) return false;
    // Sum equality alone cannot certify a preflight with repeated identities.
    if (accountKeys.has(account.accountExternalKey)) return false;
    accountKeys.add(account.accountExternalKey);
    const newest = account.newestBankDate;
    const oldest = account.oldestBankDate;
    if ((newest === null) !== (oldest === null)) return false;
    if (typeof oldest === "string" && typeof newest === "string" && oldest > newest) return false;
    const continuity = account.balanceContinuity;
    if (!record(continuity)
      || ![continuity.comparablePairs, continuity.consistentPairs,
        continuity.discontinuousPairs, continuity.unverifiablePairs].every(count)
      || continuity.comparablePairs !== (continuity.consistentPairs as number) + (continuity.discontinuousPairs as number)
      || account.authoritativeRows - 1 !== (continuity.comparablePairs as number) + (continuity.unverifiablePairs as number)) return false;
    productRows += account.authoritativeRows;
    if (!Number.isSafeInteger(productRows)) return false;
  }

  let cursorRows = 0;
  const sheetIds = new Set<string>();
  for (const cursor of value.cursors) {
    if (!record(cursor) || !filled(cursor.sourceSheetId) || !filled(cursor.sheetTitle)
      || !filled(cursor.lastSourceRowKey)
      || !count(cursor.authoritativeRows) || cursor.authoritativeRows === 0) return false;
    if (sheetIds.has(cursor.sourceSheetId)) return false;
    sheetIds.add(cursor.sourceSheetId);
    cursorRows += cursor.authoritativeRows;
    if (!Number.isSafeInteger(cursorRows)) return false;
  }

  return productRows === value.totalAuthoritativeRows
    && cursorRows === value.totalAuthoritativeRows;
}

export type SourcePreflightConfirmation = Pick<OfficialSourcePreflightSummary,
  "sourceFileId" | "sourceRevision" | "schemaFingerprint" | "snapshotFingerprint" | "totalAuthoritativeRows">;

export function sourcePreflightConfirmation(summary: OfficialSourcePreflightSummary): SourcePreflightConfirmation {
  return {
    sourceFileId: summary.sourceFileId,
    sourceRevision: summary.sourceRevision,
    schemaFingerprint: summary.schemaFingerprint,
    snapshotFingerprint: summary.snapshotFingerprint,
    totalAuthoritativeRows: summary.totalAuthoritativeRows,
  };
}

export function isSourcePreflightConfirmation(value: unknown): value is SourcePreflightConfirmation {
  return record(value) && filled(value.sourceFileId) && value.sourceFileId.length <= 256
    && (value.sourceRevision === null || (filled(value.sourceRevision) && value.sourceRevision.length <= 512))
    && fingerprint(value.schemaFingerprint) && fingerprint(value.snapshotFingerprint)
    && count(value.totalAuthoritativeRows) && value.totalAuthoritativeRows > 0;
}

export function matchesSourcePreflightConfirmation(
  confirmation: SourcePreflightConfirmation,
  summary: OfficialSourcePreflightSummary,
) {
  return confirmation.sourceFileId === summary.sourceFileId
    && confirmation.sourceRevision === summary.sourceRevision
    && confirmation.schemaFingerprint === summary.schemaFingerprint
    && confirmation.snapshotFingerprint === summary.snapshotFingerprint
    && confirmation.totalAuthoritativeRows === summary.totalAuthoritativeRows;
}

/** A valid receipt must also describe the exact snapshot that was submitted. */
export function isSourceSyncResultForPreflight(value: unknown, summary: OfficialSourcePreflightSummary) {
  return isConfirmedSourceSyncResult(value)
    && value.rowsSeen === summary.totalAuthoritativeRows
    && value.cursorsAdvanced === summary.cursors.length;
}

export function isConfirmedSourceSyncResponse(
  value: unknown,
  summary: OfficialSourcePreflightSummary,
): value is SourceSyncBatchResult & { sourceRevision: string | null; snapshotFingerprint: string } {
  return isSourceSyncResultForPreflight(value, summary) && record(value)
    && value.sourceRevision === summary.sourceRevision
    && value.snapshotFingerprint === summary.snapshotFingerprint;
}

export function isConfirmedSourceSyncResult(value: unknown): value is SourceSyncBatchResult {
  if (!record(value) || value.status !== "success" || !filled(value.syncRunId)) return false;
  const fields = [
    value.rowsSeen, value.rowsInserted, value.rowsRevised, value.rowsSkipped,
    value.rowsMissing, value.duplicatesDetected, value.warningsCount, value.cursorsAdvanced,
  ];
  if (!fields.every(count)) return false;
  // Array.every narrows the validated local tuple, not the original record's
  // unknown properties; only the validated numbers are used in arithmetic.
  const [rowsSeen, rowsInserted, rowsRevised, rowsSkipped] = fields as number[];
  return rowsSeen > 0 && rowsSeen === rowsInserted + rowsRevised + rowsSkipped;
}
