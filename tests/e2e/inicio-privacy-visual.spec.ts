import { expect, test, type Page, type Route } from "@playwright/test";

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

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
      { id: "a", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 30000, explicitBalanceDate: "2026-09-11" },
    ],
  },
};

const monthly = {
  dateFrom: "2026-06-01",
  dateTo: "2026-09-11",
  rows: [
    { monthStart: "2026-06-01", incomeCents: 50000, expenseCents: 120000, operatingNetCents: -70000 },
    { monthStart: "2026-07-01", incomeCents: 200000, expenseCents: 50000, operatingNetCents: 150000 },
    { monthStart: "2026-08-01", incomeCents: 120000, expenseCents: 30000, operatingNetCents: 90000 },
    { monthStart: "2026-09-01", incomeCents: 150000, expenseCents: 70000, operatingNetCents: 80000 },
  ],
};

const budgets = {
  month: "2026-09",
  total: { categoryId: null, categoryName: null, effectiveAmountCents: 100000, actualExpenseCents: 70000, remainingCents: 30000, progressBps: 7000, status: "on_track" },
  categories: [],
};

const forecast = {
  period: { dateFrom: "2026-09-11", dateTo: "2026-10-11", accountId: null },
  summary: {
    openingBalanceCents: 30000,
    projectedIncomeCents: 0,
    projectedExpenseCents: 32000,
    projectedNetCents: -32000,
    projectedClosingBalanceCents: -2000,
    plannedItems: 1,
  },
  items: [
    {
      id: "f1",
      date: "2026-09-20",
      concept: "Cargo previsto",
      amountCents: -32000,
      categoryId: null,
      categoryName: null,
      status: "planned",
      affectsProjection: true,
    },
  ],
};

const transactions = {
  totalCount: 1,
  rows: [
    {
      id: "t1",
      bankDate: "2026-09-11",
      amountCents: -1234,
      account: { id: "a", name: "Cuenta principal" },
      concept: { effective: "Compra" },
      merchant: { effectiveName: "Comercio" },
      category: { effectiveName: "Compras" },
      kind: { effective: "expense" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
};

async function mockInicio(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-11T10:00:00+02:00"));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/source/google/sync") {
      await json(route, {
        run: {
          id: "run-privacy",
          status: "success",
          startedAt: "2026-09-11T08:00:00.000Z",
          finishedAt: "2026-09-11T08:00:00.000Z",
          rowsSeen: 1,
          rowsInserted: 0,
          rowsRevised: 0,
          rowsSkipped: 1,
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
      if (scope === "critical") {
        await json(route, {
          contractVersion: 1,
          scope: "critical",
          asOfDate: "2026-09-11",
          dataThroughDate: "2026-09-11",
          generatedAt: "2026-09-11T08:00:00.000Z",
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
          generatedAt: "2026-09-11T08:00:00.000Z",
          requestedSources: ["transactions"],
          failedSources: [],
          data: { financial: null, monthly: null, budgets: null, forecast: null, transactions },
        });
        return;
      }
      await json(route, {
        contractVersion: 1,
        scope: "secondary",
        asOfDate: "2026-09-11",
        dataThroughDate: "2026-09-11",
        generatedAt: "2026-09-11T08:00:00.000Z",
        requestedSources: ["monthly", "budgets", "forecast"],
        failedSources: [],
        data: { financial: null, monthly, budgets, forecast, transactions: null },
      });
      return;
    }

    await route.fallback();
  });
}

async function barHeights(page: Page) {
  const chart = page.getByRole("group", { name: /Ingresos y gastos por mes/i });
  return chart.locator("button > span[aria-hidden='true'] > span").evaluateAll((bars) => (
    bars.map((bar) => (bar as HTMLElement).style.height)
  ));
}

test("Ocultar importes protege también las proporciones del cash flow y persiste", async ({ page }) => {
  await mockInicio(page);
  await page.goto("/");

  const visibleChart = page.getByRole("group", { name: /Selecciona un mes para consultar ingresos/i });
  await expect(visibleChart).toBeVisible();
  const initialHeights = await barHeights(page);
  expect(new Set(initialHeights).size).toBeGreaterThan(1);
  await expect(page.locator('[data-financial-sign="positive"]').first()).toBeVisible();
  await expect(page.locator('[data-financial-sign="negative"]').first()).toBeVisible();
  await expect(page.getByText("Balance registrado en positivo", { exact: true })).toBeVisible();
  await expect(page.getByText("La previsión termina en negativo", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("financial-app:home-last-visit:v1"))).not.toBeNull();

  await page.getByRole("button", { name: "Ocultar importes" }).click();

  const protectedChart = page.getByRole("group", { name: /proporciones están ocultos por privacidad/i });
  await expect(protectedChart).toBeVisible();
  await expect(page.getByText("Importes ocultos · proporciones protegidas", { exact: true })).toBeVisible();
  expect(await barHeights(page)).toEqual(Array(initialHeights.length).fill("36%"));

  const hiddenBalance = page.locator('[data-balance-sign="hidden"]');
  await expect(hiddenBalance).toBeVisible();
  await expect(page.locator('[data-financial-sign="negative"]')).toHaveCount(0);
  await expect(page.locator('[data-financial-sign="positive"]')).toHaveCount(0);
  expect(await page.locator('[data-financial-sign="hidden"]').count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByText("Balance del mes protegido", { exact: true })).toBeVisible();
  await expect(page.getByText("Balance registrado en positivo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("La previsión termina en negativo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ahorro oculto por privacidad", { exact: true })).toBeVisible();
  await expect(page.getByText("Privacidad activa · referencia monetaria local eliminada", { exact: true })).toBeVisible();
  await expect(page.getByText(/La comparación entre visitas está pausada mientras ocultas importes/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("financial-app:home-last-visit:v1"))).toBeNull();

  const protectedBudget = page.locator('[data-budget-progress-privacy="hidden"]');
  await expect(protectedBudget).toHaveAttribute("aria-label", "Porcentaje de presupuesto oculto por privacidad");
  await expect(protectedBudget.locator("span")).toHaveAttribute("style", /width:\\s*36%/);
  await expect(page.locator('[data-budget-ranking-privacy="hidden"]')).toHaveText("Detalle por categorías oculto por privacidad.");
  await expect(hiddenBalance).toHaveCSS("color", await page.locator("body").evaluate((body) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-text-secondary)";
    body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }));

  for (const button of await protectedChart.getByRole("button").all()) {
    await expect(button).toHaveAttribute("aria-label", /importes ocultos por privacidad/i);
    await expect(button).not.toHaveAttribute("aria-label", /€|ingresos \d|gastos \d/i);
  }

  await page.reload();
  await expect(page.getByRole("button", { name: "Mostrar importes" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("financial-app:home-last-visit:v1"))).toBeNull();
  await expect(page.getByRole("group", { name: /proporciones están ocultos por privacidad/i })).toBeVisible();
  expect(await barHeights(page)).toEqual(Array(initialHeights.length).fill("36%"));

  await page.getByRole("button", { name: "Mostrar importes" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("financial-app:home-last-visit:v1"))).not.toBeNull();
  const restoredChart = page.getByRole("group", { name: /Selecciona un mes para consultar ingresos/i });
  await expect(restoredChart).toBeVisible();
  expect(new Set(await barHeights(page)).size).toBeGreaterThan(1);

  await restoredChart.getByRole("button").first().click();
  await expect(page.locator('[data-balance-sign="negative"]')).toBeVisible();
});

test("Ocultar importes oculta también el signo visual del balance", async ({ page }) => {
  await mockInicio(page);
  await page.goto("/");

  const chart = page.getByRole("group", { name: /Selecciona un mes para consultar ingresos/i });
  await chart.getByRole("button").first().click();
  await expect(page.locator('[data-balance-sign="negative"]')).toBeVisible();

  await page.getByRole("button", { name: "Ocultar importes" }).click();
  await expect(page.locator('[data-balance-sign="hidden"]')).toBeVisible();
  await expect(page.locator('[data-balance-sign="negative"]')).toHaveCount(0);
  await expect(page.locator('[data-balance-sign="positive"]')).toHaveCount(0);
  await expect(page.locator('[data-financial-sign="negative"]')).toHaveCount(0);
  await expect(page.locator('[data-financial-sign="positive"]')).toHaveCount(0);
  await expect(page.locator('[data-budget-progress-privacy="hidden"]')).toBeVisible();
});