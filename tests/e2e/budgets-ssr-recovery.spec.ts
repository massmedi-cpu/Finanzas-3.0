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
    automaticAmountCents: 120000,
    manualAmountCents: null,
    effectiveAmountCents: 120000,
    actualExpenseCents: 40000,
    remainingCents: 80000,
    progressBps: 3333,
    status: "on_track",
    automaticExplanation: "Media del gasto elegible de los 3 meses completos anteriores.",
    historyMonths: [
      { month: "2026-06", expenseCents: 100000 },
      { month: "2026-07", expenseCents: 120000 },
      { month: "2026-08", expenseCents: 140000 },
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

test("Presupuestos recupera en cliente cuando la carga SSR no dispone de contexto persistente", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only_test" }) });
      return;
    }
    reads += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });

  await page.goto("/budgets");
  await expect(page.getByRole("heading", { name: "Presupuestos", level: 1 })).toBeVisible();
  await expect(page.getByText(/1\.?200,00/).first()).toBeVisible();
  expect(reads).toBeGreaterThanOrEqual(1);
});
