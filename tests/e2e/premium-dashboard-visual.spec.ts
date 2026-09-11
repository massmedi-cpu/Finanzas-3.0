import { expect, test } from "@playwright/test";

async function mockDashboard(page: import("@playwright/test").Page) {
  const financial = {
    period: {
      dateFrom: "2026-09-01", dateTo: "2026-09-11", incomeCents: 150000, expenseCents: 70000,
      operatingNetCents: 80000, savingsCents: 80000, savingsRateBps: 5333,
      transfers: { grossCents: 0 }, quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
    },
    balances: {
      asOfDate: "2026-09-11", activeBalanceCents: 30000,
      quality: { accounts: 1, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0, integrityDeltaAccounts: 0 },
      accounts: [{ id: "a", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 30000, balanceSource: "bank_explicit", explicitBalanceDate: "2026-09-11", reconstructionDeltaCents: 0 }],
    },
    principles: { bankSource: "read_only", transfersExcludedFromSavings: true, explicitBankBalancePreferred: true },
  };
  const monthly = {
    dateFrom: "2026-01-01", dateTo: "2026-09-11",
    rows: [
      { monthStart: "2026-08-01", incomeCents: 100000, expenseCents: 40000, operatingNetCents: 60000 },
      { monthStart: "2026-09-01", incomeCents: 150000, expenseCents: 70000, operatingNetCents: 80000 },
    ],
  };
  const budgets = {
    month: "2026-09",
    total: { effectiveAmountCents: 100000, actualExpenseCents: 60000, remainingCents: 40000, progressBps: 6000, status: "on_track" },
    categories: [],
  };
  const forecast = {
    period: { dateFrom: "2026-09-11", dateTo: "2026-10-11", accountId: null },
    summary: { openingBalanceCents: 30000, projectedIncomeCents: 0, projectedExpenseCents: 0, projectedNetCents: 0, projectedClosingBalanceCents: 30000, plannedItems: 0, excludedItems: 0, confirmedItems: 0 },
    items: [],
  };
  const transactions = { rows: [], totalCount: 0 };

  await page.route("**/api/financial?*", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.searchParams.get("mode") === "monthly" ? monthly : financial) });
  });
  await page.route("**/api/budgets?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(budgets) }));
  await page.route("**/api/forecast?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecast) }));
  await page.route("**/api/transactions?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(transactions) }));
}

test("Premium · la gráfica de Inicio expone valores exactos mediante foco y tap sin depender de hover", async ({ page }) => {
  await mockDashboard(page);
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/");

  const chart = page.getByRole("group", { name: /Ingresos y gastos por mes/i });
  await expect(chart).toBeVisible();

  const september = chart.getByRole("button", { name: /ingresos 1\.500,00.*gastos 700,00/i });
  await expect(september).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);

  await september.focus();
  await expect(september).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText(/Ingresos 1\.500,00.*Gastos 700,00/i);

  const august = chart.getByRole("button", { name: /ingresos 1\.000,00.*gastos 400,00/i });
  await august.click();
  await expect(august).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText(/Ingresos 1\.000,00.*Gastos 400,00/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
