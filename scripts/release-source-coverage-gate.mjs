/**
 * Release-only minimum for the canonical read-only bank source snapshot of
 * 30 October 2026 (3,200 current/prepaid + 18 savings = 3,218 records).
 * This is a floor, not an assertion that a count proves row-by-row identity.
 * An operator must still verify the 30 specific append-only identities and
 * the fresh source snapshot before cutover.
 */
export const MIN_COMPLETE_BANK_SOURCE_RECORDS = 3218;

export function requiresCompleteSourceHistory(version) {
  if (version === undefined || version === null || version === "") return false;
  if (typeof version !== "string") throw new Error("invalid_postflight_app_version");
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) throw new Error("invalid_postflight_app_version");
  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    throw new Error("invalid_postflight_app_version");
  }
  return major > 10 || (major === 10 && (minor > 0 || (minor === 0 && patch >= 104)));
}

export function assertCompleteSourceHistory(version, sourceRecords) {
  if (!requiresCompleteSourceHistory(version)) return;
  if (!Number.isSafeInteger(sourceRecords) || sourceRecords < MIN_COMPLETE_BANK_SOURCE_RECORDS) {
    throw new Error(
      `release_source_history_incomplete: expected_at_least_${MIN_COMPLETE_BANK_SOURCE_RECORDS}; got_${sourceRecords}`,
    );
  }
}
