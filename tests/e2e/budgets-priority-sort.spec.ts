import { expect, test } from "@playwright/test";

test("categorías superadas se muestran antes que las categorías en objetivo", async ({ page }) => {
  const make = (id: string, name: string, status: "over" | "on_track", progressBps: number) => ({
    id: null, persisted: false, categoryId: id, categoryName: name, categoryLifecycle: "active" as const,
    automaticAmountCents: 10000, manualAmountCents: null, effectiveAmountCents: 10000,
    actualExpenseCents: status === "over" ? 12000 : 2000, remainingCents: status === "over" ? -2000 : 8000,
    progressBps, status, automaticExplanation: "Media.", historyMonths: [],
  });
  const snapshot = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { ...make("20000000-0000-4000-8000-000000000001", "Total", "on_track", 4000), categoryId: null, categoryName: null, categoryLifecycle: null },
    categories: [
      make("20000000-0000-4000-8000-000000000121", "Baja prioridad", "on_track", 2000),
      make("20000000-0000-4000-8000-000000000122", "Alta prioridad", "over", 12000),
    ],
    principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto("/budgets");
  const headings = page.locator("article[data-budget-state] h3");
  await expect(headings.nth(1)).toHaveText("Alta prioridad");
  await expect(headings.nth(2)).toHaveText("Baja prioridad");
});
