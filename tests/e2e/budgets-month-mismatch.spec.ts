import { expect, test } from "@playwright/test";

test("cliente rechaza un presupuesto de otro mes", async ({ page }) => {
  const snapshot = {
    contractVersion: 1, month: "2026-08", monthStart: "2026-08-01", monthEnd: "2026-08-31",
    total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 0, manualAmountCents: null, effectiveAmountCents: 0, actualExpenseCents: 0,
      remainingCents: 0, progressBps: null, status: "empty", automaticExplanation: "Media.", historyMonths: [] },
    categories: [], principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto("/budgets");
  await expect(page.getByRole("alert")).toContainText("incompatible con el mes seleccionado");
});
