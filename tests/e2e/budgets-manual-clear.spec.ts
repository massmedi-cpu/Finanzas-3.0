import { expect, test } from "@playwright/test";

test("volver a automático restaura la recomendación central", async ({ page }) => {
  const base = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { id: "70000000-0000-4000-8000-000000000001", persisted: true, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 100000, manualAmountCents: 120000, effectiveAmountCents: 120000,
      actualExpenseCents: 40000, remainingCents: 80000, progressBps: 3333, status: "on_track",
      automaticExplanation: "Media.", historyMonths: [] }, categories: [],
    principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(base) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...base, total: { ...base.total, manualAmountCents: null, effectiveAmountCents: 100000, remainingCents: 60000, progressBps: 4000 } }) });
  });
  await page.goto("/budgets");
  await page.getByRole("button", { name: "Volver a automático" }).first().click();
  await expect(page.getByRole("status")).toContainText("restaurado el cálculo automático");
  await expect(page.getByRole("button", { name: "Fijar límite manual" }).first()).toBeVisible();
});
