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
function bankDate(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isConfirmedSourcePreflight(value: unknown): value is OfficialSourcePreflightSummary {
  if (!record(value) || !filled(value.sourceFileId)
    || (value.sourceRevision !== null && !filled(value.sourceRevision))
    || typeof value.schemaFingerprint !== "string"
    || !/^[a-f0-9]{64}$/i.test(value.schemaFingerprint)
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
    if ((account.newestBankDate === null) !== (account.oldestBankDate === null)) return false;
    if (account.oldestBankDate !== null && account.newestBankDate !== null
      && account.oldestBankDate > account.newestBankDate) return false;
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
