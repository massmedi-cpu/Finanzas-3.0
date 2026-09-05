import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  OfficialSourceHistoricalBaselineError,
  assertOfficialSourceHistoricalBaseline,
  type OfficialSourceHistoricalBaselineErrorCode,
  type OfficialSourcePreflightSummary,
} from "../../src/application/source-preflight";

function baselineSummary(): OfficialSourcePreflightSummary {
  return {
    sourceFileId: "verified-source",
    sourceRevision: "drive-version:baseline",
    schemaFingerprint: "a".repeat(64),
    totalAuthoritativeRows: 3172,
    accounts: [
      {
        accountExternalKey: "Cuenta corriente Openbank · 3967",
        accountName: "Cuenta corriente Openbank · 3967",
        accountType: "checking",
        lifecycle: "active",
        authoritativeRows: 3024,
        openingBalanceCents: 0,
        newestBankDate: "2026-09-04",
        oldestBankDate: "2018-11-22",
        latestBalanceAfterCents: 188827,
      },
      {
        accountExternalKey: "Cuenta ahorro Openbank · 2504",
        accountName: "Cuenta ahorro Openbank · 2504",
        accountType: "savings",
        lifecycle: "active",
        authoritativeRows: 15,
        openingBalanceCents: 0,
        newestBankDate: "2026-09-02",
        oldestBankDate: "2026-01-05",
        latestBalanceAfterCents: 18695772,
      },
      {
        accountExternalKey: "Tarjeta prepago Openbank · 8403",
        accountName: "Tarjeta prepago Openbank · 8403",
        accountType: "other",
        lifecycle: "archived",
        authoritativeRows: 133,
        openingBalanceCents: 0,
        newestBankDate: "2023-01-01",
        oldestBankDate: "2019-01-01",
        latestBalanceAfterCents: null,
      },
    ],
    cursors: [
      {
        sourceSheetId: "725351515",
        sheetTitle: "Cuenta corriente · 3967",
        authoritativeRows: 3157,
        lastSourceRowKey: "CC-02963",
      },
      {
        sourceSheetId: "2504001",
        sheetTitle: "Cuenta ahorro · 2504",
        authoritativeRows: 15,
        lastSourceRowKey: "AH-00010",
      },
    ],
  };
}

function cloneSummary() {
  return structuredClone(baselineSummary());
}

function expectBaselineError(
  summary: OfficialSourcePreflightSummary,
  code: OfficialSourceHistoricalBaselineErrorCode,
) {
  try {
    assertOfficialSourceHistoricalBaseline(summary);
    throw new Error("expected_historical_baseline_error");
  } catch (error) {
    expect(error).toBeInstanceOf(OfficialSourceHistoricalBaselineError);
    expect((error as OfficialSourceHistoricalBaselineError).code).toBe(code);
  }
}

test("acepta exactamente el histórico verificado", () => {
  const summary = baselineSummary();
  expect(assertOfficialSourceHistoricalBaseline(summary)).toBe(summary);
});

test("acepta crecimiento reciente sin congelar saldos ni recuentos máximos", () => {
  const summary = cloneSummary();
  summary.totalAuthoritativeRows += 3;
  summary.accounts[0].authoritativeRows += 2;
  summary.accounts[0].newestBankDate = "2026-09-06";
  summary.accounts[0].latestBalanceAfterCents = 212345;
  summary.accounts[1].authoritativeRows += 1;
  summary.accounts[1].newestBankDate = "2026-09-05";
  summary.accounts[1].latestBalanceAfterCents = 18710000;
  summary.cursors[0].authoritativeRows += 2;
  summary.cursors[1].authoritativeRows += 1;

  expect(assertOfficialSourceHistoricalBaseline(summary)).toBe(summary);
});

test("bloquea una pérdida del total histórico", () => {
  const summary = cloneSummary();
  summary.totalAuthoritativeRows = 3171;
  expectBaselineError(summary, "historical_total_rows_regressed");
});

test("bloquea la desaparición de un producto histórico", () => {
  const summary = cloneSummary();
  summary.accounts = summary.accounts.filter(
    (account) => account.accountName !== "Tarjeta prepago Openbank · 8403",
  );
  expectBaselineError(summary, "historical_account_missing");
});

test("bloquea cambios de tipo o ciclo de vida de una cuenta histórica", () => {
  const summary = cloneSummary();
  summary.accounts[0].lifecycle = "archived";
  expectBaselineError(summary, "historical_account_contract_changed");
});

test("bloquea la pérdida de filas dentro de un producto histórico", () => {
  const summary = cloneSummary();
  summary.accounts[0].authoritativeRows = 3023;
  expectBaselineError(summary, "historical_account_rows_regressed");
});

test("bloquea cambios en el saldo inicial histórico derivado", () => {
  const summary = cloneSummary();
  summary.accounts[1].openingBalanceCents = 1;
  expectBaselineError(summary, "historical_opening_balance_changed");
});

test("bloquea la desaparición de una pestaña física histórica", () => {
  const summary = cloneSummary();
  summary.cursors = summary.cursors.filter((cursor) => cursor.sheetTitle !== "Cuenta ahorro · 2504");
  expectBaselineError(summary, "historical_sheet_cursor_missing");
});

test("bloquea la pérdida de filas autoritativas de una pestaña física", () => {
  const summary = cloneSummary();
  summary.cursors[0].authoritativeRows = 3156;
  expectBaselineError(summary, "historical_sheet_rows_regressed");
});

test("bloquea que cambie la fila histórica más antigua conocida", () => {
  const summary = cloneSummary();
  summary.cursors[0].lastSourceRowKey = "CC-02962";
  expectBaselineError(summary, "historical_oldest_row_changed");
});

test("el callback OAuth aplica la guardia histórica antes de guardar la conexión", () => {
  const callbackSource = readFileSync("app/api/source/google/callback/route.ts", "utf8");
  const historicalGuard = callbackSource.indexOf(
    "assertOfficialSourceHistoricalBaseline(buildOfficialSourcePreflightSummary(snapshot));",
  );
  const storeConnection = callbackSource.indexOf("const stored = await oauth.store");

  expect(historicalGuard).toBeGreaterThan(-1);
  expect(storeConnection).toBeGreaterThan(historicalGuard);
});
