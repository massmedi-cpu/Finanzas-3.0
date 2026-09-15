import { expect, test } from "@playwright/test";

function snapshotForMonth(month: string) {
  return {
    contractVersion: 1,
    month,
    monthStart: `${month}-01`,
    monthEnd: `${month}-30`,
    total: {
      id: null,
      persisted: false,
      categoryId: null,
      categoryName: null,
      categoryLifecycle: null,
      automaticAmountCents: 100000,
      manualAmountCents: null,
      effectiveAmountCents: 100000,
      actualExpenseCents: 25000,
      remainingCents: 75000,
      progressBps: 2500,
      status: "on_track",
      automaticExplanation: "Media de los tres meses completos anteriores.",
      historyMonths: [
        { month: "2026-05", expenseCents: 90000 },
        { month: "2026-06", expenseCents: 100000 },
        { month: "2026-07", expenseCents: 110000 },
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
}

test("Presupuestos cancela la lectura anterior cuando el usuario cambia de mes", async ({ page }) => {
  let augustRequest: import("@playwright/test").Request | null = null;
  let markAugustStarted: (() => void) | null = null;
  const augustStarted = new Promise<void>((resolve) => { markAugustStarted = resolve; });

  await page.route("**/api/budgets*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only_test" }) });
      return;
    }
    const selectedMonth = new URL(request.url()).searchParams.get("month") ?? "2026-09";
    if (selectedMonth === "2026-08") {
      augustRequest = request;
      markAugustStarted?.();
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (request.isNavigationRequest()) return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshotForMonth(selectedMonth)) }).catch(() => undefined);
  });

  await page.goto("/budgets");
  const month = page.locator('input[type="month"]');
  await month.fill("2026-08");
  await augustStarted;
  await month.fill("2026-07");

  await expect(page.getByText("Julio de 2026", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(420);
  await expect(page.getByText("Agosto de 2026", { exact: true })).toHaveCount(0);
  expect(augustRequest).not.toBeNull();
});
