import {
  prepareOfficialSourceSyncBatch,
  type OfficialSourceWorkbookSnapshot,
  type PreparedSourceObservation,
} from "./source-sync-service";

export type OfficialSourcePreflightAccount = {
  accountExternalKey: string;
  accountName: string;
  accountType: string;
  lifecycle: string;
  authoritativeRows: number;
  openingBalanceCents: number;
  newestBankDate: string | null;
  oldestBankDate: string | null;
  latestBalanceAfterCents: number | null;
};

export type OfficialSourcePreflightCursor = {
  sourceSheetId: string;
  sheetTitle: string;
  authoritativeRows: number;
  lastSourceRowKey: string;
};

export type OfficialSourcePreflightSummary = {
  sourceFileId: string;
  sourceRevision: string | null;
  schemaFingerprint: string;
  totalAuthoritativeRows: number;
  accounts: OfficialSourcePreflightAccount[];
  cursors: OfficialSourcePreflightCursor[];
};

function observationsByAccount(observations: readonly PreparedSourceObservation[]) {
  const grouped = new Map<string, PreparedSourceObservation[]>();
  for (const observation of observations) {
    const rows = grouped.get(observation.accountExternalKey) ?? [];
    rows.push(observation);
    grouped.set(observation.accountExternalKey, rows);
  }
  return grouped;
}

export function buildOfficialSourcePreflightSummary(
  snapshot: OfficialSourceWorkbookSnapshot,
): OfficialSourcePreflightSummary {
  const batch = prepareOfficialSourceSyncBatch(snapshot);
  const grouped = observationsByAccount(batch.observations);
  const sheetTitles = new Map(snapshot.sheets.map((sheet) => [sheet.sourceSheetId, sheet.title]));
  const cursors = new Map<string, OfficialSourcePreflightCursor>();

  for (const observation of batch.observations) {
    const current = cursors.get(observation.sourceSheetId);
    cursors.set(observation.sourceSheetId, {
      sourceSheetId: observation.sourceSheetId,
      sheetTitle: sheetTitles.get(observation.sourceSheetId) ?? observation.sourceSheetId,
      authoritativeRows: (current?.authoritativeRows ?? 0) + 1,
      lastSourceRowKey: observation.sourceRowKey,
    });
  }

  return {
    sourceFileId: batch.sourceFileId,
    sourceRevision: batch.sourceRevision,
    schemaFingerprint: batch.schemaFingerprint,
    totalAuthoritativeRows: batch.observations.length,
    accounts: batch.accounts.map((account) => {
      const observations = grouped.get(account.accountExternalKey) ?? [];
      return {
        accountExternalKey: account.accountExternalKey,
        accountName: account.accountName,
        accountType: account.accountType,
        lifecycle: account.lifecycle,
        authoritativeRows: observations.length,
        openingBalanceCents: account.openingBalanceCents,
        newestBankDate: observations[0]?.bankDate ?? null,
        oldestBankDate: observations.at(-1)?.bankDate ?? null,
        latestBalanceAfterCents: observations[0]?.balanceAfterCents ?? null,
      };
    }),
    cursors: [...cursors.values()],
  };
}
