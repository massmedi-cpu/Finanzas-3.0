import { expect, test } from "@playwright/test";

test("histórico de referencia muestra los importes reales del snapshot", async ({ page }) => {
  const snapshot = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 120000, manualAmountCents: null, effectiveAmountCents: 120000,
      actualExpenseCents: 40000, remainingCents: 80000, progressBps: 3333, status: "on_track",
      automaticExplanation: "Media del gasto elegible de los 3 meses completos anteriores.",
      historyMonths: [{ month: "2026-06", expenseCents: 100000 }, { month: "2026-07", expenseCents: 120000 }, { month: "2026-08", expenseCents: 140000 }] },
    categories: [], principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto("/budgets");
  const history = page.getByLabel("Histórico de gasto usado para recomendar presupuesto");
  await expect(history.getByText(/1\.000,00/)).toBeVisible();
  await expect(history.getByText(/1\.200,00/)).toBeVisible();
  await expect(history.getByText(/1\.400,00/)).toBeVisible();
});
