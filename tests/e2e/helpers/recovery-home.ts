import type { Page } from "@playwright/test";

// Synthetic data only. This adapter cannot read or write a financial backend.
const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-16",
    incomeCents: 150000,
    expenseCents: 70000,
    operatingNetCents: 80000,
    savingsCents: 80000,
    savingsRateBps: 5333,
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-16",
    activeBalanceCents: 30000,
    accounts: [
      { id: "a", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 30000, explicitBalanceDate: "2026-09-16" },
    ],
  },
};

const monthly = {
  dateFrom: "2026-01-01",
  dateTo: "2026-09-16",
  rows: [
    { monthStart: "2026-07-01", incomeCents: 120000, expenseCents: 60000, operatingNetCents: 60000 },
    { monthStart: "2026-08-01", incomeCents: 130000, expenseCents: 65000, operatingNetCents: 65000 },
    { monthStart: "2026-09-01", incomeCents: 150000, expenseCents: 70000, operatingNetCents: 80000 },
  ],
};

const budgets = {
  month: "2026-09",
  total: {
    categoryId: null,
    categoryName: null,
    effectiveAmountCents: 100000,
    actualExpenseCents: 70000,
    remainingCents: 30000,
    progressBps: 7000,
    status: "on_track",
  },
  categories: [],
};

const forecast = {
  period: {
    dateFrom: "2026-09-16",
    dateTo: "2026-10-16",
    accountId: null,
  },
  summary: {
    openingBalanceCents: 30000,
    projectedIncomeCents: 0,
    projectedExpenseCents: 0,
    projectedNetCents: 0,
    projectedClosingBalanceCents: 30000,
    plannedItems: 0,
  },
  items: [],
};

const transactions = {
  totalCount: 12,
  rows: [
    {
      id: "t-current",
      bankDate: "2026-09-16",
      amountCents: -2000,
      account: { id: "a", name: "Cuenta principal" },
      concept: { effective: "Compra" },
      merchant: { effectiveName: "Comercio de prueba" },
      category: { effectiveName: "Compras" },
      kind: { effective: "expense" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
};


export async function mockRecoveryHome(page: Page, coverage: "none" | "partial" | "covered" = "none") {
  const fixture = structuredClone({ financial, monthly, budgets, forecast, transactions });
  const asOf = coverage === "none" ? "2026-10-09" : "2026-09-16";
  const latestMovement = coverage === "partial" ? "2026-09-15" : "2026-09-16";
  if (coverage === "none") {
    fixture.financial.period = { ...fixture.financial.period, dateFrom: "2026-10-01", dateTo: asOf, incomeCents: 0, expenseCents: 0, operatingNetCents: 0, savingsCents: 0, savingsRateBps: 0 };
    fixture.monthly.rows.push({ monthStart: "2026-10-01", incomeCents: 0, expenseCents: 0, operatingNetCents: 0 });
    fixture.monthly.dateTo = asOf;
    fixture.budgets.month = "2026-10";
    fixture.budgets.total = { ...fixture.budgets.total, actualExpenseCents: 0, remainingCents: 100000, progressBps: 0 };
    fixture.forecast.period = { ...fixture.forecast.period, dateFrom: asOf, dateTo: "2026-11-08" };
  }
  await page.clock.setFixedTime(new Date(asOf + "T12:00:00Z"));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return route.abort("blockedbyclient");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/dashboard") {
      const scope = url.searchParams.get("scope");
      const requestedSources = scope === "critical" ? ["financial"] : scope === "activity" ? ["transactions"] : ["monthly", "budgets", "forecast"];
      const data = Object.fromEntries(Object.entries(fixture).map(([key, value]) => [key, requestedSources.includes(key) ? value : null]));
      return json({ contractVersion: 1, scope, asOfDate: asOf, dataThroughDate: latestMovement, generatedAt: asOf + "T06:00:00Z", requestedSources, failedSources: [], data });
    }
    if (url.pathname === "/api/source/google/sync") return json({ run: { id: "synthetic-run", status: "success", startedAt: asOf + "T06:00:00Z", finishedAt: asOf + "T06:00:05Z", rowsSeen: 12, rowsInserted: 0, rowsRevised: 0, rowsSkipped: 12, rowsFailed: 0, errorCode: null, errorMessage: null }, cursors: [] });
    if (url.pathname === "/api/analysis/source-freshness") return json({ available: true, latestMovementDate: latestMovement, sync: null });
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/build") return json({ error: "synthetic_ui_isolation" }, 503);
    return route.continue();
  });
}
