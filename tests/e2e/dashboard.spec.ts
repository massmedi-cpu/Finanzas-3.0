import { expect, test, type Page, type Route } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
type DashboardSource = "financial" | "monthly" | "budgets" | "forecast" | "transactions";

const financial = {
  contractVersion: 1,
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-07",
    incomeCents: 150000,
    expenseCents: 70000,
    operatingNetCents: 80000,
    savingsCents: 80000,
    savingsRateBps: 5333,
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-07",
    activeBalanceCents: 30000,
    accounts: [
      { id: "a", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 20000, explicitBalanceDate: "2026-09-07" },
      { id: "b", name: "Ahorro", type: "savings", lifecycle: "active", balanceCents: 10000, explicitBalanceDate: "2026-09-06" },
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
  dateFrom: "2025-10-01",
  dateTo: "2026-09-07",
  rows: [
    { monthStart: "2025-10-01", incomeCents: 85000, expenseCents: 56000, operatingNetCents: 29000 },
    { monthStart: "2025-11-01", incomeCents: 88000, expenseCents: 59000, operatingNetCents: 29000 },
    { monthStart: "2025-12-01", incomeCents: 95000, expenseCents: 61000, operatingNetCents: 34000 },
    { monthStart: "2026-01-01", incomeCents: 90000, expenseCents: 57000, operatingNetCents: 33000 },
    { monthStart: "2026-02-01", incomeCents: 92000, expenseCents: 60000, operatingNetCents: 32000 },
    { monthStart: "2026-03-01", incomeCents: 94000, expenseCents: 62000, operatingNetCents: 32000 },
    { monthStart: "2026-04-01", incomeCents: 96000, expenseCents: 58000, operatingNetCents: 38000 },
    { monthStart: "2026-05-01", incomeCents: 80000, expenseCents: 55000, operatingNetCents: 25000 },
    { monthStart: "2026-06-01", incomeCents: 90000, expenseCents: 65000, operatingNetCents: 25000 },
    { monthStart: "2026-07-01", incomeCents: 90000, expenseCents: 45000, operatingNetCents: 45000 },
    { monthStart: "2026-08-01", incomeCents: 100000, expenseCents: 40000, operatingNetCents: 60000 },
    { monthStart: "2026-09-01", incomeCents: 150000, expenseCents: 70000, operatingNetCents: 80000 },
  ],
};

const budgets = {
  contractVersion: 1,
  month: "2026-09",
  total: { categoryId: null, categoryName: null, effectiveAmountCents: 100000, actualExpenseCents: 60000, remainingCents: 40000, progressBps: 6000, status: "on_track" },
  categories: [
    { categoryId: "a", categoryName: "Alimentación", effectiveAmountCents: 50000, actualExpenseCents: 35000, remainingCents: 15000, progressBps: 7000, status: "on_track" },
  ],
  principles: { bankSource: "read_only" },
};

const forecast = {
  contractVersion: 1,
  summary: {
    projectedIncomeCents: 5000,
    projectedExpenseCents: 7000,
    projectedNetCents: -2000,
    projectedClosingBalanceCents: 28000,
    plannedItems: 2,
  },
  items: [
    { id: "f1", date: "2026-09-10", concept: "Internet", amountCents: -5000, status: "planned", affectsProjection: true },
    { id: "f2", date: "2026-09-15", concept: "Ingreso previsto", amountCents: 3000, status: "planned", affectsProjection: true },
  ],
  principles: { bankSource: "read_only" },
};

const transactions = {
  totalCount: 10,
  rows: [
    {
      id: "t1",
      bankDate: "2026-09-06",
      amountCents: -1234,
      account: { id: "a", name: "Cuenta principal" },
      concept: { effective: "Supermercado" },
      merchant: { effectiveName: "Mercado Central" },
      category: { effectiveName: "Alimentación" },
      kind: { effective: "expense" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockDashboard(
  page: Page,
  failures: DashboardSource[] = [],
  options: { dataThroughDate?: string | null; transactionRows?: typeof transactions.rows } = {},
) {
  const failed = new Set(failures);
  const mockTransactions = options.transactionRows === undefined
    ? transactions
    : { totalCount: options.transactionRows.length, rows: options.transactionRows };

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/source/google/sync") {
      await fulfillJson(route, {
        run: {
          id: "run-ok",
          status: "success",
          startedAt: "2026-09-07T12:00:00.000Z",
          finishedAt: "2026-09-07T12:00:00.000Z",
          rowsSeen: 10,
          rowsInserted: 0,
          rowsRevised: 0,
          rowsSkipped: 10,
          rowsFailed: 0,
          errorCode: null,
          errorMessage: null,
        },
        cursors: [],
      });
      return;
    }

    if (url.pathname === "/api/dashboard") {
      const scope = url.searchParams.get("scope");
      if (scope === "primary") {
        const requested: DashboardSource[] = ["financial", "transactions"];
        const failedRequested = requested.filter((source) => failed.has(source));
        await fulfillJson(route, {
          contractVersion: 1,
          scope: "primary",
          asOfDate: "2026-09-07",
          dataThroughDate: failed.has("transactions") ? null : options.dataThroughDate === undefined ? "2026-09-06" : options.dataThroughDate,
          generatedAt: "2026-09-07T12:00:00.000Z",
          requestedSources: requested,
          failedSources: failedRequested,
          data: {
            financial: failed.has("financial") ? null : financial,
            monthly: null,
            budgets: null,
            forecast: null,
            transactions: failed.has("transactions") ? null : mockTransactions,
          },
        }, failedRequested.length === requested.length ? 503 : 200);
        return;
      }
      if (scope === "secondary") {
        const requested: DashboardSource[] = ["monthly", "budgets", "forecast"];
        const failedRequested = requested.filter((source) => failed.has(source));
        await fulfillJson(route, {
          contractVersion: 1,
          scope: "secondary",
          asOfDate: "2026-09-07",
          dataThroughDate: "2026-09-06",
          generatedAt: "2026-09-07T12:00:00.000Z",
          requestedSources: requested,
          failedSources: failedRequested,
          data: {
            financial: null,
            monthly: failed.has("monthly") ? null : monthly,
            budgets: failed.has("budgets") ? null : budgets,
            forecast: failed.has("forecast") ? null : forecast,
            transactions: null,
          },
        }, failedRequested.length === requested.length ? 503 : 200);
        return;
      }
    }

    if (url.pathname === "/api/financial") {
      const source: DashboardSource = url.searchParams.get("mode") === "monthly" ? "monthly" : "financial";
      if (failed.has(source)) await fulfillJson(route, { error: "temporary_unavailable" }, 503);
      else await fulfillJson(route, source === "monthly" ? monthly : financial);
      return;
    }
    if (url.pathname === "/api/budgets") {
      await fulfillJson(route, failed.has("budgets") ? { error: "temporary_unavailable" } : budgets, failed.has("budgets") ? 503 : 200);
      return;
    }
    if (url.pathname === "/api/forecast") {
      await fulfillJson(route, failed.has("forecast") ? { error: "temporary_unavailable" } : forecast, failed.has("forecast") ? 503 : 200);
      return;
    }
    if (url.pathname === "/api/transactions") {
      await fulfillJson(route, failed.has("transactions") ? { error: "temporary_unavailable" } : mockTransactions, failed.has("transactions") ? 503 : 200);
      return;
    }

    await route.fallback();
  });
}

function summary(page: Page) {
  return page.getByRole("region", { name: "Resumen financiero principal" });
}

function chart(page: Page) {
  return page.getByRole("group", { name: /Ingresos y gastos por mes/i });
}

test("Inicio compone decisiones y bloques útiles desde motores centrales", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
  await expect(page.getByText("Última sincronización completada", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("Saldo total en cuentas", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("300,00 €", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("800,00 €", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("-20,00 €", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("53,3 %", { exact: false })).toBeVisible();
  await expect(summary(page).getByText("500,00 €", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("Gasto medio mensual", { exact: true })).toBeVisible();
  await expect(page.getByText("Por revisar", { exact: true })).toHaveCount(0);
  await expect(chart(page)).toBeVisible();
  await expect(chart(page).getByRole("button")).toHaveCount(12);
  await expect(page.getByText("Internet", { exact: true })).toBeVisible();
  await expect(page.getByText("Mercado Central", { exact: true })).toBeVisible();
  for (const heading of ["Últimos 12 meses", "Qué viene después", "Disponible por cuenta", "Gasto y presupuesto", "Últimos movimientos"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/FASE\s+\d/i)).toHaveCount(0);
});

test("Inicio usa la fecha bancaria confirmada por el agregador, no la fecha del saldo", async ({ page }) => {
  await mockDashboard(page, [], { dataThroughDate: "2026-09-05" });
  await page.goto("/");

  const source = page.getByRole("region", { name: "Estado de los datos bancarios" });
  await expect(source).toContainText("movimientos hasta 5 sept");
  await expect(source).not.toContainText("movimientos hasta 7 sept");
});

test("Inicio no inventa la fecha del último movimiento a partir del saldo", async ({ page }) => {
  await mockDashboard(page, [], { dataThroughDate: null, transactionRows: [] });
  await page.goto("/");

  const source = page.getByRole("region", { name: "Estado de los datos bancarios" });
  await expect(source).toContainText("fecha del último movimiento sin confirmar");
  await expect(source).not.toContainText("movimientos hasta 7 sept");
});

test("Inicio avisa si recupera cifras mediante consultas independientes", async ({ page }) => {
  await mockDashboard(page);
  await page.route("**/api/dashboard?scope=secondary", (route) => fulfillJson(route, { error: "temporary_unavailable" }, 503));
  await page.goto("/");

  await expect(chart(page)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "consultas independientes" })).toBeVisible();
});

test("Inicio mantiene controles táctiles y cero overflow horizontal en móvil", async ({ page }) => {
  await mockDashboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const dock = page.getByRole("navigation", { name: "Navegación móvil" });
  await expect(dock).toBeVisible();
  const more = dock.getByRole("button", { name: "Más", exact: true });
  await expect(more).toBeVisible();
  await more.click();
  const extra = page.getByRole("navigation", { name: "Más secciones" });
  for (const name of ["Movs.", "Cuentas", "Presupuestos", "Recurrentes", "Previsión", "Documentos", "Configuración"]) {
    const link = name === "Movs." ? dock.getByRole("link", { name, exact: true }) : extra.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  for (const control of await page.locator("#main-content a:visible, #main-content button:visible").all()) {
    const box = await control.boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }

  const graphBox = await chart(page).evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(graphBox.scrollWidth).toBeLessThanOrEqual(graphBox.clientWidth + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Inicio conserva resumen, cuentas y actividad cuando falla Previsión", async ({ page }) => {
  await mockDashboard(page, ["forecast"]);
  await page.goto("/");

  await expect(summary(page).getByText("300,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("Cuenta principal", { exact: true })).toBeVisible();
  await expect(chart(page)).toBeVisible();
  await expect(page.getByText("Mercado Central", { exact: true })).toBeVisible();
  await expect(page.getByText("La previsión no está disponible.", { exact: true })).toBeVisible();
  await expect(page.getByText("Parte del resumen no está disponible", { exact: true })).toBeVisible();
});

test("Inicio conserva el balance mensual cuando falla únicamente la evolución", async ({ page }) => {
  await mockDashboard(page, ["monthly"]);
  await page.goto("/");

  await expect(summary(page).getByText("800,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("La evolución no está disponible ahora.", { exact: true })).toBeVisible();
  await expect(page.getByText("Parte del resumen no está disponible", { exact: true })).toBeVisible();
});

test("Inicio conserva módulos independientes si falla el motor financiero principal", async ({ page }) => {
  await mockDashboard(page, ["financial"]);
  await page.goto("/");

  await expect(summary(page).getByText("—").first()).toBeVisible();
  await expect(page.getByText("Las cuentas no están disponibles ahora.", { exact: true })).toBeVisible();
  await expect(chart(page)).toBeVisible();
  await expect(page.getByText("Internet", { exact: true })).toBeVisible();
  await expect(page.getByText("Mercado Central", { exact: true })).toBeVisible();
  await expect(page.getByText("Parte del resumen no está disponible", { exact: true })).toBeVisible();
});

test("Inicio mantiene una salida comprensible ante indisponibilidad total", async ({ page }) => {
  await mockDashboard(page, ["financial", "monthly", "budgets", "forecast", "transactions"]);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
  await expect(page.getByText("La evolución no está disponible ahora.", { exact: true })).toBeVisible();
  await expect(page.getByText("Las cuentas no están disponibles ahora.", { exact: true })).toBeVisible();
  await expect(page.getByText("El presupuesto no está disponible ahora.", { exact: true })).toBeVisible();
  await expect(page.getByText("La previsión no está disponible.", { exact: true })).toBeVisible();
  await expect(page.getByText("La actividad reciente no está disponible ahora.", { exact: true })).toBeVisible();
  await expect(page.getByText("Parte del resumen no está disponible", { exact: true })).toBeVisible();
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
