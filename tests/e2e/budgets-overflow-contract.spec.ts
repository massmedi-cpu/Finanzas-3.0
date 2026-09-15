import { expect, test } from "@playwright/test";

test("Presupuestos no crea overflow horizontal en 1280 px", async ({ page }) => {
  const snapshot = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 123456789, manualAmountCents: null, effectiveAmountCents: 123456789,
      actualExpenseCents: 98765432, remainingCents: 24691357, progressBps: 8000, status: "on_track",
      automaticExplanation: "Media de los tres meses completos anteriores.", historyMonths: [] },
    categories: [], principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/budgets");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
