import { expect, test, type Page, type Route } from "@playwright/test";

const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-14",
    incomeCents: 150000,
    expenseCents: 70000,
    operatingNetCents: 80000,
    savingsCents: 80000,
    savingsRateBps: 5333,
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-14",
    activeBalanceCents: 30000,
    accounts: [
      {
        id: "a",
        name: "Cuenta principal",
        type: "checking",
        lifecycle: "active",
        balanceCents: 30000,
        explicitBalanceDate: "2026-09-14",
      },
    ],
  },
};

const monthly = {
  dateFrom: "2026-01-01",
  dateTo: "2026-09-14",
  rows: [
    { monthStart: "2026-07-01", incomeCents: 90000, expenseCents: 45000, operatingNetCents: 45000 },
    { monthStart: "2026-08-01", incomeCents: 100000, expenseCents: 40000, operatingNetCents: 60000 },
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
  categories: [
    {
      categoryId: "food",
      categoryName: "Alimentación",
      effectiveAmountCents: 40000,
      actualExpenseCents: 36000,
      remainingCents: 4000,
      progressBps: 9000,
      status: "on_track",
    },
  ],
};

const forecast = {
  summary: {
    projectedIncomeCents: 5000,
    projectedExpenseCents: 7000,
    projectedNetCents: -2000,
    projectedClosingBalanceCents: 28000,
    plannedItems: 1,
  },
  items: [
    {
      id: "f1",
      date: "2026-09-16",
      concept: "Internet",
      amountCents: -5000,
      status: "planned",
      affectsProjection: true,
    },
  ],
};

const transactions = {
  rows: [
    {
      id: "t1",
      bankDate: "2026-09-13",
      amountCents: -1234,
      account: { id: "a", name: "Cuenta principal" },
      concept: { effective: "COMPRA TARJETA 1234" },
      merchant: { effectiveName: "Carrefour" },
      category: { effectiveName: "Alimentación" },
      kind: { effective: "expense" },
      reviewState: { effective: "confirmed" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
  totalCount: 1,
};

function envelope(
  scope: "primary" | "secondary",
  data: Record<string, unknown>,
  requestedSources: string[],
) {
  return {
    contractVersion: 1,
    scope,
    asOfDate: "2026-09-14",
    dataThroughDate: "2026-09-13",
    generatedAt: "2026-09-14T18:30:00.000Z",
    requestedSources,
    failedSources: [],
    data: {
      financial: null,
      monthly: null,
      budgets: null,
      forecast: null,
      transactions: null,
      ...data,
    },
  };
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function installDashboardMocks(page: Page, secondaryGate?: Promise<void>) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/source/google/sync") {
      await fulfillJson(route, { run: null });
      return;
    }

    if (url.pathname === "/api/dashboard") {
      const scope = url.searchParams.get("scope");
      if (scope === "primary") {
        await fulfillJson(
          route,
          envelope("primary", { financial, transactions }, ["financial", "transactions"]),
        );
        return;
      }
      if (scope === "secondary") {
        if (secondaryGate) await secondaryGate;
        await fulfillJson(
          route,
          envelope("secondary", { monthly, budgets, forecast }, ["monthly", "budgets", "forecast"]),
        );
        return;
      }
    }

    await route.fallback();
  });
}

test("Inicio prioriza resumen y actividad sin esperar a los módulos secundarios", async ({ page }) => {
  let releaseSecondary!: () => void;
  const secondaryGate = new Promise<void>((resolve) => {
    releaseSecondary = resolve;
  });

  await installDashboardMocks(page, secondaryGate);
  await page.goto("/");

  const summary = page.getByRole("region", { name: "Resumen financiero principal" });
  await expect(summary.getByText("300,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("Carrefour", { exact: true })).toBeVisible();
  await expect(page.locator("main[aria-busy='true']")).toBeVisible();

  releaseSecondary();

  await expect(page.locator("main[aria-busy='true']")).toHaveCount(0);
  await expect(page.getByText(/Último mes completo/i)).toBeVisible();
  await expect(page.getByRole("group", { name: /Ingresos y gastos por mes/i })).toBeVisible();
  await expect(page.getByText("Alimentación", { exact: true }).first()).toBeVisible();
});

test("Inicio usa privacidad persistente para ocultar todos los importes del resumen", async ({ page }) => {
  await installDashboardMocks(page);
  await page.goto("/");

  const summary = page.getByRole("region", { name: "Resumen financiero principal" });
  await expect(summary.getByText("300,00 €", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Ocultar importes" }).click();
  await expect(summary.getByText("300,00 €", { exact: true })).toHaveCount(0);
  await expect(summary.getByText("••••,•• €", { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Mostrar importes" })).toBeVisible();
  await expect(summary.getByText("300,00 €", { exact: true })).toHaveCount(0);
});

test("Inicio mantiene comercio como lectura principal de la actividad reciente", async ({ page }) => {
  await installDashboardMocks(page);
  await page.goto("/");

  await expect(page.getByText("Carrefour", { exact: true })).toBeVisible();
  await expect(page.getByText("Alimentación · Cuenta principal", { exact: true })).toBeVisible();
});
