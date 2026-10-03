import { expect, test, type Page } from "@playwright/test";

const emptyData = () => ({ financial: null, monthly: null, budgets: null, forecast: null, transactions: null });

async function mockProgressiveDashboard(page: Page) {
  const requestedScopes: string[] = [];
  await page.route("**/api/source/google/sync", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: { id: "sync-1", status: "success", startedAt: "2026-10-03T08:00:00.000Z", finishedAt: "2026-10-03T08:00:01.000Z", rowsSeen: 1, rowsInserted: 0, rowsRevised: 0, rowsSkipped: 1, rowsFailed: 0, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0, errorCode: null, errorMessage: null }, cursors: [] }) });
  });

  await page.route("**/api/dashboard**", async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope") ?? "all";
    requestedScopes.push(scope);
    const data: any = emptyData();
    let requestedSources: string[] = [];
    let dataThroughDate: string | null = null;

    if (scope === "critical") {
      requestedSources = ["financial"];
      data.financial = {
        period: { dateFrom: "2026-10-01", dateTo: "2026-10-03", incomeCents: 200000, expenseCents: 50000, operatingNetCents: 150000, savingsCents: 150000, savingsRateBps: 7500, quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 } },
        balances: { asOfDate: "2026-10-03", activeBalanceCents: 123456, accounts: [{ id: "acc-1", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 123456, explicitBalanceDate: "2026-10-03" }] },
      };
    } else if (scope === "activity") {
      requestedSources = ["transactions"];
      await new Promise((resolve) => setTimeout(resolve, 1500));
      dataThroughDate = "2026-10-03";
      data.transactions = { rows: [{ id: "tx-late", bankDate: "2026-10-03", amountCents: -1250, account: { id: "acc-1", name: "Cuenta principal" }, concept: { effective: "Compra de prueba" }, merchant: { effectiveName: "Movimiento tardío" }, category: { effectiveId: null, effectiveName: null }, kind: { effective: "expense" }, duplicateState: "none", excludedFromAnalytics: false }], totalCount: 1 };
    } else if (scope === "secondary") {
      requestedSources = ["monthly", "budgets", "forecast"];
      data.monthly = { dateFrom: "2025-11-01", dateTo: "2026-10-03", rows: [{ monthStart: "2026-09-01", incomeCents: 180000, expenseCents: 90000, operatingNetCents: 90000 }, { monthStart: "2026-10-01", incomeCents: 200000, expenseCents: 50000, operatingNetCents: 150000 }] };
      data.budgets = { month: "2026-10", total: { categoryId: null, categoryName: null, effectiveAmountCents: 100000, actualExpenseCents: 50000, remainingCents: 50000, progressBps: 5000, status: "on_track" }, categories: [] };
      data.forecast = { period: { dateFrom: "2026-10-03", dateTo: "2026-11-02", accountId: null }, summary: { openingBalanceCents: 123456, projectedIncomeCents: 0, projectedExpenseCents: 0, projectedNetCents: 0, projectedClosingBalanceCents: 123456, plannedItems: 0 }, items: [] };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ contractVersion: 1, scope, asOfDate: "2026-10-03", dataThroughDate, generatedAt: "2026-10-03T08:00:00.000Z", requestedSources, failedSources: [], data }) });
  });
  return requestedScopes;
}

test.describe("Financial App 10.0.69 · carga progresiva de Inicio", () => {
  test("muestra el saldo crítico antes de que termine la actividad lenta", async ({ page }) => {
    const requestedScopes = await mockProgressiveDashboard(page);
    await page.goto("/");
    const balanceCard = page.locator("article").filter({ hasText: "Saldo total en cuentas" });
    await expect(balanceCard.locator("strong")).not.toHaveText("—", { timeout: 1200 });
    await expect(page.getByText("Movimiento tardío", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Cargando actividad reciente")).toBeVisible();
    await expect(page.getByText("Movimiento tardío", { exact: true })).toBeVisible({ timeout: 5000 });
    expect(requestedScopes).toContain("critical");
    expect(requestedScopes).toContain("activity");
    expect(requestedScopes).toContain("secondary");
    expect(requestedScopes).not.toContain("primary");
  });
});
