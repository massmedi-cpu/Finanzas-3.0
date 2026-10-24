/**
 * REC-SYNC-358/359: strict candidate envelope for the legacy stable-revision
 * shortcut. This is NOT a substitute for the full server-side preflight,
 * SQL record comparison or independent postflight.
 */
export type StableReplayProofRow = {
  source_row_identity: string;
  source_fingerprint: string;
  account_external_key: string;
  bank_date: string;
  amount_cents: number;
  balance_after_cents: number | null;
};

const SHA256 = /^[a-f0-9]{64}$/;
function validDay(day: unknown): day is string {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

export function prepareStableReplayProofRows(batch: unknown): StableReplayProofRow[] | null {
  if (!batch || typeof batch !== "object" || Array.isArray(batch)) return null;
  const data = batch as Record<string, unknown>;
  if (typeof data.sourceFileId !== "string" || !data.sourceFileId.trim()
    || typeof data.sourceRevision !== "string" || !data.sourceRevision.trim()
    || typeof data.schemaFingerprint !== "string" || !SHA256.test(data.schemaFingerprint)
    || !Array.isArray(data.accounts) || data.accounts.length === 0 || data.accounts.length > 20
    || !Array.isArray(data.observations) || data.observations.length === 0
    || data.observations.length > 10000) return null;

  const accountKeys = new Set<string>();
  for (const item of data.accounts) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const account = item as Record<string, unknown>;
    if (typeof account.accountExternalKey !== "string" || !account.accountExternalKey.trim()
      || accountKeys.has(account.accountExternalKey)) return null;
    accountKeys.add(account.accountExternalKey);
  }

  const identities = new Set<string>();
  const rows: StableReplayProofRow[] = [];
  for (const item of data.observations) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.sourceSheetId !== "string" || !row.sourceSheetId.trim()
      || typeof row.sourceRowKey !== "string" || !row.sourceRowKey.trim()
      || typeof row.sourceRowIdentity !== "string"
      || row.sourceRowIdentity !== `${data.sourceFileId.trim()}::${row.sourceSheetId.trim()}::${row.sourceRowKey.trim()}`
      || identities.has(row.sourceRowIdentity)
      || typeof row.sourceFingerprint !== "string" || !SHA256.test(row.sourceFingerprint)
      || typeof row.accountExternalKey !== "string" || !accountKeys.has(row.accountExternalKey)
      || !validDay(row.bankDate)
      || typeof row.amountCents !== "number" || !Number.isSafeInteger(row.amountCents)
      || !(row.balanceAfterCents === null
        || typeof row.balanceAfterCents === "number" && Number.isSafeInteger(row.balanceAfterCents))) {
      return null;
    }
    identities.add(row.sourceRowIdentity);
    rows.push({
      source_row_identity: row.sourceRowIdentity,
      source_fingerprint: row.sourceFingerprint,
      account_external_key: row.accountExternalKey,
      bank_date: row.bankDate,
      amount_cents: row.amountCents,
      balance_after_cents: row.balanceAfterCents as number | null,
    });
  }
  return rows;
}
