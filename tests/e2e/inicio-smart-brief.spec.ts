import { expect, test, type Page, type Route } from "@playwright/test";

const HOME_VISIT_KEY = "financial-app:home-last-visit:v1";

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
    actualExpenseCents: 60000,
    remainingCents: 40000,
    progressBps: 6000,
    status: "on_track",
  },
  categories: [],
};

const forecast = {
  summary: {
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
  await expect(brief).toContainText("Balance mensual en positivo");
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
      budgetProgressBps: 4000,
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
