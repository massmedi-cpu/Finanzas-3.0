import { expect, test, type Page, type Route } from "@playwright/test";

const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-11",
    incomeCents: 150000,
    expenseCents: 70000,
    operatingNetCents: 80000,
    savingsCents: 80000,
    savingsRateBps: 5333,
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-11",
    activeBalanceCents: 30000,
    accounts: [
      {
        id: "a",
        name: "Cuenta principal",
        type: "checking",
        lifecycle: "active",
        balanceCents: 30000,
        explicitBalanceDate: "2026-09-11",
      },
    ],
  },
};

const monthly = {
  dateFrom: "2026-01-01",
  dateTo: "2026-09-11",
  rows: [
    { monthStart: "2026-08-01", incomeCents: 100000, expenseCents: 40000, operatingNetCents: 60000 },
    { monthStart: "2026-09-01", incomeCents: 150000, expenseCents: 70000, operatingNetCents: 80000 },
  ],
};

const budgets = {
  month: "2026-09",
  total: {
    categoryId: null,
    categoryName: null,
    effectiveAmountCents: 100000,
    actualExpenseCents: 60000,
    remainingCents: 40000,
    progressBps: 6000,
    status: "on_track",
  },
  categories: [],
};

const forecast = {
  summary: {
    projectedIncomeCents: 0,
    projectedExpenseCents: 0,
    projectedNetCents: 0,
    projectedClosingBalanceCents: 30000,
    plannedItems: 0,
  },
  items: [],
};

const transactions = { rows: [], totalCount: 0 };

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockDashboard(page: Page) {
  await page.route("**/api/source/google/sync", (route) => fulfillJson(route, { run: null }));

  await page.route(/\/api\/dashboard\?scope=primary(?:&|$)/, (route) =>
    fulfillJson(route, {
      contractVersion: 1,
      scope: "primary",
      asOfDate: "2026-09-11",
      dataThroughDate: null,
      generatedAt: "2026-09-11T12:00:00.000Z",
      requestedSources: ["financial", "transactions"],
      failedSources: [],
      data: { financial, monthly: null, budgets: null, forecast: null, transactions },
    }),
  );

  await page.route(/\/api\/dashboard\?scope=secondary(?:&|$)/, (route) =>
    fulfillJson(route, {
      contractVersion: 1,
      scope: "secondary",
      asOfDate: "2026-09-11",
      dataThroughDate: null,
      generatedAt: "2026-09-11T12:00:00.000Z",
      requestedSources: ["monthly", "budgets", "forecast"],
      failedSources: [],
      data: { financial: null, monthly, budgets, forecast, transactions: null },
    }),
  );
}

test("Premium · la gráfica de Inicio expone valores exactos mediante foco y tap sin depender de hover", async ({ page }) => {
  await mockDashboard(page);
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/");

  const chart = page.getByRole("group", { name: /Ingresos y gastos por mes/i });
  await expect(chart).toBeVisible();

  const september = chart.getByRole("button", {
    name: /ingresos 1\.500,00.*gastos 700,00.*balance neto 800,00/i,
  });
  await expect(september).toBeVisible();
  await expect(september).toHaveAccessibleName(/mes parcial/i);

  await september.focus();
  await expect(september).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: /Ingresos 1\.500,00/ })).toContainText(
    /Ingresos 1\.500,00.*Gastos 700,00.*Balance 800,00/i,
  );

  const august = chart.getByRole("button", {
    name: /ingresos 1\.000,00.*gastos 400,00.*balance neto 600,00/i,
  });
  await august.click();
  await expect(august).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: /Ingresos 1\.000,00/ })).toContainText(
    /Ingresos 1\.000,00.*Gastos 400,00.*Balance 600,00/i,
  );

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
  ).toBe(true);
});
