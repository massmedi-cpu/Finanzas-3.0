import { expect, test } from "@playwright/test";
import { handleBudgetLogicAction } from "../../supabase/functions/financial-app-db-gateway/budget-logic";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const categoryId = "20000000-0000-4000-8000-000000000061";

const baseSnapshot = {
  contractVersion: 1,
  month: "2026-09",
  monthStart: "2026-09-01",
  monthEnd: "2026-09-30",
  total: {
    id: null,
    persisted: false,
    categoryId: null,
    categoryName: null,
    categoryLifecycle: null,
    automaticAmountCents: 120000,
    manualAmountCents: null,
    effectiveAmountCents: 120000,
    actualExpenseCents: 40000,
    remainingCents: 80000,
    progressBps: 3333,
    status: "on_track",
    automaticExplanation: "Referencia automática Axioma §52.",
    automaticFactors: {
      algorithm: "axioma_52_budget_reference_v1",
      mode: "axioma_52_weighted",
      availableMonthCount: 12,
      trailing3AverageCents: 120000,
      recentWeightedCents: 118000,
      seasonalSameMonthCents: 121000,
      seasonalMonthCount: 1,
      trendAdjustmentCents: 1000,
      knownRecurringCents: 0,
      extraordinaryMonthCount: 0,
      extraordinaryCapCents: null,
      recurrencePolicy: "floor_not_additive",
      exclusionsSource: "financial_transaction_allocation_facts.analytics_eligible",
    },
    historyMonths: [
      { month: "2026-06", expenseCents: 100000 },
      { month: "2026-07", expenseCents: 120000 },
      { month: "2026-08", expenseCents: 140000 },
    ],
  },
  categories: [
    {
      id: null,
      persisted: false,
      categoryId,
      categoryName: "Supermercado",
      categoryLifecycle: "active",
      automaticAmountCents: 40000,
      manualAmountCents: null,
      effectiveAmountCents: 40000,
      actualExpenseCents: 15000,
      remainingCents: 25000,
      progressBps: 3750,
      status: "on_track",
      automaticExplanation: "Referencia automática Axioma §52.",
      automaticFactors: {
        algorithm: "axioma_52_budget_reference_v1",
        mode: "axioma_52_weighted",
        availableMonthCount: 12,
        trailing3AverageCents: 40000,
        recentWeightedCents: 39000,
        seasonalSameMonthCents: 41000,
        seasonalMonthCount: 1,
        trendAdjustmentCents: 500,
        knownRecurringCents: 0,
        extraordinaryMonthCount: 0,
        extraordinaryCapCents: null,
        recurrencePolicy: "floor_not_additive",
        exclusionsSource: "financial_transaction_allocation_facts.analytics_eligible",
      },
      historyMonths: [
        { month: "2026-06", expenseCents: 30000 },
        { month: "2026-07", expenseCents: 40000 },
        { month: "2026-08", expenseCents: 50000 },
      ],
    },
  ],
  principles: {
    bankSource: "read_only",
    actualSource: "financial_transaction_allocation_facts",
    recommendation: "axioma_52_weighted_history_seasonality_trend_recurrence_floor",
    transfersConsumeBudget: false,
    confirmedDuplicatesConsumeBudget: false,
    manualAnalyticsExclusionsRespected: true,
    refundsNetAgainstExpense: false,
    manualOverrideWins: true,
    parentCategoryIncludesDescendants: true,
  },
  planning: {
    contractVersion: 1,
    state: "ready",
    objectiveState: "needs_limit",
    historyDateFrom: "2026-06-01",
    historyDateTo: "2026-08-31",
    historicalBaselineCents: 120000,
    selectedLimitCents: null,
    trackingReferenceCents: 120000,
    differenceFromBaselineCents: null,
    averageIncomeCents: 200000,
    targetSavingsCents: null,
    targetSavingsRateBps: null,
    incomeHistoryMonths: [
      { month: "2026-06", incomeCents: 190000 },
      { month: "2026-07", incomeCents: 200000 },
      { month: "2026-08", incomeCents: 210000 },
    ],
    principles: {
      historicalBaseline: "axioma_52_budget_reference",
      chosenLimit: "manual_total_budget_only",
      objective: "average_income_minus_chosen_limit",
      incomeSource: "financial_monthly_series",
      financialAdvice: false,
    },
  },
};

function snapshotWithTotalManual(manualAmountCents: number | null) {
  const effectiveAmountCents = manualAmountCents ?? baseSnapshot.total.automaticAmountCents;
  const actualExpenseCents = baseSnapshot.total.actualExpenseCents;
  return {
    ...baseSnapshot,
    total: {
      ...baseSnapshot.total,
      persisted: true,
      id: "70000000-0000-4000-8000-000000000061",
      manualAmountCents,
      effectiveAmountCents,
      remainingCents: effectiveAmountCents - actualExpenseCents,
      progressBps: effectiveAmountCents > 0
        ? Math.round((actualExpenseCents * 10000) / effectiveAmountCents)
        : null,
      status: effectiveAmountCents === 0
        ? (actualExpenseCents > 0 ? "unfunded" : "empty")
        : (actualExpenseCents > effectiveAmountCents ? "over" : "on_track"),
    },
    planning: {
      ...baseSnapshot.planning,
      objectiveState: manualAmountCents === null ? "needs_limit" : "ready",
      selectedLimitCents: manualAmountCents,
      trackingReferenceCents: effectiveAmountCents,
      differenceFromBaselineCents: manualAmountCents === null
        ? null
        : manualAmountCents - baseSnapshot.total.automaticAmountCents,
      targetSavingsCents: manualAmountCents === null ? null : 200000 - manualAmountCents,
      targetSavingsRateBps: manualAmountCents === null
        ? null
        : Math.round(((200000 - manualAmountCents) * 10000) / 200000),
    },
  };
}

function snapshotForMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    ...baseSnapshot,
    month,
    monthStart: `${month}-01`,
    monthEnd: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

async function mockBudgetApi(
  page: import("@playwright/test").Page,
  writes: Array<Record<string, unknown>>,
) {
  await page.route("**/api/budgets*", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseSnapshot) });
      return;
    }

    const body = route.request().postDataJSON() as Record<string, unknown>;
    writes.push({ method, ...body });

    if (method === "PATCH" && body.categoryId === null) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(snapshotWithTotalManual(body.manualAmountCents as number | null)),
      });
      return;
    }

    if (method === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseSnapshot) });
      return;
    }

    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "unsupported" }) });
  });
}

test("budget API rejects ambiguous or invalid writes before persistence", async ({ request }) => {
  const invalidMonth = await request.get("/api/budgets?month=2026-13");
  expect(invalidMonth.status()).toBe(400);
  await expect(invalidMonth.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_budget_month" });

  const invalidBody = await request.post("/api/budgets", { data: [] });
  expect(invalidBody.status()).toBe(400);
  await expect(invalidBody.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_budget_body" });

  const negativeManual = await request.patch("/api/budgets", {
    data: { month: "2026-09", categoryId: null, manualAmountCents: -1 },
  });
  expect(negativeManual.status()).toBe(400);
  await expect(negativeManual.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_budget_manual_amount" });

  const missingManual = await request.patch("/api/budgets", {
    data: { month: "2026-09", categoryId: null },
  });
  expect(missingManual.status()).toBe(400);
  await expect(missingManual.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_budget_manual_amount" });

  const missingCategory = await request.patch("/api/budgets", {
    data: { month: "2026-09", manualAmountCents: 10000 },
  });
  expect(missingCategory.status()).toBe(400);
  await expect(missingCategory.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_budget_category_id" });

  const emptyCategory = await request.patch("/api/budgets", {
    data: { month: "2026-09", categoryId: "", manualAmountCents: 10000 },
  });
  expect(emptyCategory.status()).toBe(400);
  await expect(emptyCategory.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_budget_category_id" });
});

test("budget gateway validates payloads before SQL", async () => {
  const sql = () => { throw new Error("sql_should_not_run"); };

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
    payload: { month: "2026-09", categoryId: "not-a-uuid", manualAmountCents: 100 },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_budget_category_id");

  await expect(handleBudgetLogicAction({
    action: "budget.set_manual",
    payload: { month: "2026-09", manualAmountCents: 100 },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_budget_category_id");

  await expect(handleBudgetLogicAction({
    action: "budget.set_manual",
    payload: { month: "2026-09", categoryId: null },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_budget_manual_amount");
});

test("budget gateway classifies domain errors and hides unexpected database details", async () => {
  const missingSql = () => { throw new Error("budget_category_not_found"); };
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
    const failingSql = () => { throw new Error("sensitive_budget_sql_details_must_not_escape"); };
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

test("Presupuestos mantiene formato español, jerarquía clara y controles accesibles", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockBudgetApi(page, writes);
  await page.goto("/budgets?month=2026-09");

  await expect(page.getByRole("heading", { name: "Presupuestos", level: 1 })).toBeVisible();
  await expect(page.getByText(/1\.?200,00/).first()).toBeVisible();
  await expect(page.getByText("Supermercado", { exact: true })).toBeVisible();
  await expect(page.getByText(/La fuente bancaria se mantiene estrictamente en solo lectura/i)).toBeVisible();
  await expect(page.getByText("Histórico, estacionalidad, tendencia y recurrentes conocidos")).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(horizontalOverflow).toBe(false);

  const controlsTooSmall = await page.locator("main button, main input").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.height < 44;
    }).length,
  );
  expect(controlsTooSmall).toBe(0);
  expect(writes).toHaveLength(0);
});

test("Presupuestos guarda y elimina un límite elegido sin confundirlo con el gasto habitual", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockBudgetApi(page, writes);
  await page.goto("/budgets?month=2026-09");

  await page.getByRole("button", { name: "Definir límite" }).first().click();
  const input = page.getByLabel("Límite elegido de total mensual");
  await input.fill("1.500,50");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("Límite elegido guardado");
  expect(writes.at(-1)).toMatchObject({
    method: "PATCH",
    month: "2026-09",
    categoryId: null,
    manualAmountCents: 150050,
  });
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toContainText("400,00 €");

  await page.getByRole("button", { name: "Quitar límite elegido" }).first().click();
  await expect(page.locator("main").getByRole("status")).toContainText("La referencia automática vuelve a aplicarse");
  expect(writes.at(-1)).toMatchObject({ method: "PATCH", manualAmountCents: null });

  await page.getByRole("button", { name: "Definir límite" }).first().click();
  await page.getByLabel("Límite elegido de total mensual").fill("1500.50");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  expect(writes.at(-1)).toMatchObject({ method: "PATCH", manualAmountCents: 150050 });
});

test("Presupuestos rechaza comas ambiguas y acepta el formato monetario español", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockBudgetApi(page, writes);
  await page.goto("/budgets?month=2026-09");

  await page.getByRole("button", { name: "Definir límite" }).first().click();
  const input = page.getByLabel("Límite elegido de total mensual");
  await input.fill("1,234");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.locator("main").getByRole("alert").filter({ hasText: "Introduce un importe válido" }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);

  await input.fill("1.234,56");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("Límite elegido guardado");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    method: "PATCH",
    month: "2026-09",
    categoryId: null,
    manualAmountCents: 123456,
  });
});

test("Presupuestos explica el paso de gasto habitual a límite y ahorro objetivo", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockBudgetApi(page, writes);
  await page.goto("/budgets?month=2026-09");

  const planning = page.getByRole("region", { name: "De la referencia a tu objetivo" });
  await expect(planning).toHaveAttribute("data-planning-state", "ready");
  await expect(planning).toHaveAttribute("data-objective-state", "needs_limit");
  await expect(planning.getByText("Referencia automática", { exact: true })).toBeVisible();
  await expect(planning.getByText("Límite elegido", { exact: true })).toBeVisible();
  await expect(planning.getByText("Objetivo de ahorro resultante", { exact: true })).toBeVisible();
  await expect(planning.getByText(/combina señales históricas para comparar tu gasto; no decide cuánto deberías gastar/i)).toBeVisible();

  await planning.getByRole("button", { name: "Definir mi límite mensual" }).click();
  const totalLimit = page.getByLabel("Límite elegido de total mensual");
  await expect(totalLimit).toBeFocused();
  await totalLimit.fill("1.000,00");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  await expect(planning).toHaveAttribute("data-objective-state", "ready");
  await expect(planning.getByText("1.000,00 €", { exact: true })).toHaveCount(2);
  await expect(planning.getByText(/50,00 % para ahorro/i)).toBeVisible();
  expect(writes.at(-1)).toMatchObject({ manualAmountCents: 100000 });
});

test("QA Work · Presupuestos abre el mes recibido desde otro módulo", async ({ page }) => {
  let requestedMonth = "";

  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only_test" }) });
      return;
    }

    requestedMonth = new URL(route.request().url()).searchParams.get("month") ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshotForMonth(requestedMonth || "2026-09")),
    });
  });

  await page.goto("/budgets?month=2026-07");
  await expect(page.locator('input[type="month"]')).toHaveValue("2026-07");
  await expect(page.getByText("Julio de 2026", { exact: true })).toBeVisible();
  expect(requestedMonth).toBe("2026-07");
});

test("REC-BUD-007 · la navegación interna a Presupuestos restablece el mes vigente sin arrastrar otro mes", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only_test" }) });
      return;
    }
    const month = new URL(route.request().url()).searchParams.get("month") ?? "";
    requested.push(month);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshotForMonth(month)) });
  });
  // Start at a deliberately older month, then navigate to the SAME Next.js
  // route using the real product sidebar link (without the old query).
  await page.goto("/budgets?month=2026-07");
  const monthInput = page.locator('input[type="month"]');
  await expect(monthInput).toHaveValue("2026-07");
  await expect(page.getByText("Julio de 2026", { exact: true })).toBeVisible();

  const navigationLink = page.locator('a[href="/budgets"]:visible').first();
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", timeZone: "Europe/Madrid",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")!.value;
  const monthNumber = parts.find((part) => part.type === "month")!.value;
  const currentMonth = `${year}-${monthNumber}`;
  await expect(monthInput).toHaveValue(currentMonth);
  await expect(page).toHaveURL(new RegExp(`month=${currentMonth}`));
  await expect.poll(() => requested.includes(currentMonth)).toBe(true);
  await expect(page.getByText("Julio de 2026", { exact: true })).toHaveCount(0);
});

test("QA Work · Presupuestos ofrece reintento tras un fallo de persistencia", async ({ page }) => {
  let attempts = 0;
  let retryAllowed = false;

  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only_test" }) });
      return;
    }

    attempts += 1;
    if (!retryAllowed) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "persistence_failed", code: "statement_timeout" }),
      });
      return;
    }

    const selectedMonth = new URL(route.request().url()).searchParams.get("month") ?? "2026-09";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshotForMonth(selectedMonth)),
    });
  });

  await page.goto("/budgets?month=2026-09");
  await expect(page.locator("main").getByRole("alert")).toContainText("no ha podido terminar el cálculo");
  await expect(page.getByRole("heading", { name: "No se ha podido cargar Septiembre de 2026" })).toBeVisible();
  await expect(page.getByText(/datos bancarios siguen intactos/i)).toBeVisible();

  retryAllowed = true;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test("Presupuestos conserva el último mes si una respuesta anterior llega tarde", async ({ page }) => {
  let markAugustStarted: (() => void) | null = null;
  const augustStarted = new Promise<void>((resolve) => {
    markAugustStarted = resolve;
  });

  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only_test" }) });
      return;
    }

    const selectedMonth = new URL(route.request().url()).searchParams.get("month") ?? "2026-09";
    if (selectedMonth === "2026-08") {
      markAugustStarted?.();
      await new Promise((resolve) => setTimeout(resolve, 250));
    } else if (selectedMonth === "2026-07") {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshotForMonth(selectedMonth)),
    });
  });

  await page.goto("/budgets");
  await expect(page.getByRole("heading", { name: "Presupuestos", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toBeVisible();
  const monthInput = page.locator('input[type="month"]');
  await monthInput.fill("2026-08");
  await augustStarted;
  await monthInput.fill("2026-07");

  await expect(page.getByText("Julio de 2026", { exact: true })).toBeVisible();
  await page.waitForTimeout(350);
  await expect(page.getByText("Julio de 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("Agosto de 2026", { exact: true })).toHaveCount(0);
});

test("Presupuestos recalcula de forma explícita sin escribir hasta que el usuario lo pide", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockBudgetApi(page, writes);
  await page.goto("/budgets?month=2026-09");
  await expect(page.getByRole("heading", { name: "Presupuestos", level: 1 })).toBeVisible();
  expect(writes).toHaveLength(0);

  await page.getByRole("button", { name: "Actualizar referencia" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("Referencia automática");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "POST", month: "2026-09" });
});

test("protected preview keeps the validated Phase 6 budget contract in later phases", async ({ request }) => {
  test.skip(!isProtectedPreview, "Exact deployment identity is a protected-preview gate.");

  const response = await request.get("/api/build");
  expect(response.ok()).toBeTruthy();
  const build = await response.json();

  expect(build.phase).toBeGreaterThanOrEqual(6);
  expect(build.environment).toBe("preview");
  if (process.env.GITHUB_SHA) expect(build.commit).toBe(process.env.GITHUB_SHA);
});

test("protected preview returns the current split-aware Axioma §52 budget contract", async ({ request }) => {
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
    actualSource: "financial_transaction_allocation_facts",
    recommendation: "axioma_52_weighted_history_seasonality_trend_recurrence_floor",
    transfersConsumeBudget: false,
    confirmedDuplicatesConsumeBudget: false,
    manualAnalyticsExclusionsRespected: true,
    refundsNetAgainstExpense: false,
    manualOverrideWins: true,
    parentCategoryIncludesDescendants: true,
  });

  expect(snapshot.total.categoryId).toBeNull();
  expect(snapshot.total.historyMonths).toHaveLength(3);
  expect(snapshot.total.automaticFactors).toMatchObject({
    algorithm: "axioma_52_budget_reference_v1",
    recurrencePolicy: "floor_not_additive",
    exclusionsSource: "financial_transaction_allocation_facts.analytics_eligible",
  });
  expect(["fallback_3_month_average", "axioma_52_weighted"]).toContain(snapshot.total.automaticFactors.mode);
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


test("QA-22 · Presupuestos no dibuja gasto para meses exactamente a cero", async ({ page }) => {
  const zeroHistorySnapshot = structuredClone(baseSnapshot);
  zeroHistorySnapshot.total.historyMonths = [
    { month: "2026-06", expenseCents: 100000 },
    { month: "2026-07", expenseCents: 0 },
    { month: "2026-08", expenseCents: 140000 },
  ];

  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() === "GET") {
      const selectedMonth = new URL(route.request().url()).searchParams.get("month") ?? zeroHistorySnapshot.month;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...snapshotForMonth(selectedMonth),
          total: zeroHistorySnapshot.total,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 405,
      contentType: "application/json",
      body: JSON.stringify({ error: "read_only_test" }),
    });
  });

  await page.goto("/budgets");
  const history = page.getByRole("region", { name: "Tres meses recientes visibles de la referencia automática" });
  await expect(history).toContainText("0,00");
  const zeroBar = history.locator('[data-budget-history-bar="true"][data-zero="true"]');
  await expect(zeroBar).toHaveCount(1);
  expect(await zeroBar.evaluate((element) => (element as HTMLElement).style.width)).toBe("0%");
  expect(await zeroBar.evaluate((element) => element.getBoundingClientRect().width)).toBe(0);
});


test("AUD-E2E-PTO-001 · no presenta presupuestos de respuesta inválida y permite reintentar", async ({ page }) => {
  let attempts = 0;
  let retryAllowed = false;
  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only_test" }) });
      return;
    }
    attempts += 1;
    const body = retryAllowed
      ? snapshotForMonth("2026-09")
      : { contractVersion: 1, month: "2026-09", total: { effectiveAmountCents: 0 }, categories: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/budgets?month=2026-09");
  await expect(page.locator("main").getByRole("alert")).toContainText("no es válida");
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toHaveCount(0);
  retryAllowed = true;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test("AUD-E2E-PTO-001 · no sustituye un límite real por una respuesta de escritura de otro mes", async ({ page }) => {
  const writes: string[] = [];
  await page.route("**/api/budgets*", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseSnapshot) });
      return;
    }
    writes.push(method);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshotForMonth("2026-08")) });
  });
  await page.goto("/budgets?month=2026-09");
  const summary = page.getByRole("region", { name: "Resumen del presupuesto mensual" });
  await expect(summary).toBeVisible();
  await page.getByRole("button", { name: "Actualizar referencia" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("No se pudo verificar el presupuesto actualizado");
  await expect(summary).toBeVisible();
  await expect(summary.getByText("1.200,00 €", { exact: true })).toBeVisible();
  expect(writes).toEqual(["POST"]);
});


test("AUD-E2E-PTO-001 · a los 15 segundos advierte y a los 30 permite reintentar sin escrituras", async ({ page }) => {
  await page.clock.install();
  const requests: string[] = [];
  let markRequestStarted: (() => void) | null = null;
  const requestStarted = new Promise<void>((resolve) => { markRequestStarted = resolve; });
  let retryAllowed = false;
  await page.route("**/api/budgets*", async (route) => {
    requests.push(route.request().method());
    markRequestStarted?.();
    markRequestStarted = null;
    if (!retryAllowed) return new Promise<void>(() => {});
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(snapshotForMonth("2026-09")),
    });
  });
  await page.goto("/budgets?month=2026-09", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Cargando presupuesto de/)).toBeVisible();
  // El HTML de carga puede ser visible antes de que React haya arrancado sus temporizadores.
  // Esperamos la primera petición real para no adelantar el reloj antes de montar el efecto.
  await requestStarted;
  await page.clock.runFor(15_100);
  await expect(page.locator("main").getByRole("status").filter({ hasText: "más de 15 segundos" })).toBeVisible();
  await page.clock.runFor(15_100);
  await expect(page.locator("main").getByRole("alert")).toContainText("superado 30 segundos");
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toHaveCount(0);
  retryAllowed = true;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toBeVisible();
  expect(requests.length).toBeGreaterThanOrEqual(2);
  expect(requests.every((method) => method === "GET")).toBe(true);
});


test("RECUPERACION-PRODUCTO · búsqueda y prioridades sin ocultar el total ni editar la fuente", async ({ page }) => {
  const supermarket = baseSnapshot.categories[0];
  const filteredSnapshot = {
    ...baseSnapshot,
    categories: [
      supermarket,
      {
        ...supermarket,
        categoryId: "20000000-0000-4000-8000-000000000062",
        categoryName: "Transporte",
        automaticAmountCents: 20_000,
        effectiveAmountCents: 20_000,
        actualExpenseCents: 55_000,
        remainingCents: -35_000,
        progressBps: 27_500,
        status: "over",
      },
      {
        ...supermarket,
        categoryId: "20000000-0000-4000-8000-000000000063",
        categoryName: "Ocio",
        manualAmountCents: 0,
        effectiveAmountCents: 0,
        actualExpenseCents: 1_500,
        remainingCents: -1_500,
        progressBps: null,
        status: "unfunded",
      },
    ],
  };
  const writes: string[] = [];
  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().method());
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(filteredSnapshot) });
  });

  await page.goto("/budgets?month=2026-09");
  const list = page.getByTestId("budget-category-list");
  await expect(list.getByRole("heading", { name: "Presupuesto mensual total" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Transporte" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Ocio" })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Buscar categorías" });
  await search.fill("trans");
  await expect(list.getByRole("heading", { name: "Transporte" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Ocio" })).toHaveCount(0);
  await expect(list.getByRole("heading", { name: "Supermercado" })).toHaveCount(0);
  await expect(page.getByText("1 de 3 categorías", { exact: true })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Presupuesto mensual total" })).toBeVisible();

  await search.fill("");
  const view = page.getByRole("combobox", { name: "Ver categorías" });
  await view.selectOption("attention");
  await expect(list.getByRole("heading", { name: "Transporte" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Ocio" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Supermercado" })).toHaveCount(0);
  const transport = list.getByRole("heading", { name: "Transporte" }).locator("xpath=ancestor::article");
  await expect(transport.getByRole("link", { name: /Ver movimientos que explican el gasto/ }))
    .toHaveAttribute("href", /dateFrom=2026-09-01.*dateTo=2026-09-30.*categoryId=20000000/);
  await view.selectOption("manual");
  await expect(list.getByRole("heading", { name: "Ocio" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Transporte" })).toHaveCount(0);
  const ocio = list.getByRole("heading", { name: "Ocio" }).locator("xpath=ancestor::article");
  await expect(ocio).toContainText("Límite en cero");
  await expect(ocio.getByRole("link", { name: /Ver movimientos que explican el gasto/ })).toBeVisible();

  await search.fill("no existe");
  await expect(page.getByText("No hay categorías con estos filtros")).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).click();
  await expect(list.getByRole("heading", { name: "Supermercado" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Presupuesto mensual total" })).toBeVisible();
  expect(writes).toEqual([]);
});

test("RECUPERACION-PRODUCTO · aviso de exceso legible en Claro y Oscuro", async ({ page }) => {
  const item = {
    ...baseSnapshot.categories[0],
    categoryId: "20000000-0000-4000-8000-000000000062",
    categoryName: "Transporte",
    automaticAmountCents: 10_000,
    effectiveAmountCents: 10_000,
    actualExpenseCents: 25_000,
    remainingCents: -15_000,
    progressBps: 25_000,
    status: "over",
  };
  await page.route("**/api/budgets*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...baseSnapshot, categories: [item] }) });
  });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/budgets?month=2026-09");
    const panel = page.getByRole("group", { name: "Magnitud del presupuesto · Transporte" });
    await expect(panel).toContainText("Exceso 150,00 €");
    const colors = await panel.evaluate((element) => ({
      text: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    expect(colors.text).not.toEqual(colors.background);
  }
});


test("RECUPERACION-PRODUCTO · no descarta un límite en edición al cambiar mes y conserva la URL", async ({ page }) => {
  const writes: string[] = [];
  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().method());
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only" }) });
      return;
    }
    const month = new URL(route.request().url()).searchParams.get("month") ?? "2026-09";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshotForMonth(month)) });
  });
  await page.goto("/budgets?month=2026-09");
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toBeVisible();
  await page.getByRole("button", { name: "Definir límite" }).first().click();
  const input = page.getByLabel("Límite elegido de total mensual");
  await input.fill("123,45");
  const monthInput = page.locator('input[type="month"]');
  await expect(monthInput).toBeDisabled();
  await expect(page.getByRole("button", { name: "Actualizar referencia" })).toBeDisabled();
  await expect(page.getByRole("searchbox", { name: "Buscar categorías" })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Ver categorías" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Definir límite" }).last()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Definir mi límite mensual" })).toBeDisabled();
  await expect(page.getByText("Tienes un límite en edición. Guárdalo o cancélalo antes de cambiar de mes o actualizar la referencia.")).toBeVisible();
  await expect(input).toHaveValue("123,45");
  await expect(page).toHaveURL(/month=2026-09/);
  expect(writes).toEqual([]);

  await page.getByRole("button", { name: "Cancelar" }).first().click();
  await expect(monthInput).toBeEnabled();
  await monthInput.fill("2026-08");
  await expect(page).toHaveURL(/month=2026-08/);
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toBeVisible();
  await page.reload();
  await expect(monthInput).toHaveValue("2026-08");
  await expect(page.getByRole("region", { name: "Resumen del presupuesto mensual" })).toBeVisible();
  expect(writes).toEqual([]);
});


test("RECUPERACION-PRODUCTO · sin referencia no se inventa un exceso ni un porcentaje", async ({ page }) => {
  const template = baseSnapshot.categories[0];
  const missingReference = {
    ...template,
    categoryId: "20000000-0000-4000-8000-000000000064",
    categoryName: "Sin histórico",
    automaticAmountCents: 0,
    manualAmountCents: null,
    effectiveAmountCents: 0,
    actualExpenseCents: 5_000,
    remainingCents: -5_000,
    progressBps: null,
    status: "unfunded",
  };
  const explicitZero = {
    ...missingReference,
    categoryId: "20000000-0000-4000-8000-000000000065",
    categoryName: "Límite cero",
    manualAmountCents: 0,
  };
  await page.route("**/api/budgets*", (route) => {
    if (route.request().method() !== "GET") throw new Error("Read-only regression");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...baseSnapshot, categories: [missingReference, explicitZero] }),
    });
  });
  await page.goto("/budgets?month=2026-09");
  const absent = page.getByRole("heading", { name: "Sin histórico" }).locator("xpath=ancestor::article");
  await expect(absent).toContainText("Referencia no disponible");
  await expect(absent).toContainText("Sin histórico suficiente para fijar una referencia");
  await expect(absent.getByText("Referencia no disponible").locator("..").locator("strong")).toHaveText("—");
  await expect(absent.getByText("Margen no calculable").locator("..").locator("strong")).toHaveText("—");
  await expect(absent).toContainText("Gasto sin referencia 50,00 €");
  await expect(absent).toContainText("Falta histórico o límite elegido para calcular un exceso.");
  await expect(absent).not.toContainText("Exceso 50,00 €");
  await expect(absent.getByRole("link", { name: /Ver movimientos que explican el gasto/ })).toBeVisible();

  const zero = page.getByRole("heading", { name: "Límite cero" }).locator("xpath=ancestor::article");
  await expect(zero).toContainText("Límite en cero");
  await expect(zero).toContainText("Exceso 50,00 €");
  await expect(zero).toContainText("Límite 0 € superado");
  await expect(zero.getByText("Límite elegido", { exact: true }).locator("..").locator("strong")).toHaveText("0,00 €");
  await expect(zero).not.toContainText("Gasto sin referencia");
});
