import { expect, test, type Page, type Route } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const accountA = "91000000-0000-4000-8000-000000000091";
const accountB = "92000000-0000-4000-8000-000000000092";
type DashboardSource = "financial" | "monthly" | "budgets" | "forecast" | "transactions";

const financial = {
  contractVersion: 1,
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-07",
    accountId: null,
    incomeCents: 150000,
    expenseCents: 70000,
    refundCents: 0,
    adjustmentCents: 0,
    operatingNetCents: 80000,
    savingsCents: 80000,
    savingsRateBps: 5333,
    transfers: { rows: 2, pairedRows: 2, unpairedRows: 0, pairedPairs: 1, netCents: 0, grossCents: 20000 },
    quality: { scopedRows: 5, includedRows: 5, manuallyExcludedRows: 0, confirmedDuplicateRows: 0, suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-07",
    includeArchived: false,
    accountId: null,
    totalBalanceCents: 30000,
    activeBalanceCents: 30000,
    quality: { accounts: 2, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0, integrityDeltaAccounts: 0 },
    accounts: [
      {
        id: accountA,
        name: "Cuenta principal",
        type: "checking",
        currency: "EUR",
        lifecycle: "active",
        openingBalanceCents: 0,
        balanceCents: 20000,
        balanceSource: "bank_explicit",
        explicitBalanceCents: 20000,
        explicitBalanceDate: "2026-09-07",
        explicitSourceRowKey: "A-1",
        reconstructedBalanceCents: 20000,
        reconstructionDeltaCents: 0,
      },
      {
        id: accountB,
        name: "Ahorro",
        type: "savings",
        currency: "EUR",
        lifecycle: "active",
        openingBalanceCents: 0,
        balanceCents: 10000,
        balanceSource: "bank_explicit",
        explicitBalanceCents: 10000,
        explicitBalanceDate: "2026-09-06",
        explicitSourceRowKey: "B-1",
        reconstructedBalanceCents: 10000,
        reconstructionDeltaCents: 0,
      },
    ],
  },
  principles: {
    bankSource: "read_only",
    transfersExcludedFromSavings: true,
    suspectedDuplicatesIncluded: true,
    confirmedDuplicatesExcluded: true,
    manualAnalyticsExclusionRespected: true,
    explicitBankBalancePreferred: true,
  },
};

const monthly = {
  dateFrom: "2026-01-01",
  dateTo: "2026-09-07",
  accountId: null,
  rows: [
    { monthStart: "2026-07-01", rows: 4, incomeCents: 90000, expenseCents: 45000, refundCents: 0, adjustmentCents: 0, operatingNetCents: 45000, savingsCents: 45000, transferNetCents: 0, transferGrossCents: 0 },
    { monthStart: "2026-08-01", rows: 4, incomeCents: 100000, expenseCents: 40000, refundCents: 0, adjustmentCents: 0, operatingNetCents: 60000, savingsCents: 60000, transferNetCents: 0, transferGrossCents: 0 },
    { monthStart: "2026-09-01", rows: 5, incomeCents: 150000, expenseCents: 70000, refundCents: 0, adjustmentCents: 0, operatingNetCents: 80000, savingsCents: 80000, transferNetCents: 0, transferGrossCents: 20000 },
  ],
};

const budgets = {
  contractVersion: 1,
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
  categories: [
    { categoryId: "a", categoryName: "Alimentación", effectiveAmountCents: 50000, actualExpenseCents: 35000, remainingCents: 15000, progressBps: 7000, status: "on_track" },
    { categoryId: "b", categoryName: "Tecnología", effectiveAmountCents: 30000, actualExpenseCents: 25000, remainingCents: 5000, progressBps: 8333, status: "on_track" },
  ],
};

const forecast = {
  contractVersion: 1,
  period: { dateFrom: "2026-09-07", dateTo: "2026-10-07", accountId: null },
  summary: {
    openingBalanceCents: 30000,
    projectedIncomeCents: 5000,
    projectedExpenseCents: 7000,
    projectedNetCents: -2000,
    projectedClosingBalanceCents: 28000,
    plannedItems: 2,
    excludedItems: 0,
    confirmedItems: 0,
  },
  items: [
    { id: "f1", date: "2026-09-10", concept: "Internet", amountCents: -5000, origin: "recurring", confidence: "high", status: "planned", affectsProjection: true },
    { id: "f2", date: "2026-09-15", concept: "Ingreso previsto", amountCents: 3000, origin: "known", confidence: "high", status: "planned", affectsProjection: true },
  ],
};

const transactions = {
  totalCount: 10,
  hasMore: false,
  nextCursor: null,
  rows: [
    {
      id: "t1",
      bankDate: "2026-09-06",
      amountCents: -1234,
      balanceAfterCents: 20000,
      account: { id: accountA, name: "Cuenta principal" },
      concept: { original: "Supermercado", processed: "Supermercado", effective: "Supermercado" },
      merchant: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
      category: { originalId: null, originalName: null, effectiveId: null, effectiveName: "Alimentación" },
      kind: { original: "expense", effective: "expense" },
      reviewState: { effective: "confirmed" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
};

function dashboardData(failed: Set<DashboardSource>) {
  return {
    financial: failed.has("financial") ? null : financial,
    monthly: failed.has("monthly") ? null : monthly,
    budgets: failed.has("budgets") ? null : budgets,
    forecast: failed.has("forecast") ? null : forecast,
    transactions: failed.has("transactions") ? null : transactions,
  };
}

async function fulfillScope(
  route: Route,
  scope: "primary" | "secondary",
  requested: DashboardSource[],
  failed: Set<DashboardSource>,
) {
  const allData = dashboardData(failed);
  const failedRequested = requested.filter((source) => failed.has(source));
  await route.fulfill({
    status: failedRequested.length === requested.length ? 503 : 200,
    contentType: "application/json",
    body: JSON.stringify({
      contractVersion: 1,
      scope,
      asOfDate: "2026-09-07",
      dataThroughDate: failed.has("transactions") ? null : "2026-09-06",
      generatedAt: "2026-09-07T12:00:00.000Z",
      requestedSources: requested,
      failedSources: failedRequested,
      data: {
        financial: requested.includes("financial") ? allData.financial : null,
        monthly: requested.includes("monthly") ? allData.monthly : null,
        budgets: requested.includes("budgets") ? allData.budgets : null,
        forecast: requested.includes("forecast") ? allData.forecast : null,
        transactions: requested.includes("transactions") ? allData.transactions : null,
      },
    }),
  });
}

async function mockDashboard(page: Page, failures: DashboardSource[] = []) {
  const failed = new Set(failures);

  await page.route("**/api/source/google/sync", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: null }) }),
  );
  await page.route(/\/api\/dashboard\?scope=primary(?:&|$)/, (route) =>
    fulfillScope(route, "primary", ["financial", "transactions"], failed),
  );
  await page.route(/\/api\/dashboard\?scope=secondary(?:&|$)/, (route) =>
    fulfillScope(route, "secondary", ["monthly", "budgets", "forecast"], failed),
  );

  await page.route("**/api/financial?*", async (route) => {
    const source: DashboardSource = new URL(route.request().url()).searchParams.get("mode") === "monthly" ? "monthly" : "financial";
    await route.fulfill(
      failed.has(source)
        ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary_unavailable" }) }
        : { status: 200, contentType: "application/json", body: JSON.stringify(source === "monthly" ? monthly : financial) },
    );
  });
  await page.route("**/api/budgets?*", (route) => route.fulfill(
    failed.has("budgets")
      ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary_unavailable" }) }
      : { status: 200, contentType: "application/json", body: JSON.stringify(budgets) },
  ));
  await page.route("**/api/forecast?*", (route) => route.fulfill(
    failed.has("forecast")
      ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary_unavailable" }) }
      : { status: 200, contentType: "application/json", body: JSON.stringify(forecast) },
  ));
  await page.route("**/api/transactions?*", (route) => route.fulfill(
    failed.has("transactions")
      ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary_unavailable" }) }
      : { status: 200, contentType: "application/json", body: JSON.stringify(transactions) },
  ));
}

function monthlyChart(page: Page) {
  return page.getByRole("group", { name: /Ingresos y gastos por mes/i });
}

async function expectAugustBalance(page: Page) {
  const chart = monthlyChart(page);
  await expect(chart).toBeVisible();
  await expect(chart.getByRole("button", { name: /balance neto 600,00/i })).toBeVisible();
}

test("Inicio compone resumen y cinco bloques desde contratos centrales", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumen financiero principal" });
  await expect(summary.getByText("300,00 €", { exact: true })).toBeVisible();
  await expect(summary.getByText("1.500,00 €", { exact: true })).toBeVisible();
  await expect(summary.getByText("700,00 €", { exact: true })).toBeVisible();
  await expect(summary.getByText("800,00 €", { exact: true })).toBeVisible();
  await expect(summary.getByText("53,3 %", { exact: true })).toBeVisible();
  await expectAugustBalance(page);
  await expect(page.getByText(/280,00\s*€/)).toBeVisible();
  await expect(page.getByText("Supermercado", { exact: true })).toBeVisible();
  for (const heading of ["Ingresos, gastos y balance", "Disponible por cuenta", "Gasto y presupuesto", "Lo que viene", "Últimos 10 movimientos"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.getByText(/FASE\s+\d/i)).toHaveCount(0);
});

test("Inicio mantiene navegación táctil y cero overflow horizontal en móvil", async ({ page }) => {
  await mockDashboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const primaryNav = page.getByRole("navigation", { name: "Navegación principal" });
  for (const name of ["Movimientos", "Cuentas", "Presupuestos", "Recurrentes", "Previsión", "Documentos", "Configuración"]) {
    const link = primaryNav.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  for (const control of await page.locator("#main-content a:visible, #main-content button:visible").all()) {
    const box = await control.boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Inicio conserva resumen, presupuesto y actividad cuando falla Previsión", async ({ page }) => {
  await mockDashboard(page, ["forecast"]);
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Resumen financiero principal" }).getByText("300,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("Cuenta principal", { exact: true })).toBeVisible();
  await expectAugustBalance(page);
  await expect(page.getByText("Supermercado", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin previsión disponible.")).toBeVisible();
  await expect(page.getByText(/Algunos módulos no han podido actualizarse:.*forecast/)).toBeVisible();
});

test("Inicio conserva el balance mensual cuando falla únicamente la evolución anual", async ({ page }) => {
  await mockDashboard(page, ["monthly"]);
  await page.goto("/");

  const summary = page.getByRole("region", { name: "Resumen financiero principal" });
  await expect(summary.getByText("1.500,00 €", { exact: true })).toBeVisible();
  await expect(summary.getByText("700,00 €", { exact: true })).toBeVisible();
  await expect(summary.getByText("800,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("No se pudo cargar la evolución.")).toBeVisible();
  await expect(page.getByText(/Algunos módulos no han podido actualizarse:.*monthly/)).toBeVisible();
});

test("Inicio conserva módulos independientes si falla el motor financiero principal", async ({ page }) => {
  await mockDashboard(page, ["financial"]);
  await page.goto("/");

  const summary = page.getByRole("region", { name: "Resumen financiero principal" });
  await expect(summary.getByText("—").first()).toBeVisible();
  await expect(page.getByText("Sin cuentas activas.")).toBeVisible();
  await expectAugustBalance(page);
  await expect(page.getByText(/280,00\s*€/)).toBeVisible();
  await expect(page.getByText("Supermercado", { exact: true })).toBeVisible();
  await expect(page.getByText(/Algunos módulos no han podido actualizarse:.*financial/)).toBeVisible();
});

test("Inicio mantiene una salida comprensible ante indisponibilidad total", async ({ page }) => {
  await mockDashboard(page, ["financial", "monthly", "budgets", "forecast", "transactions"]);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
  await expect(page.getByText("No se pudo cargar la evolución.")).toBeVisible();
  await expect(page.getByText("Sin cuentas activas.")).toBeVisible();
  await expect(page.getByText("Sin presupuesto disponible.")).toBeVisible();
  await expect(page.getByText("Sin previsión disponible.")).toBeVisible();
  await expect(page.getByText("No hay movimientos disponibles.")).toBeVisible();
  await expect(page.getByText(/Algunos módulos no han podido actualizarse:/)).toBeVisible();
});

test("protected preview exposes dashboard orchestration using validated engines", async ({ request, page }) => {
  test.skip(!isProtectedPreview, "requires protected preview");

  const buildResponse = await request.get("/api/build");
  expect(buildResponse.ok()).toBeTruthy();
  const build = await buildResponse.json();
  expect(build.phase).toBeGreaterThanOrEqual(12);
  if (process.env.GITHUB_SHA) expect(build.commit).toBe(process.env.GITHUB_SHA);

  const primary = await request.get("/api/dashboard?scope=primary");
  expect(primary.ok()).toBeTruthy();
  const primaryBody = await primary.json();
  expect(primaryBody.requestedSources).toEqual(["financial", "transactions"]);
  expect(primaryBody.data.financial.principles.bankSource).toBe("read_only");
  expect(primaryBody.data.financial.principles.transfersExcludedFromSavings).toBe(true);
  expect(Array.isArray(primaryBody.data.transactions.rows)).toBe(true);
  expect(primaryBody.dataThroughDate === null || /^\d{4}-\d{2}-\d{2}$/.test(primaryBody.dataThroughDate)).toBe(true);

  const secondary = await request.get("/api/dashboard?scope=secondary");
  expect(secondary.ok()).toBeTruthy();
  const secondaryBody = await secondary.json();
  expect(secondaryBody.requestedSources).toEqual(["monthly", "budgets", "forecast"]);
  expect(Array.isArray(secondaryBody.data.monthly.rows)).toBe(true);
  expect(secondaryBody.data.budgets.principles.bankSource).toBe("read_only");
  expect(secondaryBody.data.forecast.principles.bankSource).toBe("read_only");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
});
