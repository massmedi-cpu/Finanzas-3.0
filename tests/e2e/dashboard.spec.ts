import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const accountA = "91000000-0000-4000-8000-000000000091";
const accountB = "92000000-0000-4000-8000-000000000092";

const financial = {
  contractVersion: 1,
  period: {
    dateFrom: "2026-09-01", dateTo: "2026-09-07", accountId: null,
    incomeCents: 150000, expenseCents: 70000, refundCents: 0, adjustmentCents: 0,
    operatingNetCents: 80000, savingsCents: 80000, savingsRateBps: 5333,
    transfers: { rows: 2, pairedRows: 2, unpairedRows: 0, pairedPairs: 1, netCents: 0, grossCents: 20000 },
    quality: { scopedRows: 5, includedRows: 5, manuallyExcludedRows: 0, confirmedDuplicateRows: 0, suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-07", includeArchived: false, accountId: null, totalBalanceCents: 30000, activeBalanceCents: 30000,
    quality: { accounts: 2, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0, integrityDeltaAccounts: 0 },
    accounts: [
      { id: accountA, name: "Cuenta principal", type: "checking", currency: "EUR", lifecycle: "active", openingBalanceCents: 0, balanceCents: 20000, balanceSource: "bank_explicit", explicitBalanceCents: 20000, explicitBalanceDate: "2026-09-07", explicitSourceRowKey: "A-1", reconstructedBalanceCents: 20000, reconstructionDeltaCents: 0 },
      { id: accountB, name: "Ahorro", type: "savings", currency: "EUR", lifecycle: "active", openingBalanceCents: 0, balanceCents: 10000, balanceSource: "bank_explicit", explicitBalanceCents: 10000, explicitBalanceDate: "2026-09-06", explicitSourceRowKey: "B-1", reconstructedBalanceCents: 10000, reconstructionDeltaCents: 0 },
    ],
  },
  monthly: { dateFrom: "2026-09-01", dateTo: "2026-09-07", accountId: null, rows: [] },
  principles: { bankSource: "read_only", transfersExcludedFromSavings: true, suspectedDuplicatesIncluded: true, confirmedDuplicatesExcluded: true, manualAnalyticsExclusionRespected: true, explicitBankBalancePreferred: true },
};

const monthly = {
  dateFrom: "2026-01-01", dateTo: "2026-09-07", accountId: null,
  rows: [
    { monthStart: "2026-08-01", rows: 4, incomeCents: 100000, expenseCents: 40000, refundCents: 0, adjustmentCents: 0, operatingNetCents: 60000, savingsCents: 60000, transferNetCents: 0, transferGrossCents: 0 },
    { monthStart: "2026-09-01", rows: 5, incomeCents: 150000, expenseCents: 70000, refundCents: 0, adjustmentCents: 0, operatingNetCents: 80000, savingsCents: 80000, transferNetCents: 0, transferGrossCents: 20000 },
  ],
};

const budgets = {
  contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
  total: { id: null, persisted: false, categoryId: null, categoryName: null, categoryLifecycle: null, automaticAmountCents: 100000, manualAmountCents: null, effectiveAmountCents: 100000, actualExpenseCents: 60000, remainingCents: 40000, progressBps: 6000, status: "on_track", automaticExplanation: "test", historyMonths: [] },
  categories: [
    { id: null, persisted: false, categoryId: "a", categoryName: "Alimentación", categoryLifecycle: "active", automaticAmountCents: 50000, manualAmountCents: null, effectiveAmountCents: 50000, actualExpenseCents: 35000, remainingCents: 15000, progressBps: 7000, status: "on_track", automaticExplanation: "test", historyMonths: [] },
    { id: null, persisted: false, categoryId: "b", categoryName: "Tecnología", categoryLifecycle: "active", automaticAmountCents: 30000, manualAmountCents: null, effectiveAmountCents: 30000, actualExpenseCents: 25000, remainingCents: 5000, progressBps: 8333, status: "on_track", automaticExplanation: "test", historyMonths: [] },
  ],
  principles: { bankSource: "read_only" },
};

const forecast = {
  contractVersion: 1, period: { dateFrom: "2026-09-07", dateTo: "2026-10-07", accountId: null },
  summary: { openingBalanceCents: 30000, projectedIncomeCents: 5000, projectedExpenseCents: 7000, projectedNetCents: -2000, projectedClosingBalanceCents: 28000, plannedItems: 2, excludedItems: 0, confirmedItems: 0 },
  items: [
    { id: "f1", date: "2026-09-10", accountId: null, accountName: null, categoryId: null, categoryName: null, merchantId: null, merchantName: null, concept: "Internet", amountCents: -5000, origin: "recurring", confidence: "high", recurrenceId: null, budgetId: null, confirmedTransactionId: null, excluded: false, excludedReason: "", reconciliationNote: "", projectionKey: null, status: "planned", affectsProjection: true, projectionEffectCents: -5000, projectedBalanceAfterCents: 25000, actual: null },
    { id: "f2", date: "2026-09-15", accountId: null, accountName: null, categoryId: null, categoryName: null, merchantId: null, merchantName: null, concept: "Ingreso previsto", amountCents: 3000, origin: "known", confidence: "high", recurrenceId: null, budgetId: null, confirmedTransactionId: null, excluded: false, excludedReason: "", reconciliationNote: "", projectionKey: null, status: "planned", affectsProjection: true, projectionEffectCents: 3000, projectedBalanceAfterCents: 28000, actual: null },
  ], budgetContext: [], balanceContext: { quality: { accounts: 2, integrityDeltaAccounts: 0, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0 }, accounts: [] }, principles: { bankSource: "read_only" },
};

const transactions = { totalCount: 1, hasMore: false, nextCursor: null, rows: [{ id: "t1", bankDate: "2026-09-06", amountCents: -1234, balanceAfterCents: 20000, account: { id: accountA, name: "Cuenta principal" }, concept: { original: "Supermercado", processed: "Supermercado", effective: "Supermercado" }, category: { originalId: null, originalName: null, effectiveId: null, effectiveName: "Alimentación" }, kind: { original: "expense", effective: "expense" }, duplicateState: "none", excludedFromAnalytics: false }] };

async function mockDashboard(page: import("@playwright/test").Page) {
  await page.route("**/api/financial?*", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.searchParams.get("mode") === "monthly" ? monthly : financial) });
  });
  await page.route("**/api/budgets?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(budgets) }));
  await page.route("**/api/forecast?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecast) }));
  await page.route("**/api/transactions?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(transactions) }));
}

test("Inicio compone seis bloques desde contratos centrales sin duplicar cálculos", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tu dinero, claro en segundos." })).toBeVisible();
  await expect(page.getByLabel("Saldo total en cuentas").getByText("300,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("1.500,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("700,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("400,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("280,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(6);
  await expect(page.getByText(/FASE\s+\d/i)).toHaveCount(0);
});

test("Inicio mantiene navegación táctil y cero overflow horizontal en móvil", async ({ page }) => {
  await mockDashboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const name of ["Movimientos", "Cuentas", "Presupuestos", "Recurrentes", "Previsión", "Documentos", "Configuración"]) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("protected preview exposes F12 dashboard using validated engines", async ({ request, page }) => {
  test.skip(!isProtectedPreview, "requires protected F12 preview");
  const buildResponse = await request.get("/api/build");
  expect(buildResponse.ok()).toBeTruthy();
  const build = await buildResponse.json();
  expect(build.phase).toBeGreaterThanOrEqual(12);
  if (build.phase === 12) expect(build.phaseName).toBe("Inicio / dashboard");
  if (process.env.GITHUB_SHA) expect(build.commit).toBe(process.env.GITHUB_SHA);

  const today = "2026-09-07";
  const financialResponse = await request.get(`/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=${today}`);
  expect(financialResponse.ok()).toBeTruthy();
  const liveFinancial = await financialResponse.json();
  expect(liveFinancial.principles.bankSource).toBe("read_only");
  expect(liveFinancial.principles.transfersExcludedFromSavings).toBe(true);

  const monthlyResponse = await request.get(`/api/financial?mode=monthly&dateFrom=2026-01-01&dateTo=${today}`);
  expect(monthlyResponse.ok()).toBeTruthy();
  expect(Array.isArray((await monthlyResponse.json()).rows)).toBe(true);

  const budgetResponse = await request.get("/api/budgets?month=2026-09");
  expect(budgetResponse.ok()).toBeTruthy();
  const liveBudget = await budgetResponse.json();
  expect(liveBudget.principles.bankSource).toBe("read_only");

  const forecastResponse = await request.get(`/api/forecast?dateFrom=${today}&dateTo=2026-10-07`);
  expect(forecastResponse.ok()).toBeTruthy();
  const liveForecast = await forecastResponse.json();
  expect(liveForecast.principles.bankSource).toBe("read_only");

  const transactionResponse = await request.get("/api/transactions?limit=6");
  expect(transactionResponse.ok()).toBeTruthy();
  expect(Array.isArray((await transactionResponse.json()).rows)).toBe(true);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tu dinero, claro en segundos." })).toBeVisible();
});
