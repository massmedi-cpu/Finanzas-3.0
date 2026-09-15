import { expect, test } from "@playwright/test";

const categoryOver = "20000000-0000-4000-8000-000000000071";
const categoryNear = "20000000-0000-4000-8000-000000000072";

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
    actualExpenseCents: 97000,
    remainingCents: 23000,
    progressBps: 8083,
    status: "on_track",
    automaticExplanation: "Media del gasto elegible de los 3 meses completos anteriores.",
    historyMonths: [
      { month: "2026-06", expenseCents: 105000 },
      { month: "2026-07", expenseCents: 120000 },
      { month: "2026-08", expenseCents: 135000 },
    ],
  },
  categories: [
    {
      id: null,
      persisted: false,
      categoryId: categoryNear,
      categoryName: "Restaurantes",
      categoryLifecycle: "active",
      automaticAmountCents: 30000,
      manualAmountCents: null,
      effectiveAmountCents: 30000,
      actualExpenseCents: 25500,
      remainingCents: 4500,
      progressBps: 8500,
      status: "on_track",
      automaticExplanation: "Media del gasto elegible de los 3 meses completos anteriores.",
      historyMonths: [],
    },
    {
      id: null,
      persisted: false,
      categoryId: categoryOver,
      categoryName: "Supermercado",
      categoryLifecycle: "active",
      automaticAmountCents: 40000,
      manualAmountCents: null,
      effectiveAmountCents: 40000,
      actualExpenseCents: 47000,
      remainingCents: -7000,
      progressBps: 11750,
      status: "over",
      automaticExplanation: "Media del gasto elegible de los 3 meses completos anteriores.",
      historyMonths: [],
    },
  ],
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

async function mockBudgets(page: import("@playwright/test").Page) {
  await page.route("**/api/budgets*", async (route) => {
    if (route.request().method() === "GET") {
      const selectedMonth = new URL(route.request().url()).searchParams.get("month") ?? snapshot.month;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...snapshot, month: selectedMonth, monthStart: `${selectedMonth}-01`, monthEnd: `${selectedMonth}-30` }),
      });
      return;
    }
    await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only_visual_fixture" }) });
  });
}

test("Presupuestos premium prioriza las categorías que requieren acción", async ({ page }) => {
  await mockBudgets(page);
  await page.goto("/budgets");

  await expect(page.getByRole("heading", { name: "Presupuestos", level: 1 })).toBeVisible();
  const attention = page.getByRole("heading", { name: "Necesita atención" }).locator("xpath=ancestor::section");
  await expect(attention).toBeVisible();
  await expect(attention.getByText("Supermercado", { exact: true })).toBeVisible();
  await expect(attention.getByText(/Exceso 70,00/)).toBeVisible();
  await expect(attention.getByText("Restaurantes", { exact: true })).toBeVisible();
  await expect(attention.getByText(/85/)).toBeVisible();

  const categoryHeadings = page.locator("article[data-budget-state] h3");
  await expect(categoryHeadings.nth(0)).toHaveText("Presupuesto mensual total");
  await expect(categoryHeadings.nth(1)).toHaveText("Supermercado");
  await expect(categoryHeadings.nth(2)).toHaveText("Restaurantes");
});

test("Presupuestos premium no desborda y conserva controles táctiles en la matriz responsive", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz se ejecuta una vez por run");
  await mockBudgets(page);

  for (const width of [360, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/budgets");
    await expect(page.getByRole("heading", { name: "Presupuestos", level: 1 })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, `${width}px no debe producir overflow horizontal`).toBe(false);

    const tooSmall = await page.locator("main a[href], main button:not([disabled]), main input:not([disabled]), main summary").evaluateAll((elements) =>
      elements.filter((element) => {
        const box = (element as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(element as HTMLElement);
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && box.height < 44;
      }).map((element) => `${element.tagName}:${Math.round((element as HTMLElement).getBoundingClientRect().height)}px`),
    );
    expect(tooSmall, `${width}px debe conservar targets de 44px`).toEqual([]);
  }
});

test("Presupuestos premium mantiene el método secundario y la fuente bancaria visible", async ({ page }) => {
  await mockBudgets(page);
  await page.goto("/budgets");
  await expect(page.getByText(snapshot.total.automaticExplanation, { exact: true })).toBeVisible();
  await page.getByText("Cómo se calcula", { exact: true }).click();
  await expect(page.getByText("La fuente bancaria se mantiene estrictamente en solo lectura.", { exact: true })).toBeVisible();
});
