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
    automaticAmountCents: 90000,
    manualAmountCents: 100000,
    effectiveAmountCents: 100000,
    actualExpenseCents: 110000,
    remainingCents: -10000,
    progressBps: 11000,
    status: "over",
    automaticExplanation: "Media de los tres meses completos anteriores.",
    historyMonths: [
      { month: "2026-06", expenseCents: 80000 },
      { month: "2026-07", expenseCents: 90000 },
      { month: "2026-08", expenseCents: 100000 },
    ],
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

test("resumen premium refleja exactamente presupuesto efectivo, gasto y exceso del snapshot", async ({ page }) => {
  await page.route("**/api/budgets*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
  await page.goto("/budgets");

  const summary = page.getByLabel("Resumen del presupuesto mensual");
  await expect(summary.getByText(/1\.000,00/)).toBeVisible();
  await expect(summary.getByText(/1\.100,00/)).toBeVisible();
  await expect(summary.getByText(/100,00/)).toBeVisible();
  await expect(summary.getByText(/110/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar límite manual" }).first()).toBeVisible();
});
