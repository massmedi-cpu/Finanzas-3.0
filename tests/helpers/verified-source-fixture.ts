import type { OfficialSourcePreflightSummary } from "../../src/application/source-preflight";

/** HTTP contract fixtures only. No bank data, cloud access or original files. */
export function syntheticSourcePreflight(rows = 10): OfficialSourcePreflightSummary {
  return {
    sourceFileId: "synthetic-source", sourceRevision: "synthetic-revision",
    schemaFingerprint: "a".repeat(64), snapshotFingerprint: "b".repeat(64),
    totalAuthoritativeRows: rows,
    accounts: [{
      accountExternalKey: "synthetic-account", accountName: "Cuenta de ensayo", accountType: "checking", lifecycle: "active",
      authoritativeRows: rows, openingBalanceCents: 0, newestBankDate: "2026-09-16", oldestBankDate: "2026-01-01",
      latestBalanceAfterCents: 1000,
      balanceContinuity: { comparablePairs: 0, consistentPairs: 0, discontinuousPairs: 0, unverifiablePairs: rows - 1 },
    }],
    cursors: [{ sourceSheetId: "synthetic-sheet", sheetTitle: "Pestaña de ensayo", authoritativeRows: rows, lastSourceRowKey: "SYNTHETIC-1" }],
  };
}

export function syntheticSourceSyncReceipt(rows = 10) {
  return {
    status: "success", syncRunId: "synthetic-run", rowsSeen: rows, rowsInserted: 0, rowsRevised: 0,
    rowsSkipped: rows, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0, cursorsAdvanced: 1,
    sourceRevision: "synthetic-revision", snapshotFingerprint: "b".repeat(64),
  };
}
