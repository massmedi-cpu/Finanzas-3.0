import { expect, test, type Page, type Route } from "@playwright/test";

const HOME_VISIT_KEY = "financial-app:home-last-visit:v1";
const PRIVACY_KEY = "financial-app:home-amounts";

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

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockInicio(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00+02:00"));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/source/google/sync") {
      await json(route, {
        run: {
          id: "run-1",
          status: "success",
          startedAt: "2026-09-16T06:00:00.000Z",
          finishedAt: "2026-09-16T06:00:05.000Z",
          rowsSeen: 12,
          rowsInserted: 0,
          rowsRevised: 0,
          rowsSkipped: 12,
          rowsFailed: 0,
          errorCode: null,
          errorMessage: null,
        },
        cursors: [],
      });
      return;
    }

    if (url.pathname === "/api/dashboard") {
      if (url.searchParams.get("scope") === "critical") {
        await json(route, {
          contractVersion: 1,
          scope: "critical",
          asOfDate: "2026-09-16",
          dataThroughDate: null,
          generatedAt: "2026-09-16T06:00:05.000Z",
          requestedSources: ["financial"],
          failedSources: [],
          data: { financial, monthly: null, budgets: null, forecast: null, transactions: null },
        });
        return;
      }
      if (url.searchParams.get("scope") === "activity") {
        await json(route, {
          contractVersion: 1,
          scope: "activity",
          asOfDate: "2026-09-16",
          dataThroughDate: "2026-09-16",
          generatedAt: "2026-09-16T06:00:05.000Z",
          requestedSources: ["transactions"],
          failedSources: [],
          data: { financial: null, monthly: null, budgets: null, forecast: null, transactions },
        });
        return;
      }
      if (url.searchParams.get("scope") === "primary") {
        await json(route, {
          contractVersion: 1,
          scope: "primary",
          asOfDate: "2026-09-16",
          dataThroughDate: "2026-09-16",
          generatedAt: "2026-09-16T06:00:05.000Z",
          requestedSources: ["financial", "transactions"],
          failedSources: [],
          data: { financial, monthly: null, budgets: null, forecast: null, transactions },
        });
        return;
      }
      if (url.searchParams.get("scope") === "secondary") {
        await json(route, {
          contractVersion: 1,
          scope: "secondary",
          asOfDate: "2026-09-16",
          dataThroughDate: "2026-09-16",
          generatedAt: "2026-09-16T06:00:05.000Z",
          requestedSources: ["monthly", "budgets", "forecast"],
          failedSources: [],
          data: { financial: null, monthly, budgets, forecast, transactions: null },
        });
        return;
      }
    }

    await route.fallback();
  });
}

test("Inicio inteligente resume el estado actual sin crear un segundo motor", async ({ page }) => {
  await mockInicio(page);
  await page.goto("/");

  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  await expect(brief).toBeVisible();
  await expect(brief.getByRole("heading", { name: "Ahora mismo" })).toBeVisible();
  await expect(brief).toContainText("Balance registrado en positivo");
  await expect(brief).toContainText("Presupuesto dentro del límite");
  await expect(brief).toContainText("Sin movimientos previstos");
  await expect(brief).toContainText("Datos hasta 16 sept");

  const forecastCard = page.locator('section[aria-label="Resumen financiero principal"] article').filter({ hasText: "Próximos 30 días" });
  await expect(forecastCard).toContainText("Sin previsiones");
  await expect(forecastCard).not.toContainText("cierre");
  await expect(forecastCard.getByRole("link", { name: "Crear previsión" })).toHaveAttribute("href", "/forecast");
});

test("Inicio muestra cambios útiles desde la última visita y conserva una memoria mínima", async ({ page }) => {
  await mockInicio(page);
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      savedAt: "2026-09-15T18:00:00.000Z",
      month: "2026-09",
      transactionTotalCount: 10,
      latestTransactionId: "t-old",
      latestTransactionDate: "2026-09-15",
      expenseCents: 50000,
      operatingNetCents: 60000,
      activeBalanceCents: 25000,
      budgetProgressBps: 5000,
      budgetStatus: "on_track",
      projectedNetCents: -1000,
      plannedItems: 1,
    }));
  }, { key: HOME_VISIT_KEY });

  await page.goto("/");

  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  await expect(brief).toContainText("Qué ha cambiado");
  await expect(brief).toContainText("2 movimientos nuevos");
  await expect(brief).toContainText(/Gasto del mes \+200,00/);
  await expect(brief).toContainText("Presupuesto +20 pp");
  await expect(brief).toContainText("Previsión sin movimientos");
  await expect(brief).not.toContainText(/Previsión neta \+10,00/);

  await expect.poll(async () => page.evaluate((key) => localStorage.getItem(key), HOME_VISIT_KEY)).not.toBeNull();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), HOME_VISIT_KEY) as Record<string, unknown>;
  expect(stored.transactionTotalCount).toBe(12);
  expect(stored.latestTransactionId).toBe("t-current");
  expect(stored).not.toHaveProperty("merchant");
  expect(stored).not.toHaveProperty("concept");
  expect(JSON.stringify(stored)).not.toContain("Comercio de prueba");
});

test("QA-02 · Inicio no llama equilibrio a un mes sin movimientos importados", async ({ page }) => {
  await mockInicio(page);
  const staleTransactions = {
    ...transactions,
    rows: transactions.rows.map((row) => ({ ...row, bankDate: "2026-08-31" })),
  };

  await page.route("**/api/dashboard?**", async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope");
    if (scope === "activity") {
      await json(route, {
        contractVersion: 1,
        scope: "activity",
        asOfDate: "2026-09-16",
        dataThroughDate: "2026-08-31",
        generatedAt: "2026-09-16T06:00:05.000Z",
        requestedSources: ["transactions"],
        failedSources: [],
        data: { financial: null, monthly: null, budgets: null, forecast: null, transactions: staleTransactions },
      });
      return;
    }
    if (scope === "primary") {
      await json(route, {
        contractVersion: 1,
        scope: "primary",
        asOfDate: "2026-09-16",
        dataThroughDate: "2026-08-31",
        generatedAt: "2026-09-16T06:00:05.000Z",
        requestedSources: ["financial", "transactions"],
        failedSources: [],
        data: { financial: { ...financial, period: { ...financial.period, incomeCents: 0, expenseCents: 0, operatingNetCents: 0, savingsCents: 0, savingsRateBps: null } }, monthly: null, budgets: null, forecast: null, transactions: staleTransactions },
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");
  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  await expect(brief).toContainText("Mes aún sin movimientos importados");
  await expect(brief).toContainText("No interpretamos la ausencia de movimientos como equilibrio o mejora");
  await expect(brief).not.toContainText("Mes en equilibrio");
});

test("QA-08 · Inicio ofrece Saldo, Ingresos y gastos y Flujo neto desde motores canónicos", async ({ page }) => {
  await mockInicio(page);
  await page.route(/\/api\/financial\?mode=balance_series.*/, async (route) => {
    await json(route, {
      dateFrom: "2026-07-01",
      dateTo: "2026-09-16",
      accountId: null,
      rows: [
        { monthStart: "2026-07-01", asOfDate: "2026-07-31", balanceCents: 18803155, accounts: 2, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0 },
        { monthStart: "2026-08-01", asOfDate: "2026-08-31", balanceCents: 18891172, accounts: 2, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0 },
        { monthStart: "2026-09-01", asOfDate: "2026-09-16", balanceCents: 18813781, accounts: 2, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0 },
      ],
      principles: {
        bankSource: "read_only",
        balanceSource: "financial_account_balances",
        cashFlowReconstruction: false,
        getHasSideEffects: false,
      },
    });
  });

  await page.goto("/");
  const selector = page.getByRole("group", { name: "Vista de evolución financiera" });
  await expect(selector.getByRole("button", { name: "Ingresos y gastos" })).toHaveAttribute("aria-pressed", "true");

  await selector.getByRole("button", { name: "Saldo" }).click();
  await expect(page.getByRole("group", { name: "Saldo bancario agregado por mes" })).toContainText("188.137,81");
  await expect(page.getByText(/no se reconstruye desde cash flow/i)).toBeVisible();

  await selector.getByRole("button", { name: "Flujo neto" }).click();
  await expect(page.getByRole("group", { name: "Flujo neto por mes" })).toBeVisible();
  await expect(page.getByText(/ingresos menos gastos elegibles/i)).toBeVisible();
});

test("QA-08 · Saldo se invalida al Actualizar datos aunque el periodo no cambie", async ({ page }) => {
  await mockInicio(page);

  let refreshed = false;
  const balanceRequests: Array<{ dateFrom: string; refreshed: boolean }> = [];

  await page.route("**/api/source/google/sync", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    refreshed = true;
    await json(route, {
      run: {
        id: "run-refresh",
        status: "success",
        startedAt: "2026-09-16T06:10:00.000Z",
        finishedAt: "2026-09-16T06:10:05.000Z",
        rowsSeen: 12,
        rowsInserted: 0,
        rowsRevised: 0,
        rowsSkipped: 12,
        rowsFailed: 0,
        errorCode: null,
        errorMessage: null,
      },
      cursors: [],
    });
  });

  await page.route(/\/api\/financial\?mode=balance_series.*/, async (route) => {
    const url = new URL(route.request().url());
    const dateFrom = url.searchParams.get("dateFrom") ?? "";
    balanceRequests.push({ dateFrom, refreshed });
    await json(route, {
      dateFrom,
      dateTo: "2026-09-16",
      accountId: null,
      rows: refreshed
        ? [
            { monthStart: "2026-07-01", asOfDate: "2026-07-31", balanceCents: 44000, accounts: 1, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 },
            { monthStart: "2026-09-01", asOfDate: "2026-09-16", balanceCents: 45000, accounts: 1, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 },
          ]
        : [
            { monthStart: "2026-07-01", asOfDate: "2026-07-31", balanceCents: 29000, accounts: 1, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 },
            { monthStart: "2026-09-01", asOfDate: "2026-09-16", balanceCents: 30000, accounts: 1, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 },
          ],
      principles: {
        bankSource: "read_only",
        balanceSource: "financial_account_balances",
        cashFlowReconstruction: false,
        getHasSideEffects: false,
      },
    });
  });

  await page.goto("/");
  const selector = page.getByRole("group", { name: "Vista de evolución financiera" });
  await selector.getByRole("button", { name: "Saldo" }).click();

  const balanceChart = page.getByRole("group", { name: "Saldo bancario agregado por mes" });
  await expect(balanceChart).toContainText("300,00");
  expect(balanceRequests.some((request) => request.dateFrom === "2026-07-01" && !request.refreshed)).toBe(true);

  await page.getByRole("button", { name: "Actualizar datos" }).click();

  await expect.poll(() => balanceRequests.filter((request) => request.refreshed).length).toBeGreaterThan(0);
  await expect(balanceChart).toContainText("450,00");
  await expect(balanceChart).not.toContainText("300,00");
});

test("Primera visita crea referencia para el futuro sin inventar cambios", async ({ page }) => {
  await mockInicio(page);
  await page.goto("/");

  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  await expect(brief).toContainText("Primera referencia guardada");
  await expect(brief).toContainText("A partir de la próxima visita");
  await expect(brief).not.toContainText("movimientos nuevos");

  await expect.poll(async () => page.evaluate((key) => localStorage.getItem(key), HOME_VISIT_KEY)).not.toBeNull();
});

test("El resumen inteligente se adapta a móvil sin ensanchar Inicio", async ({ page }) => {
  await mockInicio(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Resumen inteligente" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


test("QA-05 · Inicio no atribuye al día de consulta un saldo agregado con fechas bancarias distintas", async ({ page }) => {
  await mockInicio(page);
  const mixedBalances = {
    ...financial,
    balances: {
      asOfDate: "2026-09-16",
      activeBalanceCents: 30000,
      accounts: [
        { id: "a", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 10000, explicitBalanceDate: "2026-09-15" },
        { id: "b", name: "Cuenta ahorro", type: "savings", lifecycle: "active", balanceCents: 20000, explicitBalanceDate: "2026-08-31" },
      ],
    },
  };

  await page.route("**/api/dashboard?**", async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope");
    if (scope === "critical" || scope === "primary") {
      await json(route, {
        contractVersion: 1,
        scope,
        asOfDate: "2026-09-16",
        dataThroughDate: scope === "primary" ? "2026-09-16" : null,
        generatedAt: "2026-09-16T06:00:05.000Z",
        requestedSources: scope === "primary" ? ["financial", "transactions"] : ["financial"],
        failedSources: [],
        data: {
          financial: mixedBalances,
          monthly: null,
          budgets: null,
          forecast: null,
          transactions: scope === "primary" ? transactions : null,
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");
  const balanceCard = page.getByRole("article").filter({ hasText: "Saldo total en cuentas" });
  await expect(balanceCard).toContainText("Suma de saldos bancarios con fechas distintas");
  await expect(balanceCard).toContainText("31 ago – 15 sept");
  await expect(balanceCard).not.toContainText("Saldo a 16 sept");
});


test("QA-11 · las gráficas no dibujan barras positivas para valores exactamente cero", async ({ page }) => {
  await mockInicio(page);

  await page.route("**/api/dashboard?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("scope") === "secondary") {
      await json(route, {
        contractVersion: 1,
        scope: "secondary",
        asOfDate: "2026-09-16",
        dataThroughDate: "2026-09-16",
        generatedAt: "2026-09-16T06:00:05.000Z",
        requestedSources: ["monthly", "budgets", "forecast"],
        failedSources: [],
        data: {
          financial: null,
          monthly: {
            dateFrom: "2026-09-01",
            dateTo: "2026-09-16",
            rows: [
              { monthStart: "2026-09-01", incomeCents: 0, expenseCents: 0, operatingNetCents: 0 },
            ],
          },
          budgets,
          forecast,
          transactions: null,
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");

  const incomeExpense = page.getByRole("group", { name: /Ingresos y gastos por mes/ });
  const zeroIncomeExpenseBars = incomeExpense.locator('[data-zero="true"]');
  await expect(zeroIncomeExpenseBars).toHaveCount(2);
  for (const bar of await zeroIncomeExpenseBars.all()) {
    await expect(bar).toHaveCSS("height", "0px");
    await expect(bar).toHaveCSS("min-height", "0px");
  }

  await page.getByRole("button", { name: "Flujo neto" }).click();
  const netChart = page.getByRole("group", { name: "Flujo neto por mes" });
  const zeroNetBar = netChart.locator('[data-zero="true"]');
  await expect(zeroNetBar).toHaveCount(1);
  await expect(zeroNetBar).toHaveCSS("height", "0px");
  await expect(zeroNetBar).toHaveCSS("min-height", "0px");
});


test("QA-12 · Flujo neto sitúa positivos y negativos a lados opuestos de cero", async ({ page }) => {
  await mockInicio(page);

  await page.route("**/api/dashboard?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("scope") === "secondary") {
      await json(route, {
        contractVersion: 1,
        scope: "secondary",
        asOfDate: "2026-09-16",
        dataThroughDate: "2026-09-16",
        generatedAt: "2026-09-16T06:00:05.000Z",
        requestedSources: ["monthly", "budgets", "forecast"],
        failedSources: [],
        data: {
          financial: null,
          monthly: {
            dateFrom: "2026-07-01",
            dateTo: "2026-09-16",
            rows: [
              { monthStart: "2026-07-01", incomeCents: 20000, expenseCents: 10000, operatingNetCents: 10000 },
              { monthStart: "2026-08-01", incomeCents: 10000, expenseCents: 15000, operatingNetCents: -5000 },
              { monthStart: "2026-09-01", incomeCents: 0, expenseCents: 0, operatingNetCents: 0 },
            ],
          },
          budgets,
          forecast,
          transactions: null,
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Flujo neto" }).click();

  const chart = page.getByRole("group", { name: "Flujo neto por mes" });
  const zeroLine = chart.locator('[data-zero-line="true"]').first();
  const positive = chart.locator('[data-sign="positive"]').first();
  const negative = chart.locator('[data-sign="negative"]').first();
  const zero = chart.locator('[data-sign="zero"]').first();

  const lineBox = await zeroLine.boundingBox();
  const positiveBox = await positive.boundingBox();
  const negativeBox = await negative.boundingBox();
  if (!lineBox || !positiveBox || !negativeBox) throw new Error("QA-12: geometría de barras no disponible");

  const baseline = lineBox.y;
  expect(positiveBox.y).toBeLessThan(baseline);
  expect(positiveBox.y + positiveBox.height).toBeLessThanOrEqual(baseline + 2);
  expect(negativeBox.y).toBeGreaterThanOrEqual(baseline - 2);
  expect(negativeBox.y + negativeBox.height).toBeGreaterThan(baseline);
  await expect(zero).toHaveCSS("height", "0px");
});

test("QA-13 · Saldo explica una serie sin cuentas en lugar de dibujar ceros falsos", async ({ page }) => {
  await mockInicio(page);

  await page.route(/\/api\/financial\?mode=balance_series.*/, async (route) => {
    await json(route, {
      dateFrom: "2026-07-01",
      dateTo: "2026-09-16",
      accountId: null,
      rows: [
        {
          monthStart: "2026-07-01",
          asOfDate: "2026-07-31",
          balanceCents: 0,
          accounts: 0,
          explicitBalanceAccounts: 0,
          reconstructedBalanceAccounts: 0,
        },
        {
          monthStart: "2026-08-01",
          asOfDate: "2026-08-31",
          balanceCents: 0,
          accounts: 0,
          explicitBalanceAccounts: 0,
          reconstructedBalanceAccounts: 0,
        },
        {
          monthStart: "2026-09-01",
          asOfDate: "2026-09-16",
          balanceCents: 0,
          accounts: 0,
          explicitBalanceAccounts: 0,
          reconstructedBalanceAccounts: 0,
        },
      ],
      principles: {
        bankSource: "read_only",
        balanceSource: "financial_account_balances",
        cashFlowReconstruction: false,
        getHasSideEffects: false,
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Saldo" }).click();
  await expect(page.getByRole("status")).toContainText("No hay saldos bancarios disponibles para este periodo.");
  await expect(page.getByRole("group", { name: /Saldo bancario agregado por mes/ })).toHaveCount(0);
});


test("QA-14 · privacidad oculta también proporciones y signo en Saldo y Flujo neto", async ({ page }) => {
  await mockInicio(page);
  await page.addInitScript(({ key }) => localStorage.setItem(key, "hidden"), { key: PRIVACY_KEY });

  await page.route("**/api/dashboard?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("scope") === "secondary") {
      await json(route, {
        contractVersion: 1,
        scope: "secondary",
        asOfDate: "2026-09-16",
        dataThroughDate: "2026-09-16",
        generatedAt: "2026-09-16T06:00:05.000Z",
        requestedSources: ["monthly", "budgets", "forecast"],
        failedSources: [],
        data: {
          financial: null,
          monthly: {
            dateFrom: "2026-07-01",
            dateTo: "2026-09-16",
            rows: [
              { monthStart: "2026-07-01", incomeCents: 30000, expenseCents: 10000, operatingNetCents: 20000 },
              { monthStart: "2026-08-01", incomeCents: 10000, expenseCents: 25000, operatingNetCents: -15000 },
              { monthStart: "2026-09-01", incomeCents: 0, expenseCents: 0, operatingNetCents: 0 },
            ],
          },
          budgets,
          forecast,
          transactions: null,
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Mostrar importes" })).toBeVisible();
  await page.getByRole("button", { name: "Flujo neto" }).click();

  const chart = page.getByRole("group", { name: /Flujo neto por mes/ });
  const bars = chart.locator('[data-series-bar="true"]');
  await expect(bars).toHaveCount(3);
  await expect(chart.locator('[data-zero-line="true"]')).toHaveCount(0);
  await expect(chart.locator("[data-sign]")).toHaveCount(0);
  await expect(chart.locator('[data-zero="true"]')).toHaveCount(0);

  const heights = await bars.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.height));
  expect(new Set(heights)).toEqual(new Set(["36%"]));
  await expect(chart).toHaveAttribute("aria-label", /Importes, signos y proporciones ocultos por privacidad/);
});


test("QA-15 · Saldo hace visible cuándo un punto incluye cuentas reconstruidas", async ({ page }) => {
  await mockInicio(page);

  await page.route(/\/api\/financial\?mode=balance_series.*/, async (route) => {
    await json(route, {
      dateFrom: "2026-08-01",
      dateTo: "2026-09-16",
      accountId: null,
      rows: [
        {
          monthStart: "2026-08-01",
          asOfDate: "2026-08-31",
          balanceCents: 100000,
          accounts: 2,
          explicitBalanceAccounts: 2,
          reconstructedBalanceAccounts: 0,
        },
        {
          monthStart: "2026-09-01",
          asOfDate: "2026-09-16",
          balanceCents: 105000,
          accounts: 2,
          explicitBalanceAccounts: 1,
          reconstructedBalanceAccounts: 1,
        },
      ],
      principles: {
        bankSource: "read_only",
        balanceSource: "financial_account_balances",
        cashFlowReconstruction: false,
        getHasSideEffects: false,
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Saldo" }).click();

  await expect(page.getByText(/Cobertura mixta:/)).toContainText("1 de 2 puntos");
  await expect(page.getByText(/Cobertura mixta:/)).toContainText("saldo inicial + movimientos");
  await expect(page.getByText(/Cobertura mixta:/)).toContainText("No se reconstruye desde Cash Flow");
});
