import {
  OFFICIAL_SOURCE_HISTORICAL_BASELINE,
  OfficialSourceHistoricalBaselineError,
  assertOfficialSourceHistoricalBaseline,
  type OfficialSourcePreflightSummary,
} from "../application/source-preflight";
import type { DataQualityCheck, DataQualityHealth } from "./data-quality-health";

function createBaselineSummary(): OfficialSourcePreflightSummary {
  const baseline = OFFICIAL_SOURCE_HISTORICAL_BASELINE;
  return {
    sourceFileId: "historical-health-source",
    sourceRevision: "historical-health-revision",
    schemaFingerprint: "b".repeat(64),
    totalAuthoritativeRows: baseline.minimumTotalAuthoritativeRows,
    accounts: baseline.accounts.map((account) => ({
      accountExternalKey: account.accountName,
      accountName: account.accountName,
      accountType: account.accountType,
      lifecycle: account.lifecycle,
      authoritativeRows: account.minimumAuthoritativeRows,
      openingBalanceCents: account.openingBalanceCents,
      newestBankDate: null,
      oldestBankDate: null,
      latestBalanceAfterCents: null,
    })),
    cursors: baseline.cursors.map((cursor, index) => ({
      sourceSheetId: `historical-health-sheet-${index + 1}`,
      sheetTitle: cursor.sheetTitle,
      authoritativeRows: cursor.minimumAuthoritativeRows,
      lastSourceRowKey: cursor.oldestSourceRowKey,
    })),
  };
}

function acceptsGrowth() {
  const summary = createBaselineSummary();
  summary.totalAuthoritativeRows += 2;
  summary.accounts[0].authoritativeRows += 2;
  summary.accounts[0].newestBankDate = "2026-09-06";
  summary.accounts[0].latestBalanceAfterCents = 250000;
  summary.cursors[0].authoritativeRows += 2;
  return assertOfficialSourceHistoricalBaseline(summary) === summary;
}

function rejectsHistoricalLoss() {
  const summary = createBaselineSummary();
  summary.totalAuthoritativeRows -= 1;
  try {
    assertOfficialSourceHistoricalBaseline(summary);
    return false;
  } catch (error) {
    return (
      error instanceof OfficialSourceHistoricalBaselineError &&
      error.code === "historical_total_rows_regressed"
    );
  }
}

export function runHistoricalSourceHealthChecks(): DataQualityHealth {
  const checks: DataQualityCheck[] = [
    {
      name: "historical-source-baseline-allows-newer-growth",
      passed: acceptsGrowth(),
    },
    {
      name: "historical-source-baseline-rejects-authoritative-loss",
      passed: rejectsHistoricalLoss(),
    },
  ];
  const passed = checks.filter((check) => check.passed).length;
  return {
    status: passed === checks.length ? "ok" : "failed",
    passed,
    total: checks.length,
    checks,
  };
}
