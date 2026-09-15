import { expect, test } from "@playwright/test";

test("el resumen mantiene el orden presupuesto, gasto, margen y consumo", async ({ page }) => {
  const snapshot = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null,
      automaticAmountCents: 100000, manualAmountCents: null, effectiveAmountCents: 100000,
      actualExpenseCents: 40000, remainingCents: 60000, progressBps: 4000, status: "on_track",
      automaticExplanation: "Media de los tres meses completos anteriores.", historyMonths: [] },
    categories: [], principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto("/budgets");
  const labels = await page.getByLabel("Resumen del presupuesto mensual").locator("article > span").allTextContents();
  expect(labels).toEqual(["Presupuesto", "Gastado", "Disponible", "Consumo"]);
});
