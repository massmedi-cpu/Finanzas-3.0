import { expect, test } from "@playwright/test";
import { handleBudgetLogicAction } from "../../supabase/functions/financial-app-db-gateway/budget-logic";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("budget API rejects invalid months, bodies and manual amounts before persistence", async ({ request }) => {
  const invalidMonth = await request.get("/api/budgets?month=2026-13");
  expect(invalidMonth.status()).toBe(400);
  await expect(invalidMonth.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_budget_month",
  });

  const invalidBody = await request.post("/api/budgets", { data: [] });
  expect(invalidBody.status()).toBe(400);
  await expect(invalidBody.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_budget_body",
  });

  const negativeManual = await request.patch("/api/budgets", {
    data: { month: "2026-09", categoryId: null, manualAmountCents: -1 },
  });
  expect(negativeManual.status()).toBe(400);
  await expect(negativeManual.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_budget_manual_amount",
  });

  const missingManual = await request.patch("/api/budgets", {
    data: { month: "2026-09", categoryId: null },
  });
  expect(missingManual.status()).toBe(400);
  await expect(missingManual.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_budget_manual_amount",
  });
});

test("budget gateway validates payloads before SQL", async () => {
  const sql = () => {
    throw new Error("sql_should_not_run");
  };

  await expect(handleBudgetLogicAction({
    action: "budget.snapshot",
    payload: { month: "0000-01" },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_budget_month");

  await expect(handleBudgetLogicAction({
    action: "budget.set_manual",
    payload: { month: "2026-09", categoryId: null, manualAmountCents: -10 },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_budget_manual_amount");

  await expect(handleBudgetLogicAction({
    action: "budget.set_manual",
    payload: {
      month: "2026-09",
      categoryId: "not-a-uuid",
      manualAmountCents: 100,
    },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_budget_category_id");
});

test("budget gateway classifies domain errors and hides unexpected database details", async () => {
  const missingSql = () => {
    throw new Error("budget_category_not_found");
  };
  const missing = await handleBudgetLogicAction({
    action: "budget.set_manual",
    payload: {
      month: "2026-09",
      categoryId: "11111111-1111-4111-8111-111111111111",
      manualAmountCents: 100,
    },
    sql: missingSql,
    environment: "preview",
  });
  expect(missing?.status).toBe(404);
  await expect(missing?.json()).resolves.toEqual({ error: "budget_category_not_found" });

  const originalConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const failingSql = () => {
      throw new Error("sensitive_budget_sql_details_must_not_escape");
    };
    const failure = await handleBudgetLogicAction({
      action: "budget.snapshot",
      payload: { month: "2026-09" },
      sql: failingSql,
      environment: "preview",
    });
    expect(failure?.status).toBe(500);
    await expect(failure?.json()).resolves.toEqual({ error: "budget_internal_error" });
    expect(JSON.stringify(logged)).not.toContain("sensitive_budget_sql_details_must_not_escape");
  } finally {
    console.error = originalConsoleError;
  }
});

test("protected preview identifies the exact Phase 6 budget build", async ({ request }) => {
  test.skip(!isProtectedPreview, "Exact deployment identity is a protected-preview gate.");

  const response = await request.get("/api/build");
  expect(response.ok()).toBeTruthy();
  const build = await response.json();

  expect(build.phase).toBe(6);
  expect(build.phaseName).toBe("Presupuestos");
  expect(build.phaseBlock).toBe(1);
  expect(build.phaseBlockName).toBe("Modelo y motor central");
  expect(build.environment).toBe("preview");
  if (process.env.GITHUB_SHA) expect(build.commit).toBe(process.env.GITHUB_SHA);
});

test("protected preview returns a central budget snapshot based on Phase 5 financial facts", async ({ request }) => {
  test.skip(!isProtectedPreview, "Real budget persistence is validated only against the protected preview.");

  const response = await request.get("/api/budgets?month=2026-09");
  expect(response.ok()).toBeTruthy();
  const snapshot = await response.json();

  expect(snapshot).toMatchObject({
    contractVersion: 1,
    month: "2026-09",
    monthStart: "2026-09-01",
    monthEnd: "2026-09-30",
  });
  expect(snapshot.principles).toEqual({
    bankSource: "read_only",
    actualSource: "financial_transaction_facts",
    recommendation: "trailing_3_complete_month_average",
    transfersConsumeBudget: false,
    confirmedDuplicatesConsumeBudget: false,
    manualAnalyticsExclusionsRespected: true,
    refundsNetAgainstExpense: false,
    manualOverrideWins: true,
    parentCategoryIncludesDescendants: true,
  });

  expect(snapshot.total.categoryId).toBeNull();
  expect(snapshot.total.historyMonths).toHaveLength(3);
  const historyTotal = snapshot.total.historyMonths.reduce(
    (sum: number, row: { expenseCents: number }) => sum + row.expenseCents,
    0,
  );
  expect(snapshot.total.automaticAmountCents).toBe(Math.round(historyTotal / 3));
  expect(snapshot.total.effectiveAmountCents).toBe(
    snapshot.total.manualAmountCents ?? snapshot.total.automaticAmountCents,
  );
  expect(snapshot.total.actualExpenseCents).toBeGreaterThanOrEqual(0);
  expect(["empty", "unfunded", "on_track", "over"]).toContain(snapshot.total.status);
  expect(Array.isArray(snapshot.categories)).toBeTruthy();
});

test("protected preview rejects a valid but unknown budget category without persisting", async ({ request }) => {
  test.skip(!isProtectedPreview, "Budget domain error classification is a protected-preview gate.");

  const response = await request.patch("/api/budgets", {
    data: {
      month: "2026-09",
      categoryId: "11111111-1111-4111-8111-111111111111",
      manualAmountCents: 10000,
    },
  });
  expect(response.status()).toBe(404);
  await expect(response.json()).resolves.toEqual({
    error: "not_found",
    code: "budget_category_not_found",
  });
});
