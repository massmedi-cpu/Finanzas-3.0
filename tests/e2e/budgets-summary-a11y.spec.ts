import { expect, test } from "@playwright/test";

const snapshot = {
  contractVersion: 1,
  month: "2026-09",
  monthStart: "2026-09-01",
  monthEnd: "2026-09-30",
  total: {
    id: null,
    persisted: false,
    categoryId: null,
    categoryName: null,
    categoryLifecycle: null,
    automaticAmountCents: 100000,
    manualAmountCents: null,
    effectiveAmountCents: 100000,
    actualExpenseCents: 50000,
    remainingCents: 50000,
    progressBps: 5000,
    status: "on_track",
    automaticExplanation: "Media de los tres meses completos anteriores.",
    historyMonths: [],
  },
  categories: [],
  principles: {
    bankSource: "read_only",
    actualSource: "financial_transaction_facts",
    recommendation: "trailing_3_complete_month_average",
    transfersConsumeBudget: false,
    confirmedDuplicatesConsumeBudget: false,
    manualAnalyticsExclusionsRespected: true,
    refundsNetAgainstExpense: false,
    manualOverrideWins: true,
    parentCategoryIncludesDescendants: true,
  },
};

test("resumen de presupuestos conserva estructura semántica y microtexto legible", async ({ page }) => {
  await page.route("**/api/budgets*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
  await page.goto("/budgets");

  const summary = page.getByLabel("Resumen del presupuesto mensual");
  await expect(summary).toBeVisible();
  await expect(summary.locator("article")).toHaveCount(4);

  const labels = ["Presupuesto", "Gastado", "Disponible", "Consumo"];
  for (const label of labels) {
    const target = summary.getByText(label, { exact: true });
    await expect(target).toBeVisible();
    const fontSize = await target.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(13);
  }
});
