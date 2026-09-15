import { expect, test } from "@playwright/test";

test("una categoría enlaza a sus movimientos del mismo mes", async ({ page }) => {
  const categoryId = "20000000-0000-4000-8000-000000000111";
  const snapshot = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 100000, manualAmountCents: null, effectiveAmountCents: 100000,
      actualExpenseCents: 40000, remainingCents: 60000, progressBps: 4000, status: "on_track",
      automaticExplanation: "Media de los tres meses completos anteriores.", historyMonths: [] },
    categories: [{ id: null, persisted: false, categoryId, categoryName: "Transporte", categoryLifecycle: "active",
      automaticAmountCents: 20000, manualAmountCents: null, effectiveAmountCents: 20000,
      actualExpenseCents: 9000, remainingCents: 11000, progressBps: 4500, status: "on_track",
      automaticExplanation: "Media de los tres meses completos anteriores.", historyMonths: [] }],
    principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto("/budgets");
  const card = page.getByRole("heading", { name: "Transporte" }).locator("xpath=ancestor::article");
  await expect(card.getByRole("link", { name: "Ver movimientos" })).toHaveAttribute("href", `/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&kind=expense&categoryId=${categoryId}`);
});
