import { expect, test } from "@playwright/test";

test("Presupuestos abre el mes actual de Madrid", async ({ page }) => {
  const month = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Europe/Madrid" })
    .formatToParts(new Date())
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {} as Record<string, string>);
  const current = `${month.year}-${month.month}`;
  const snapshot = {
    contractVersion: 1, month: current, monthStart: `${current}-01`, monthEnd: `${current}-30`,
    total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 100000, manualAmountCents: null, effectiveAmountCents: 100000,
      actualExpenseCents: 40000, remainingCents: 60000, progressBps: 4000, status: "on_track",
      automaticExplanation: "Media.", historyMonths: [] }, categories: [],
    principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto("/budgets");
  await expect(page.locator('input[type="month"]')).toHaveValue(current);
});
