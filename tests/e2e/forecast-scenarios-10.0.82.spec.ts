import { expect, test } from "@playwright/test";
import {
  buildForecastScenarios,
  DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS,
  normalizeForecastScenarioAssumptions,
} from "../../src/application/forecast/forecast-scenarios";

const snapshot = {
  contractVersion: 1 as const,
  period: { dateFrom: "2026-10-07", dateTo: "2026-11-06", accountId: null },
  summary: {
    openingBalanceCents: 100_000,
    projectedIncomeCents: 20_000,
    projectedExpenseCents: 10_000,
    projectedNetCents: 10_000,
    projectedClosingBalanceCents: 110_000,
    plannedItems: 2,
    excludedItems: 0,
    confirmedItems: 0,
  },
  items: [
    {
      id: "81000000-0000-4000-8000-000000000082",
      date: "2026-10-15",
      accountId: null, accountName: null, categoryId: null, categoryName: null,
      merchantId: null, merchantName: null, concept: "Ingreso previsto",
      amountCents: 20_000, origin: "manual" as const, confidence: "high" as const,
      recurrenceId: null, budgetId: null, confirmedTransactionId: null,
      excluded: false, excludedReason: "", reconciliationNote: "", projectionKey: null,
      updatedAt: "2026-10-07T10:00:00.000Z", status: "planned" as const,
      affectsProjection: true, projectionEffectCents: 20_000, projectedBalanceAfterCents: 120_000,
      actual: null,
    },
    {
      id: "81000000-0000-4000-8000-000000000083",
      date: "2026-10-20",
      accountId: null, accountName: null, categoryId: null, categoryName: null,
      merchantId: null, merchantName: null, concept: "Gasto previsto",
      amountCents: -10_000, origin: "manual" as const, confidence: "high" as const,
      recurrenceId: null, budgetId: null, confirmedTransactionId: null,
      excluded: false, excludedReason: "", reconciliationNote: "", projectionKey: null,
      updatedAt: "2026-10-07T10:00:00.000Z", status: "planned" as const,
      affectsProjection: true, projectionEffectCents: -10_000, projectedBalanceAfterCents: 110_000,
      actual: null,
    },
  ],
  budgetContext: [],
  balanceContext: {
    quality: {
      accounts: 2,
      integrityDeltaAccounts: 0,
      explicitBalanceAccounts: 2,
      reconstructedBalanceAccounts: 0,
    },
    accounts: [],
  },
  principles: {
    bankSource: "read_only",
    openingBalanceSource: "financial_account_balances",
    recurrenceSource: "active_recurrences_only",
    budgetsCreateDatedItems: false,
    excludedItemsAffectCashFlow: false,
    confirmedItemsAffectCashFlow: false,
    getHasSideEffects: false,
  },
};

test("Axioma §42 calcula escenarios sin alterar la base canónica", () => {
  const scenarios = buildForecastScenarios(snapshot, DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS);
  expect(scenarios.map((scenario) => ({
    key: scenario.key,
    incomeCents: scenario.incomeCents,
    expenseCents: scenario.expenseCents,
    closingBalanceCents: scenario.closingBalanceCents,
  }))).toEqual([
    { key: "expected", incomeCents: 20_000, expenseCents: 10_000, closingBalanceCents: 110_000 },
    { key: "conservative", incomeCents: 19_000, expenseCents: 11_000, closingBalanceCents: 108_000 },
    { key: "optimistic", incomeCents: 21_000, expenseCents: 9_500, closingBalanceCents: 111_500 },
  ]);

  expect(snapshot.summary.projectedClosingBalanceCents).toBe(110_000);
});

test("Axioma §42 normaliza hipótesis persistidas a límites seguros", () => {
  expect(normalizeForecastScenarioAssumptions({
    conservative: { incomeAdjustmentPercent: -500, expenseAdjustmentPercent: 250 },
    optimistic: { incomeAdjustmentPercent: "10", expenseAdjustmentPercent: "x" },
  })).toEqual({
    conservative: { incomeAdjustmentPercent: -100, expenseAdjustmentPercent: 100 },
    optimistic: { incomeAdjustmentPercent: 10, expenseAdjustmentPercent: -5 },
  });
});

test("Previsión muestra y persiste escenarios editables sin escrituras financieras", async ({ page }) => {
  const financialWrites: string[] = [];

  await page.route("**/api/forecast*", async (route) => {
    const method = route.request().method();
    if (method !== "GET") financialWrites.push(method);
    await route.fulfill({
      status: method === "GET" ? 200 : 409,
      contentType: "application/json",
      body: JSON.stringify(method === "GET" ? snapshot : { error: "unexpected_write" }),
    });
  });

  await page.goto("/forecast");

  const scenarios = page.getByTestId("forecast-scenarios");
  await expect(scenarios.getByRole("heading", { name: "¿Qué pasaría si cambian tus ingresos o gastos?" })).toBeVisible();
  await expect(scenarios.locator('[data-scenario="expected"]')).toContainText(/1\.100,00\s?€/);
  await expect(scenarios.locator('[data-scenario="conservative"]')).toContainText(/1\.080,00\s?€/);
  await expect(scenarios.locator('[data-scenario="optimistic"]')).toContainText(/1\.115,00\s?€/);
  await expect(scenarios).toContainText("no crean movimientos");
  await expect(scenarios).toContainText("no modifican la fuente bancaria");

  const conservativeIncome = scenarios.getByLabel("Ingresos · Conservador (%)");
  const conservativeExpense = scenarios.getByLabel("Gastos · Conservador (%)");
  await conservativeIncome.fill("-10");
  await conservativeExpense.fill("20");

  await expect(scenarios.locator('[data-scenario="conservative"]')).toContainText(/1\.060,00\s?€/);

  await page.reload();
  await expect(scenarios.getByLabel("Ingresos · Conservador (%)")).toHaveValue("-10");
  await expect(scenarios.getByLabel("Gastos · Conservador (%)")).toHaveValue("20");
  await expect(scenarios.locator('[data-scenario="conservative"]')).toContainText(/1\.060,00\s?€/);
  expect(financialWrites).toEqual([]);
});
