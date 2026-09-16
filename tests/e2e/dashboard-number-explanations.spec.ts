import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-16",
    incomeCents: 170000,
    expenseCents: 85000,
    operatingNetCents: 85000,
    savingsCents: 85000,
    savingsRateBps: 5000,
    transfers: { grossCents: 12000 },
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-16",
    activeBalanceCents: 234500,
    quality: {
      accounts: 2,
      explicitBalanceAccounts: 1,
      reconstructedBalanceAccounts: 1,
      integrityDeltaAccounts: 0,
    },
    accounts: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Cuenta principal",
        type: "checking",
        lifecycle: "active",
        balanceCents: 184500,
        balanceSource: "bank_explicit",
        explicitBalanceDate: "2026-09-16",
        reconstructionDeltaCents: null,
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        name: "Cuenta ahorro",
        type: "savings",
        lifecycle: "active",
        balanceCents: 50000,
        balanceSource: "reconstructed",
        explicitBalanceDate: null,
        reconstructionDeltaCents: 0,
      },
    ],
  },
  principles: {
    bankSource: "read_only",
    transfersExcludedFromSavings: true,
    explicitBankBalancePreferred: true,
  },
};

const monthly = {
  dateFrom: "2026-01-01",
  dateTo: "2026-09-16",
  rows: [
    { monthStart: "2026-08-01", incomeCents: 160000, expenseCents: 80000, operatingNetCents: 80000 },
    { monthStart: "2026-09-01", incomeCents: 170000, expenseCents: 85000, operatingNetCents: 85000 },
  ],
};

const budgets = {
  month: "2026-09",
  total: {
    categoryId: null,
    categoryName: null,
    effectiveAmountCents: 120000,
    actualExpenseCents: 85000,
    remainingCents: 35000,
    progressBps: 7083,
    status: "on_track",
  },
  categories: [
    {
      categoryId: "20000000-0000-4000-8000-000000000001",
      categoryName: "Alimentación",
      effectiveAmountCents: 50000,
      actualExpenseCents: 30000,
      remainingCents: 20000,
      progressBps: 6000,
      status: "on_track",
    },
  ],
};

const forecast = {
  period: { dateFrom: "2026-09-16", dateTo: "2026-10-16", accountId: null },
  summary: {
    openingBalanceCents: 234500,
    projectedIncomeCents: 40000,
    projectedExpenseCents: 55000,
    projectedNetCents: -15000,
    projectedClosingBalanceCents: 219500,
    plannedItems: 2,
    excludedItems: 0,
    confirmedItems: 0,
  },
  items: [
    {
      id: "forecast-1",
      date: "2026-09-20",
      concept: "Factura prevista",
      amountCents: -55000,
      origin: "known",
      confidence: "high",
      status: "planned",
      affectsProjection: true,
    },
  ],
};

const transactions = {
  rows: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      bankDate: "2026-09-16",
      amountCents: -3000,
      account: { id: "10000000-0000-4000-8000-000000000001", name: "Cuenta principal" },
      concept: { effective: "Compra supermercado" },
      merchant: { originalId: null, originalName: null, effectiveId: null, effectiveName: "Supermercado Demo" },
      category: { effectiveName: "Alimentación" },
      kind: { effective: "expense" },
      reviewState: { original: "confirmed", effective: "confirmed" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
  totalCount: 1,
};

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockDashboard(page: Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/source/google/sync") {
      await json(route, { run: null });
      return;
    }
    if (url.pathname === "/api/dashboard") {
      const scope = url.searchParams.get("scope");
      if (scope === "primary") {
        await json(route, {
          contractVersion: 1,
          scope: "primary",
          asOfDate: "2026-09-16",
          generatedAt: "2026-09-16T20:00:00.000Z",
          requestedSources: ["financial"],
          failedSources: [],
          data: { financial, monthly: null, budgets: null, forecast: null, transactions: null },
        });
        return;
      }
      if (scope === "secondary") {
        await json(route, {
          contractVersion: 1,
          scope: "secondary",
          asOfDate: "2026-09-16",
          generatedAt: "2026-09-16T20:00:00.000Z",
          requestedSources: ["monthly", "budgets", "forecast", "transactions"],
          failedSources: [],
          data: { financial: null, monthly, budgets, forecast, transactions },
        });
        return;
      }
    }
    await route.fallback();
  });
}

function panel(page: Page, heading: string) {
  return page.locator("article").filter({ has: page.getByRole("heading", { name: heading, exact: true }) }).first();
}

test("Inicio explica las cifras clave con periodo, criterio y detalle propietario", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/");

  const accounts = panel(page, "Tus cuentas");
  const month = panel(page, "Balance");
  const budget = panel(page, "Gasto y presupuesto");
  const future = panel(page, "Próximos días");

  for (const target of [accounts, month, budget, future]) {
    await expect(target.getByText("Explicar cifras", { exact: true })).toBeVisible();
  }

  await month.getByText("Explicar cifras", { exact: true }).click();
  await expect(month.getByText("Ingresos y gastos", { exact: true })).toBeVisible();
  await expect(month.getByText(/resumen financiero canónico/i)).toBeVisible();
  await expect(month.getByRole("link", { name: "Ver ingresos" })).toHaveAttribute(
    "href",
    "/transactions?dateFrom=2026-09-01&dateTo=2026-09-16&kind=income",
  );
  await expect(month.getByRole("link", { name: "Ver gastos" })).toHaveAttribute(
    "href",
    "/transactions?dateFrom=2026-09-01&dateTo=2026-09-16&kind=expense",
  );
  await expect(month.getByRole("link", { name: "Abrir Análisis" })).toHaveAttribute("href", "/analysis");

  await accounts.getByText("Explicar cifras", { exact: true }).click();
  await expect(accounts.getByText(/Se prioriza el saldo bancario explícito/i)).toBeVisible();
  await expect(accounts.getByRole("link", { name: "Ver detalle de cuentas" })).toHaveAttribute("href", "/accounts");

  await budget.getByText("Explicar cifras", { exact: true }).click();
  await expect(budget.getByText(/motor central de presupuestos/i)).toBeVisible();
  await expect(budget.getByRole("link", { name: "Ver presupuesto completo" })).toHaveAttribute("href", "/budgets");

  await future.getByText("Explicar cifras", { exact: true }).click();
  await expect(future.getByText(/motor de previsión/i)).toBeVisible();
  await expect(future.getByRole("link", { name: "Ver previsión y partidas" })).toHaveAttribute("href", "/forecast");
});

test("Explicar cifras conserva privacidad y no introduce importes propios", async ({ page }) => {
  await mockDashboard(page);
  await page.addInitScript(() => localStorage.setItem("financial-app:home-amounts", "hidden"));
  await page.goto("/");

  const month = panel(page, "Balance");
  await expect(page.getByRole("button", { name: "Mostrar importes" })).toBeVisible();
  await month.getByText("Explicar cifras", { exact: true }).click();
  await expect(month.getByText("••••,•• €", { exact: true }).first()).toBeVisible();
  await expect(month.getByText(/1700|850,00|1\.700/)).toHaveCount(0);
  await expect(month.getByText(/resumen financiero canónico/i)).toBeVisible();
});

test("Explicar cifras es compacto, táctil y no desborda en móvil", async ({ page }) => {
  await mockDashboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const summaries = page.locator("details summary").filter({ hasText: "Explicar cifras" });
  await expect(summaries).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const box = await summaries.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await summaries.nth(index).click();
  }

  const detailLinks = page.locator("details[open] a[href]");
  const count = await detailLinks.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await detailLinks.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Explicar cifras es presentación pura y no crea una segunda fuente financiera", () => {
  const component = readFileSync(resolve(process.cwd(), "app/number-explanation.tsx"), "utf8");
  const dashboard = readFileSync(resolve(process.cwd(), "app/dashboard-client.tsx"), "utf8");
  expect(component).not.toContain("fetch(");
  expect(component).not.toContain("amountCents");
  expect(component).not.toContain("balanceCents");
  expect(dashboard.match(/<NumberExplanation/g)?.length).toBe(4);
  expect(dashboard).toContain("Proceden del resumen financiero canónico del periodo; no se recalculan en Inicio.");
  expect(dashboard).toContain("Gasto real que el motor central de presupuestos atribuye al mes y a sus categorías.");
});
