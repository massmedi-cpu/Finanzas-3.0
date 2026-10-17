import { expect, test, type Page, type Route } from "@playwright/test";

const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-11",
    incomeCents: 38,
    expenseCents: 14121,
    operatingNetCents: -14083,
    savingsCents: -14083,
    savingsRateBps: -3706050,
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-11",
    activeBalanceCents: 18877089,
    accounts: [
      { id: "a", name: "Cuenta corriente", type: "checking", lifecycle: "active", balanceCents: 181317, explicitBalanceDate: "2026-09-11" },
      { id: "b", name: "Cuenta ahorro", type: "savings", lifecycle: "active", balanceCents: 18695772, explicitBalanceDate: "2026-08-31" },
    ],
  },
};

const monthly = {
  dateFrom: "2025-10-01",
  dateTo: "2026-09-11",
  rows: [
    { monthStart: "2025-10-01", incomeCents: 125000, expenseCents: 76000, operatingNetCents: 49000 },
    { monthStart: "2025-11-01", incomeCents: 130000, expenseCents: 82000, operatingNetCents: 48000 },
    { monthStart: "2025-12-01", incomeCents: 145000, expenseCents: 99000, operatingNetCents: 46000 },
    { monthStart: "2026-01-01", incomeCents: 115000, expenseCents: 87000, operatingNetCents: 28000 },
    { monthStart: "2026-02-01", incomeCents: 118000, expenseCents: 84000, operatingNetCents: 34000 },
    { monthStart: "2026-03-01", incomeCents: 123000, expenseCents: 81000, operatingNetCents: 42000 },
    { monthStart: "2026-04-01", incomeCents: 120000, expenseCents: 70000, operatingNetCents: 50000 },
    { monthStart: "2026-05-01", incomeCents: 110000, expenseCents: 90000, operatingNetCents: 20000 },
    { monthStart: "2026-06-01", incomeCents: 100000, expenseCents: 120000, operatingNetCents: -20000 },
    { monthStart: "2026-07-01", incomeCents: 200000, expenseCents: 50000, operatingNetCents: 150000 },
    { monthStart: "2026-08-01", incomeCents: 120000, expenseCents: 30000, operatingNetCents: 90000 },
    { monthStart: "2026-09-01", incomeCents: 38, expenseCents: 14121, operatingNetCents: -14083 },
  ],
};

const budgets = {
  month: "2026-09",
  total: { categoryId: null, categoryName: null, effectiveAmountCents: 50000, actualExpenseCents: 14121, remainingCents: 35879, progressBps: 2824, status: "on_track" },
  categories: [],
};

const forecast = {
  summary: { projectedIncomeCents: 10000, projectedExpenseCents: 8000, projectedNetCents: 2000, projectedClosingBalanceCents: 18879089, plannedItems: 1 },
  items: [{ id: "f1", date: "2026-09-20", concept: "Factura prevista", amountCents: -8000, status: "planned", affectsProjection: true }],
};

const transactions = {
  totalCount: 3174,
  rows: [
    {
      id: "t1",
      bankDate: "2026-09-11",
      amountCents: -2910,
      account: { id: "a", name: "Cuenta corriente" },
      concept: { effective: "Compra supermercado" },
      merchant: { effectiveName: "Mercadona" },
      category: { effectiveName: "Alimentación" },
      kind: { effective: "expense" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
};

const homeAnalysis = {
  contractVersion: 1,
  source: "analysis",
  period: {
    month: "2026-08",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    previousDateFrom: "2026-07-01",
    previousDateTo: "2026-07-31",
  },
  netComparison: {
    currentNetCents: 90000,
    previousNetCents: 150000,
    deltaCents: -60000,
  },
  expenseAverage3m: { cents: 66667, months: 3 },
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockInicio(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00+02:00"));
  let postCount = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/analysis/source-freshness") {
      await json(route, {
        available: true,
        earliestMovementDate: "2026-01-01",
        latestMovementDate: "2026-09-11",
        sync: {
          // The bank can have its latest MOVEMENT on 11 Sept even when the
          // source was successfully checked on 15 Sept. Both statuses must
          // agree on the recent import timestamp for a green certification.
          status: "success", startedAt: "2026-09-15T09:00:00Z",
          finishedAt: "2026-09-15T09:04:08.000Z",
          rowsSeen: 100, rowsFailed: 0, rowsMissing: 0,
          duplicatesDetected: 0, warningsCount: 0,
        },
      });
      return;
    }

    if (url.pathname === "/api/source/google/sync") {
      if (request.method() === "POST") {
        postCount += 1;
        await json(route, { status: "success", rowsInserted: 0, rowsRevised: 0, rowsSkipped: 3174 });
      } else {
        await json(route, {
          run: {
            id: "run-1",
            status: "success",
            startedAt: "2026-09-15T09:04:08.000Z",
            finishedAt: "2026-09-15T09:04:08.000Z",
            rowsSeen: 3174,
            rowsInserted: 2,
            rowsRevised: 0,
            rowsSkipped: 3172,
            rowsFailed: 0,
            rowsMissing: 0,
            duplicatesDetected: 0,
            warningsCount: 0,
            errorCode: null,
            errorMessage: null,
          },
          cursors: [],
        });
      }
      return;
    }

    if (url.pathname === "/api/dashboard/analysis") {
      await json(route, homeAnalysis);
      return;
    }

    if (url.pathname === "/api/dashboard") {
      const scope = url.searchParams.get("scope");
      if (scope === "critical") {
        await json(route, {
          contractVersion: 1,
          scope: "critical",
          asOfDate: "2026-09-11",
          dataThroughDate: null,
          generatedAt: "2026-09-15T09:04:08.000Z",
          requestedSources: ["financial"],
          failedSources: [],
          data: { financial, monthly: null, budgets: null, forecast: null, transactions: null },
        });
        return;
      }
      if (scope === "activity") {
        await json(route, {
          contractVersion: 1,
          scope: "activity",
          asOfDate: "2026-09-11",
          dataThroughDate: "2026-09-11",
          generatedAt: "2026-09-15T09:04:08.000Z",
          requestedSources: ["transactions"],
          failedSources: [],
          data: { financial: null, monthly: null, budgets: null, forecast: null, transactions },
        });
        return;
      }
      if (scope === "primary") {
        await json(route, {
          contractVersion: 1,
          scope: "primary",
          asOfDate: "2026-09-11",
          dataThroughDate: "2026-09-11",
          generatedAt: "2026-09-15T09:04:08.000Z",
          requestedSources: ["financial", "transactions"],
          failedSources: [],
          data: { financial, monthly: null, budgets: null, forecast: null, transactions },
        });
        return;
      }
      if (scope === "secondary") {
        await json(route, {
          contractVersion: 1,
          scope: "secondary",
          asOfDate: "2026-09-11",
          dataThroughDate: "2026-09-11",
          generatedAt: "2026-09-15T09:04:08.000Z",
          requestedSources: ["monthly", "budgets", "forecast"],
          failedSources: [],
          data: { financial: null, monthly, budgets, forecast, transactions: null },
        });
        return;
      }
    }

    await route.fallback();
  });
  return () => postCount;
}

test("Inicio no confunde fecha del último movimiento con fallo de sincronización", async ({ page }) => {
  await mockInicio(page);
  await page.goto("/");

  await expect(page.getByText("Datos bancarios actualizados", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Estado de los datos bancarios" }))
    .toContainText(/Actualización 15 sept/);
  await expect(page.getByText(/movimientos hasta 11 sept/i)).toBeVisible();
  await expect(page.getByText("Los datos bancarios no están al día")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Reconectar Google" })).toHaveCount(0);
});

test("Actualizar datos ejecuta la sincronización real y mantiene la portada operativa", async ({ page }) => {
  const getPostCount = await mockInicio(page);
  await page.goto("/");

  const button = page.getByRole("button", { name: "Actualizar datos" });
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(getPostCount).toBe(1);
  await expect(page.getByText(/Sin cambios nuevos/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
});

test("Inicio sustituye una tasa de ahorro sin base suficiente por una lectura comprensible", async ({ page }) => {
  await mockInicio(page);
  await page.goto("/");

  await expect(page.getByText(/Importes parciales · cobertura observada hasta/).first()).toBeVisible();
  await expect(page.getByText("Ahorro: sin base suficiente", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/37\.060/)).toHaveCount(0);
});

test("Inicio elimina la revisión de movimientos y usa el hueco para gasto medio mensual", async ({ page }) => {
  await mockInicio(page);
  await page.goto("/");

  const summary = page.getByRole("region", { name: "Resumen financiero principal" });
  await expect(summary.getByText("Gasto medio mensual", { exact: true })).toBeVisible();
  await expect(summary.getByText("666,67 €", { exact: true })).toBeVisible();
  await expect(page.getByText("Por revisar", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Revisar movimientos/i)).toHaveCount(0);
  await expect(page.getByText(/movimientos están pendientes/i)).toHaveCount(0);
});

test("el cash flow de Inicio usa 12 meses y no necesita scroll horizontal", async ({ page }) => {
  await mockInicio(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Últimos 12 meses", exact: true })).toBeVisible();
  const chart = page.getByRole("group", { name: /Ingresos y gastos por mes/i });
  await expect(chart).toBeVisible();
  await expect(chart.getByRole("button")).toHaveCount(12);
  const geometry = await chart.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


test("Saldo de Inicio no presenta datos vacíos antes de consultar una serie bancaria", async ({ page }) => {
  await mockInicio(page);
  let releaseRead: (() => void) | null = null;
  const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
  let reads = 0;
  await page.route(/\/api\/financial(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") !== "balance_series") return route.fallback();
    reads += 1;
    await readGate;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        dateFrom: url.searchParams.get("dateFrom"),
        dateTo: url.searchParams.get("dateTo"),
        accountId: null,
        rows: [],
        principles: {
          bankSource: "read_only",
          balanceSource: "financial_account_balances",
          cashFlowReconstruction: false,
          getHasSideEffects: false,
        },
      }),
    });
  });
  await page.goto("/");
  const modes = page.getByRole("group", { name: "Vista de evolución financiera" });
  await modes.getByRole("button", { name: "Saldo", exact: true }).click();
  await expect(page.getByRole("status", { name: "Cargando evolución del saldo" })).toBeVisible();
  await expect(page.getByText("No hay saldos bancarios disponibles para este periodo.")).toHaveCount(0);
  releaseRead?.();
  await expect(page.getByText("No hay saldos bancarios disponibles para este periodo.")).toBeVisible();
  expect(reads).toBe(1);
});


test("REC-HOME-BAL-002 · retry clears a stale balance error before any new bank evidence", async ({ page }) => {
  await mockInicio(page);
  let reads = 0;
  let releaseRead: (() => void) | null = null;
  const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
  await page.route(/\/api\/financial(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") !== "balance_series") return route.fallback();
    reads += 1;
    if (reads === 1) {
      await route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "temporarily_unavailable" }),
      });
      return;
    }
    await readGate;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        dateFrom: url.searchParams.get("dateFrom"),
        dateTo: url.searchParams.get("dateTo"),
        accountId: null, rows: [],
        principles: {
          bankSource: "read_only",
          balanceSource: "financial_account_balances",
          cashFlowReconstruction: false,
          getHasSideEffects: false,
        },
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("group", { name: "Vista de evolución financiera" })
    .getByRole("button", { name: "Saldo", exact: true }).click();
  const failure = page.getByText("No se ha podido cargar la evolución del saldo.", { exact: false });
  await expect(failure).toBeVisible();
  await page.getByRole("button", { name: "Reintentar saldo" }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Cargando evolución del saldo" })).toBeVisible();
  await expect(page.getByText("No hay saldos bancarios disponibles para este periodo.")).toHaveCount(0);
  releaseRead?.();
  await expect(page.getByText("No hay saldos bancarios disponibles para este periodo.")).toBeVisible();
  expect(reads).toBe(2);
});


test("REC-HOME-AVG-005 · Inicio hides an unverified historical average instead of displaying a plausible number", async ({ page }) => {
  await mockInicio(page);
  // Analysis may legitimately return an average while banking data before
  // August is missing. It is not evidence that June and July were zero.
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await json(route, {
      available: true,
      earliestMovementDate: "2026-08-01",
      latestMovementDate: "2026-09-11",
      sync: {
        status: "success",
        startedAt: "2026-09-11T08:00:00Z",
        finishedAt: "2026-09-11T08:05:00Z",
        rowsSeen: 100, rowsFailed: 0, rowsMissing: 0,
        duplicatesDetected: 0, warningsCount: 0,
      },
    });
  });
  await page.goto("/");
  const summary = page.getByRole("region", { name: "Resumen financiero principal" });
  const card = summary.locator("article").filter({ hasText: "Gasto medio mensual" });
  await expect(card.getByText("Media no verificable con la cobertura bancaria disponible")).toBeVisible();
  await expect(card.getByText("666,67 €")).toHaveCount(0);
  await expect(card.locator("strong")).toHaveText("—");
});

test("REC-HOME-AVG-006 · unavailable bank source must not advertise a verified historic expense average", async ({ page }) => {
  await mockInicio(page);
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await json(route, {
      available: false, earliestMovementDate: null,
      latestMovementDate: null, sync: null,
    });
  });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Resumen financiero principal" })
    .locator("article").filter({ hasText: "Gasto medio mensual" });
  await expect(card.locator("strong")).toHaveText("—");
  await expect(card).toContainText("Media no verificable con la cobertura bancaria disponible");
});


test("REC-HOME-AVG-007 · el gasto medio calculado pero no acreditado no se presenta como indisponibilidad", async ({ page }) => {
  await mockInicio(page);
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await json(route, {
      available: true,
      earliestMovementDate: "2026-01-01",
      latestMovementDate: "2026-09-11",
      sync: {
        status: "partial",
        startedAt: "2026-09-11T08:00:00Z",
        finishedAt: "2026-09-11T08:05:00Z",
        rowsSeen: 100, rowsFailed: 0, rowsMissing: 3,
        duplicatesDetected: 0, warningsCount: 1,
      },
    });
  });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Resumen financiero principal" })
    .locator("article").filter({ hasText: "Gasto medio mensual" });
  await expect(card).toContainText("Media no verificable con la cobertura bancaria disponible");
  await expect(card).not.toContainText("Análisis no disponible");
  await expect(card).not.toContainText("666,67 €");
});
