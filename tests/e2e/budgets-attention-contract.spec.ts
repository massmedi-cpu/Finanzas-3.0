import { expect, test } from "@playwright/test";

test("Necesita atención no aparece cuando ninguna categoría supera el umbral", async ({ page }) => {
  const snapshot = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 100000, manualAmountCents: null, effectiveAmountCents: 100000,
      actualExpenseCents: 20000, remainingCents: 80000, progressBps: 2000, status: "on_track",
      automaticExplanation: "Media de los tres meses completos anteriores.", historyMonths: [] },
    categories: [{ id: null, persisted: false, categoryId: "20000000-0000-4000-8000-000000000099", categoryName: "Hogar", categoryLifecycle: "active",
      automaticAmountCents: 50000, manualAmountCents: null, effectiveAmountCents: 50000,
      actualExpenseCents: 10000, remainingCents: 40000, progressBps: 2000, status: "on_track",
      automaticExplanation: "Media de los tres meses completos anteriores.", historyMonths: [] }],
    principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto("/budgets");
  await expect(page.getByRole("heading", { name: "Necesita atención" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hogar" })).toBeVisible();
});
