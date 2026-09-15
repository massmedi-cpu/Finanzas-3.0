import { expect, test } from "@playwright/test";

test("un límite manual de cero sigue siendo una elección explícita", async ({ page }) => {
  const base = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 100000, manualAmountCents: null, effectiveAmountCents: 100000,
      actualExpenseCents: 1000, remainingCents: 99000, progressBps: 100, status: "on_track",
      automaticExplanation: "Media.", historyMonths: [] }, categories: [],
    principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(base) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...base, total: { ...base.total, persisted: true, manualAmountCents: 0, effectiveAmountCents: 0, remainingCents: -1000, progressBps: null, status: "unfunded" } }) });
  });
  await page.goto("/budgets");
  await page.getByRole("button", { name: "Fijar límite manual" }).first().click();
  await page.getByLabel("Presupuesto manual de total mensual").fill("0,00");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Sin límite", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Manual · automático 1\.000,00/)).toBeVisible();
});
