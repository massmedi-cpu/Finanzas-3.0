import { expect, test } from "@playwright/test";
import { handleFinancialLogicAction } from "../../supabase/functions/financial-app-db-gateway/financial-logic";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("financial API rejects unsupported modes and invalid dates", async ({ request }) => {
  const invalidMode = await request.get("/api/financial?mode=unsupported");
  expect(invalidMode.status()).toBe(400);
  await expect(invalidMode.json()).resolves.toMatchObject({
    error: "invalid_request",
    code: "invalid_mode",
  });

  const invalidCalendarDate = await request.get(
    "/api/financial?mode=period&dateFrom=2026-02-30&dateTo=2026-03-01",
  );
  expect(invalidCalendarDate.status()).toBe(400);
  await expect(invalidCalendarDate.json()).resolves.toMatchObject({
    error: "invalid_request",
    code: "invalid_dateFrom",
  });

  const invalidRange = await request.get(
    "/api/financial?mode=period&dateFrom=2026-09-05&dateTo=2026-01-01",
  );
  expect(invalidRange.status()).toBe(400);
  await expect(invalidRange.json()).resolves.toMatchObject({
    error: "invalid_request",
    code: "invalid_financial_date_range",
  });
});

test("financial gateway rejects impossible calendar dates before SQL", async () => {
  const sql = () => {
    throw new Error("sql_should_not_run");
  };

  await expect(handleFinancialLogicAction({
    action: "financial.period",
    payload: { dateFrom: "2026-02-30", dateTo: "2026-03-01" },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_financial_date_from");

  await expect(handleFinancialLogicAction({
    action: "financial.balances",
    payload: { asOfDate: "2026-13-01" },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_financial_as_of_date");
});

test("financial gateway classifies missing accounts and hides unexpected database details", async () => {
  const missingSql = () => {
    throw new Error("financial_account_not_found");
  };
  const missing = await handleFinancialLogicAction({
    action: "financial.snapshot",
    payload: { accountId: "11111111-1111-4111-8111-111111111111" },
    sql: missingSql,
    environment: "preview",
  });
  expect(missing?.status).toBe(404);
  await expect(missing?.json()).resolves.toEqual({ error: "financial_account_not_found" });

  const originalConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const failingSql = () => {
      throw new Error("sensitive_sql_details_must_not_escape");
    };
    const failure = await handleFinancialLogicAction({
      action: "financial.snapshot",
      payload: {},
      sql: failingSql,
      environment: "preview",
    });
    expect(failure?.status).toBe(500);
    await expect(failure?.json()).resolves.toEqual({ error: "financial_internal_error" });
    expect(JSON.stringify(logged)).not.toContain("sensitive_sql_details_must_not_escape");
  } finally {
    console.error = originalConsoleError;
  }
});

test("protected preview identifies the exact Phase 5 build", async ({ request }) => {
  test.skip(!isProtectedPreview, "Exact deployment identity is a protected-preview gate.");

  const response = await request.get("/api/build");
  expect(response.ok()).toBeTruthy();
  const build = await response.json();

  expect(build.phase).toBe(5);
  expect(build.phaseName).toBe("Lógica financiera central");
  expect(build.phaseBlock).toBeNull();
  expect(build.phaseBlockName).toBe("Motor financiero central");
  expect(build.environment).toBe("preview");
  if (process.env.GITHUB_SHA) expect(build.commit).toBe(process.env.GITHUB_SHA);
});

test("protected preview returns not found for a valid unknown financial account", async ({ request }) => {
  test.skip(!isProtectedPreview, "Persistence error classification is validated against the protected preview.");

  const response = await request.get(
    "/api/financial?mode=snapshot&accountId=11111111-1111-4111-8111-111111111111",
  );
  expect(response.status()).toBe(404);
  await expect(response.json()).resolves.toEqual({
    error: "not_found",
    code: "financial_account_not_found",
  });
});

test("protected preview exposes the validated real financial snapshot without mixing transfers", async ({ request }) => {
  test.skip(!isProtectedPreview, "Real financial persistence is validated only against the protected preview.");

  const response = await request.get(
    "/api/financial?mode=snapshot&dateFrom=2026-01-01&dateTo=2026-09-05",
  );
  expect(response.ok()).toBeTruthy();
  const snapshot = await response.json();

  expect(snapshot.contractVersion).toBe(1);
  expect(snapshot.principles).toMatchObject({
    bankSource: "read_only",
    transfersExcludedFromSavings: true,
    suspectedDuplicatesIncluded: true,
    confirmedDuplicatesExcluded: true,
    manualAnalyticsExclusionRespected: true,
    explicitBankBalancePreferred: true,
  });

  expect(snapshot.period).toMatchObject({
    dateFrom: "2026-01-01",
    dateTo: "2026-09-05",
    incomeCents: 1322941,
    expenseCents: 1012339,
    savingsCents: 310602,
    operatingNetCents: 310602,
  });
  expect(snapshot.period.transfers.rows).toBe(27);
  expect(snapshot.period.quality.signMismatchRows).toBe(0);
  expect(snapshot.period.quality.suspectedDuplicateRows).toBe(4);

  expect(snapshot.balances.totalBalanceCents).toBe(18884599);
  expect(snapshot.balances.activeBalanceCents).toBe(18884599);
  expect(snapshot.balances.quality).toMatchObject({
    accounts: 2,
    explicitBalanceAccounts: 2,
    reconstructedBalanceAccounts: 0,
    integrityDeltaAccounts: 1,
  });
  expect(snapshot.monthly.rows).toHaveLength(9);
});
