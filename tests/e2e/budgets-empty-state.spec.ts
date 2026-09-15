import { expect, test } from "@playwright/test";

test("sin categorías de gasto mantiene una salida clara hacia Configuración", async ({ page }) => {
  const snapshot = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 100000, manualAmountCents: null, effectiveAmountCents: 100000,
      actualExpenseCents: 0, remainingCents: 100000, progressBps: 0, status: "on_track",
      automaticExplanation: "Media.", historyMonths: [] }, categories: [],
    principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto("/budgets");
  await expect(page.getByText("No hay categorías de gasto activas", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir Configuración" })).toHaveAttribute("href", "/configuration");
});
