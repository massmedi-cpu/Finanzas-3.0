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
  dateFrom: "2026-01-01",
  dateTo: "2026-09-11",
  rows: [
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
      reviewState: { effective: "pending" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockInicio(page: Page) {
  let postCount = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

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
            errorCode: null,
            errorMessage: null,
          },
          cursors: [],
        });
      }
      return;
    }

    if (url.pathname === "/api/dashboard") {
      const scope = url.searchParams.get("scope");
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

  await expect(page.getByText("Ahorro: sin base suficiente", { exact: true })).toBeVisible();
  await expect(page.getByText(/37\.060/)).toHaveCount(0);
});

test("la gráfica de Inicio usa cinco meses y no necesita scroll horizontal", async ({ page }) => {
  await mockInicio(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const chart = page.getByRole("group", { name: /Ingresos y gastos por mes/i });
  await expect(chart).toBeVisible();
  await expect(chart.getByRole("button")).toHaveCount(5);
  const geometry = await chart.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
