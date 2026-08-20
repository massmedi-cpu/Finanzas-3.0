export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
}

/**
 * Placeholder for the read-only Google Sheets synchronisation engine.
 * The source spreadsheet is never modified.
 */
export async function syncFromGoogleSheets(): Promise<SyncResult> {
  return { created: 0, updated: 0, deleted: 0 };
}
