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
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-16",
    activeBalanceCents: 234500,
    accounts: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Cuenta principal",
        type: "checking",
        lifecycle: "active",
        balanceCents: 234500,
        explicitBalanceDate: "2026-09-16",
      },
    ],
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
  categories: [],
};

const forecast = {
  summary: {
    projectedIncomeCents: 40000,
    projectedExpenseCents: 55000,
    projectedNetCents: -15000,
    projectedClosingBalanceCents: 219500,
    plannedItems: 1,
  },
  items: [
    {
      id: "forecast-1",
      date: "2026-09-20",
      concept: "Factura prevista",
      amountCents: -55000,
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
      merchant: { effectiveName: "Supermercado Demo" },
      category: { effectiveName: "Alimentación" },
      kind: { effective: "expense" },
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
          dataThroughDate: "2026-09-16",
          generatedAt: "2026-09-16T20:00:00.000Z",
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
          asOfDate: "2026-09-16",
          dataThroughDate: "2026-09-16",
          generatedAt: "2026-09-16T20:00:00.000Z",
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

test("Inicio explica las cifras clave desde la portada real y enlaza con sus módulos propietarios", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/");

  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  const disclosure = brief.getByText("Explicar cifras", { exact: true });
  await expect(disclosure).toBeVisible();
  await disclosure.click();

  await expect(brief.getByText("Disponible", { exact: true }).last()).toBeVisible();
  await expect(brief.getByText(/Saldo agregado de las cuentas activas/i)).toBeVisible();
  await expect(brief.getByText(/resumen financiero canónico del mes/i)).toBeVisible();
  await expect(brief.getByText(/motor central de presupuestos/i)).toBeVisible();
  await expect(brief.getByText(/motor de previsión/i)).toBeVisible();

  await expect(brief.getByRole("link", { name: "Ver cuentas" })).toHaveAttribute("href", "/accounts");
  await expect(brief.getByRole("link", { name: "Ver ingresos del mes" })).toHaveAttribute(
    "href",
    "/transactions?dateFrom=2026-09-01&dateTo=2026-09-16&kind=income",
  );
  await expect(brief.getByRole("link", { name: "Ver gastos del mes" })).toHaveAttribute(
    "href",
    "/transactions?dateFrom=2026-09-01&dateTo=2026-09-16&kind=expense",
  );
  await expect(brief.getByRole("link", { name: "Ver presupuestos" })).toHaveAttribute("href", "/budgets");
  await expect(brief.getByRole("link", { name: "Ver previsión" })).toHaveAttribute("href", "/forecast");
});

test("Explicar cifras respeta el modo discreto y no revela importes por su cuenta", async ({ page }) => {
  await mockDashboard(page);
  await page.addInitScript(() => localStorage.setItem("financial-app:home-amounts", "hidden"));
  await page.goto("/");

  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  await expect(page.getByRole("button", { name: "Mostrar importes" })).toBeVisible();
  await brief.getByText("Explicar cifras", { exact: true }).click();
  await expect(brief).toContainText("••••,•• €");
  await expect(brief.getByText(/Saldo agregado de las cuentas activas/i)).toBeVisible();
  await expect(brief.getByText(/1\.700,00|850,00|2\.345,00/)).toHaveCount(0);
});

test("Explicar cifras mantiene objetivos táctiles y no desborda en móvil", async ({ page }) => {
  await mockDashboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  const summary = brief.locator("details summary").filter({ hasText: "Explicar cifras" });
  await expect(summary).toHaveCount(1);
  const summaryBox = await summary.boundingBox();
  expect(summaryBox).not.toBeNull();
  expect(summaryBox!.height).toBeGreaterThanOrEqual(44);
  await summary.click();

  const detailLinks = brief.locator("details[open] a[href]");
  const count = await detailLinks.count();
  expect(count).toBeGreaterThanOrEqual(4);
  for (let index = 0; index < count; index += 1) {
    const box = await detailLinks.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Explicar cifras es presentación pura y no crea una segunda fuente financiera", () => {
  const component = readFileSync(resolve(process.cwd(), "app/number-explanation.tsx"), "utf8");
  const liveHome = readFileSync(resolve(process.cwd(), "app/home-smart-brief.tsx"), "utf8");
  expect(component).not.toContain("fetch(");
  expect(component).not.toContain("amountCents");
  expect(component).not.toContain("balanceCents");
  expect(liveHome.match(/<NumberExplanation/g)?.length).toBe(1);
  expect(liveHome).toContain("Inicio no recalcula esas cifras.");
  expect(liveHome).toContain("motor central de presupuestos");
  expect(liveHome).toContain("motor de previsión");
});
