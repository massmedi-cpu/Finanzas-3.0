/**
 * Release cut for OCR while the private G5 17+8 corpus is not certified.
 *
 * This is a public build-time choice, not an authorization control. The server
 * independently rejects the OCR endpoints when the release flag is deferred.
 * Undefined preserves the current test/stable feature surface until the exact
 * candidate preview is rebuilt and exercised with this flag set.
 */
export function isDocumentOcrDeferred(
  value: string | undefined = process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_OCR,
): boolean {
  return value === "deferred";
}

/**
 * Automatic Google Drive document ingestion is optional for a stable
 * single-user launch. Disabling it removes the auto-started UI and must also
 * deny its server mutation route, while preserving the official BANK source.
 */
export function isDocumentDriveSyncDeferred(
  value: string | undefined = process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DRIVE_SYNC,
): boolean {
  return value === "deferred";
}
