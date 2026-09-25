import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  MAX_SOURCE_SYNC_OBSERVATIONS,
  SourceWorkbookContractError,
  prepareOfficialSourceSyncBatch,
} from "../../src/application/source-sync-service";
import {
  type AnalysisGatewaySnapshot,
  buildAnalysisSnapshot,
} from "../../src/application/analysis/analysis-engine";
import {
  authRecoveryFromCode,
  authRecoveryFromError,
  requestErrorCode,
} from "../../src/application/auth-recovery";
import { handleSourceSyncAction } from "../../supabase/functions/financial-app-db-gateway/source-sync";
import { pre025SourceRow, pre025Workbook } from "../fixtures/pre025-source";

const TRANSACTION_ID = "61000000-0000-4000-8000-000000000061";
const FAILED_RUN_ID = "62000000-0000-4000-8000-000000000062";

function assertFiniteNumbers(value: unknown, path = "root") {
  if (typeof value === "number") {
    expect(Number.isFinite(value), `${path} must be finite`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteNumbers(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) =>
      assertFiniteNumbers(item, `${path}.${key}`),
    );
  }
}

function zeroPeriod(dateFrom: string, dateTo: string) {
  return {
    dateFrom,
    dateTo,
    incomeCents: 0,
    expenseCents: 0,
    operatingNetCents: 0,
    savingsCents: 0,
    savingsRateBps: null,
    quality: {
      scopedRows: 1,
      includedRows: 1,
      manuallyExcludedRows: 0,
      confirmedDuplicateRows: 0,
      suspectedDuplicateRows: 0,
      signMismatchRows: 0,
    },
  };
}

test("EDGE-001 keeps an exact zero as an explicit source expense and produces finite analysis", () => {
  const prepared = prepareOfficialSourceSyncBatch(pre025Workbook(2));
  expect(prepared.observations).toHaveLength(2);
  expect(prepared.observations[0]).toMatchObject({
    amountCents: 0,
    balanceAfterCents: 100_000,
    transactionKind: "expense",
  });
  expect(prepared.accounts[0].openingBalanceCents).toBe(100_000);

  const gateway = {
    current: zeroPeriod("2026-09-01", "2026-09-30"),
    previous: zeroPeriod("2026-08-01", "2026-08-31"),
    history: {
      rows: Array.from({ length: 6 }, (_, index) => ({
        monthStart: `2026-0${index + 3}-01`,
        rows: 0,
        incomeCents: 0,
        expenseCents: 0,
        operatingNetCents: 0,
        savingsCents: 0,
        savingsRateBps: null,
      })),
    },
    accounts: [{ id: "10000000-0000-4000-8000-000000000001", name: "Cuenta cero", lifecycle: "active" }],
    categories: [{ id: null, name: "Sin categoría", currentExpenseCents: 0, previousExpenseCents: 0, currentRows: 1, previousRows: 0 }],
    merchants: [{ id: null, name: "Sin comercio", currentExpenseCents: 0, previousExpenseCents: 0, currentRows: 1, previousRows: 0, currentAverageCents: 0, habitualAverageCents: null, historyRows: 0 }],
    dailySpend: [{ date: "2026-09-01", expenseCents: 0, rows: 1 }],
    weekdaySpend: [{ weekday: 2, expenseCents: 0, rows: 1, averageCents: 0 }],
    amountBands: [{ band: "lt10", expenseCents: 0, rows: 1 }],
    concepts: [{ concept: "MOVIMIENTO CERO", expenseCents: 0, rows: 1, averageCents: 0 }],
    accountSpend: [{ accountId: "10000000-0000-4000-8000-000000000001", accountName: "Cuenta cero", expenseCents: 0, rows: 1, averageCents: 0 }],
    topTransactions: [{ transactionId: TRANSACTION_ID, bankDate: "2026-09-01", amountCents: 0, conceptNormalized: "MOVIMIENTO CERO", merchantId: null, merchantName: "Sin comercio", categoryId: null, categoryName: "Sin categoría", accountId: "10000000-0000-4000-8000-000000000001", accountName: "Cuenta cero" }],
    concentration: { top3CategoryBps: null, top3MerchantBps: null },
    anomalies: [],
    fixedVariable: { available: false, reliableRecurrences: 0, fixedExpenseCents: 0, variableExpenseCents: 0 },
    budget: null,
    forecast: null,
  } satisfies AnalysisGatewaySnapshot;

  const snapshot = buildAnalysisSnapshot({
    range: "1m",
    month: "2026-09",
    accountId: null,
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    previousDateFrom: "2026-08-01",
    previousDateTo: "2026-08-31",
    partial: false,
    partialMonthStart: null,
    gateway,
  });

  expect(snapshot.current.expenseCents).toBe(0);
  expect(snapshot.current.savingsRateBps).toBeNull();
  expect(snapshot.categoryDrivers[0].shareBps).toBeNull();
  expect(snapshot.topTransactions[0].amountCents).toBe(0);
  assertFiniteNumbers(snapshot);
});

test("EDGE-006 accepts exactly 10,000 observations and rejects 10,001 before persistence", () => {
  const atLimit = pre025Workbook(MAX_SOURCE_SYNC_OBSERVATIONS);
  const accepted = prepareOfficialSourceSyncBatch(atLimit);
  expect(accepted.observations).toHaveLength(MAX_SOURCE_SYNC_OBSERVATIONS);

  const currentSheet = atLimit.sheets[0];
  const overLimit = {
    ...atLimit,
    sheets: [
      {
        ...currentSheet,
        rows: [
          ...currentSheet.rows,
          pre025SourceRow({ key: "CC-PRE025-10000", product: "checking" }),
        ],
      },
      atLimit.sheets[1],
    ],
  };

  let captured: unknown = null;
  try {
    prepareOfficialSourceSyncBatch(overLimit);
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(SourceWorkbookContractError);
  expect((captured as SourceWorkbookContractError).code).toBe("source_observation_limit_exceeded");
});

test("EDGE-006 returns a failed run and leaves no committed batch work after a mid-batch failure", async () => {
  const batch = prepareOfficialSourceSyncBatch(pre025Workbook(3));
  const committedQueries: string[] = [];
  const outerQueries: string[] = [];
  let ingested = 0;

  const sql = Object.assign(
    async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      outerQueries.push(query);
      if (query.includes("insert into financial_app.sync_runs")) return [{ id: FAILED_RUN_ID }];
      return [];
    },
    {
      begin: async (callback: (tx: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>) => Promise<void>) => {
        const pendingQueries: string[] = [];
        const tx = async (strings: TemplateStringsArray) => {
          const query = strings.join("?");
          pendingQueries.push(query);
          if (query.includes("insert into financial_app.sync_runs")) {
            return [{ id: "63000000-0000-4000-8000-000000000063" }];
          }
          if (query.includes("ingest_source_observation")) {
            ingested += 1;
            if (ingested === 2) throw new Error("synthetic_mid_batch_failure");
            return [{ transaction_id: TRANSACTION_ID, action: "insert" }];
          }
          return [];
        };

        await callback(tx);
        committedQueries.push(...pendingQueries);
      },
    },
  );

  const response = await handleSourceSyncAction({
    action: "source.sync_batch",
    payload: { batch },
    sql,
    environment: "preview",
  });

  if (!response) throw new Error("source_sync_handler_did_not_handle_batch");
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "source_sync_failed", syncRunId: FAILED_RUN_ID });
  expect(committedQueries).toHaveLength(0);
  expect(outerQueries.filter((query) => query.includes("insert into financial_app.sync_runs"))).toHaveLength(1);
  expect(outerQueries.some((query) => query.includes("insert into financial_app.sync_issues"))).toBe(true);
});

test("EDGE-007 identifies recoverable auth failures and keeps reauthentication out of the editing tab", () => {
  expect(requestErrorCode({ error: "authentication_required", code: null })).toBe("authentication_required");
  expect(authRecoveryFromCode("authentication_required")).toBe("required");
  expect(authRecoveryFromError(new Error("authentication_unavailable"))).toBe("unavailable");

  const notice = readFileSync("app/draft-recovery-notice.tsx", "utf8");
  const transactions = readFileSync("app/transactions/transactions-client.tsx", "utf8");
  const documents = readFileSync("app/documents/documents-client.tsx", "utf8");
  const forecast = readFileSync("app/forecast/forecast-client.tsx", "utf8");
  expect(notice).toContain('target="_blank"');
  expect(notice).toContain("El borrador sigue en este formulario.");
  expect(transactions).toContain("setAuthRecovery(authRecoveryFromCode(requestErrorCode(payload)))");
  expect(documents).toContain("setAuthRecovery(authRecoveryFromError(caught))");
  expect(forecast).toContain("setAuthRecovery(recovery)");
});

test("EDGE-005 aligns editable text controls with API maxima and long-text wrapping", () => {
  const transactions = readFileSync("app/transactions/transactions-client.tsx", "utf8");
  const transactionCss = readFileSync("app/transactions/transactions.module.css", "utf8");
  const documents = readFileSync("app/documents/documents-client.tsx", "utf8");
  const documentCss = readFileSync("app/documents/documents.module.css", "utf8");

  expect(transactions).toContain("maxLength={240}");
  expect(transactions).toContain("maxLength={2000}");
  expect(transactions).toContain("maxLength={200}");
  expect(documents).toContain("maxLength={300}");
  expect(documents).toContain("maxLength={2000}");
  expect(transactionCss).toContain("overflow-wrap: anywhere");
  expect(documentCss).toContain("overflow-wrap:anywhere");
});
