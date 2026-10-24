import type { SourcePostflightReport } from "../domain/source-postflight-reconciliation";

/** REC-SYNC-352: allow new source rows without rewriting existing bank history. */
export function isSafeAppendOnlySourceBaseline(report: SourcePostflightReport): boolean {
  return report.sourceRows > 0
    && (report.status === "verified" || report.status === "pending")
    && report.differingRows === 0 && report.orphanRows === 0
    && report.matchingRows + report.pendingRows === report.sourceRows
    && report.persistedRows === report.matchingRows
    && Object.values(report.differences).every(count => count === 0);
}

/** REC-SYNC-353: a receipt without an exact DB reread is never a finished sync. */
export function isCompleteSourceSyncPostflight(report: SourcePostflightReport): boolean {
  return isSafeAppendOnlySourceBaseline(report)
    && report.status === "verified" && report.pendingRows === 0;
}
