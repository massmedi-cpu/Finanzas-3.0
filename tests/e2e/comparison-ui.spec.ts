import { expect, test, type Page } from "@playwright/test";
import type { AnalysisGatewaySnapshot } from "../../src/application/analysis/analysis-engine";
import { buildComparisonSnapshot } from "../../src/application/comparison/comparison-engine";
import { resolveComparisonSelection } from "../../src/application/comparison/comparison-selection";

const ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "20000000-0000-4000-8000-000000000002";
const MERCHANT_ID = "30000000-0000-4000-8000-000000000003";

function snapshotFor(url: URL, extendedDrivers = false) {
  const selection = resolveComparisonSelection({
    primaryFrom: url.searchParams.get("primaryFrom"),
    primaryTo: url.searchParams.get("primaryTo"),
    referenceFrom: url.searchParams.get("referenceFrom"),
    referenceTo: url.searchParams.get("referenceTo"),
    accountId: url.searchParams.get("accountId"),
  }, "2026-10-06");
  const gateway: AnalysisGatewaySnapshot = {
    current: {
      dateFrom: selection.primaryFrom,
      dateTo: selection.primaryTo,
      incomeCents: 50_000,
      expenseCents: 20_000,
      operatingNetCents: 30_000,
      savingsCents: 30_000,
      savingsRateBps: 6_000,
      quality: { scopedRows: 5, includedRows: 4, manuallyExcludedRows: 1, confirmedDuplicateRows: 0, suspectedDuplicateRows: 0, signMismatchRows: 0 },
    },
    previous: {
      dateFrom: selection.referenceFrom,
      dateTo: selection.referenceTo,
      incomeCents: 45_000,
      expenseCents: 15_000,
      operatingNetCents: 30_000,
      savingsCents: 30_000,
      savingsRateBps: 6_667,
      quality: { scopedRows: 4, includedRows: 3, manuallyExcludedRows: 1, confirmedDuplicateRows: 0, suspectedDuplicateRows: 0, signMismatchRows: 0 },
    },
    history: { rows: [] },
    accounts: [{ id: ACCOUNT_ID, name: "Cuenta principal", lifecycle: "active" }],
    categories: extendedDrivers
      ? Array.from({ length: 12 }, (_, index) => ({
          id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000001`,
          name: `Categoría ${index + 1}`,
          currentExpenseCents: index === 0 ? 9_000 : 1_000,
          previousExpenseCents: index === 0 ? 4_000 : 1_000,
          currentRows: 1, previousRows: 1,
        }))
      : [
          { id: CATEGORY_ID, name: "Alimentación", currentExpenseCents: 12_000, previousExpenseCents: 9_000, currentRows: 3, previousRows: 2 },
          { id: null, name: "Sin categoría", currentExpenseCents: 8_000, previousExpenseCents: 6_000, currentRows: 1, previousRows: 1 },
        ],
    merchants: extendedDrivers
      ? Array.from({ length: 18 }, (_, index) => ({
          id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000002`,
          name: `Comercio ${index + 1}`,
          currentExpenseCents: index === 0 ? 3_000 : 1_000,
          previousExpenseCents: index === 0 ? 1_400 : 800,
          currentRows: 1, previousRows: 1,
          currentAverageCents: index === 0 ? 3_000 : 1_000,
          habitualAverageCents: index === 0 ? 1_400 : 800,
          historyRows: 3,
        }))
      : [
          { id: MERCHANT_ID, name: "Mercado Central", currentExpenseCents: 20_000, previousExpenseCents: 15_000, currentRows: 4, previousRows: 3, currentAverageCents: 5_000, habitualAverageCents: 4_500, historyRows: 8 },
        ],
    concentration: { top3CategoryBps: 10_000, top3MerchantBps: 10_000 },
    anomalies: [],
    fixedVariable: { available: false, reliableRecurrences: 0, fixedExpenseCents: 0, variableExpenseCents: 20_000 },
    budget: null,
    forecast: null,
  };
  return buildComparisonSnapshot({ selection, gateway });
}

async function mockComparison(page: Page, extendedDrivers = false) {
  await page.route(/\/api\/analysis\/source-freshness(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, earliestMovementDate: "2026-07-01", latestMovementDate: "2026-09-25", sync: null }),
  }));
  await page.route("**/api/compare?**", async (route) => {
    const snapshot = snapshotFor(new URL(route.request().url()), extendedDrivers);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
}

async function openComparison(page: Page) {
  await mockComparison(page);
  await page.goto(`/compare?primaryFrom=2026-09-01&primaryTo=2026-09-10&referenceFrom=2026-08-01&referenceTo=2026-08-05&accountId=${ACCOUNT_ID}`);
  await expect(page.getByRole("heading", { name: "Comparador", level: 1 })).toBeVisible();
}

test("CMP-UI-001 muestra una comparación explicable y trazable", async ({ page }) => {
  await openComparison(page);
  await expect(page.getByText("El gasto diario baja 33,3 %", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen comparativo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qué categorías explican la diferencia" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qué comercios explican la diferencia" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Alimentación, periodo principal/ })).toHaveAttribute("href", /categoryId=/);
  await expect(page.getByRole("link", { name: /Mercado Central, referencia/ })).toHaveAttribute("href", /merchantId=/);
  await expect(page.getByText("Totales reconciliados")).toBeVisible();
});

test("REC-CMP-002 · la frescura del Comparador cambia con la cuenta bancaria aplicada", async ({ page }) => {
  const requestedScopes: Array<string | null> = [];
  await mockComparison(page);
  await page.route(/\/api\/analysis\/source-freshness(?:\?.*)?$/, async (route) => {
    const selected = new URL(route.request().url()).searchParams.get("accountId");
    requestedScopes.push(selected);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        available: true,
        earliestMovementDate: "2026-07-01",
        latestMovementDate: "2026-09-25",
        sync: null,
      }),
    });
  });

  await page.goto(`/compare?primaryFrom=2026-09-01&primaryTo=2026-09-10&referenceFrom=2026-08-01&referenceTo=2026-08-05&accountId=${ACCOUNT_ID}`);
  await expect.poll(() => requestedScopes.includes(ACCOUNT_ID)).toBe(true);
  await expect(page.getByRole("article", { name: "Neto operativo y ahorro" })).toContainText("Tasa de ahorro");

  await page.getByRole("form", { name: "Periodos de comparación" }).getByLabel("Cuenta").selectOption("");
  await page.getByRole("button", { name: "Comparar periodos" }).click();
  await expect.poll(() => requestedScopes.includes(null)).toBe(true);
  await expect(page).not.toHaveURL(/accountId=/);
});

test("QA-02 · no interpreta como mejora un periodo posterior al último movimiento importado", async ({ page }) => {
  await page.route(/\/api\/analysis\/source-freshness(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, latestMovementDate: "2026-09-29", sync: null }),
  }));
  await page.route("**/api/compare?**", async (route) => {
    const snapshot = snapshotFor(new URL(route.request().url()));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });

  await page.goto(`/compare?primaryFrom=2026-10-01&primaryTo=2026-10-06&referenceFrom=2026-09-01&referenceTo=2026-09-06&accountId=${ACCOUNT_ID}`);
  const insight = page.locator("section").filter({ has: page.getByText("LECTURA PRINCIPAL", { exact: true }) });
  await expect(insight).toContainText("último movimiento importado es del 29/09/2026");
  await expect(insight).toContainText("No interpretamos 0 € como mejora");
  await expect(insight).not.toContainText("El gasto diario baja");
  const metrics = page.getByRole("region", { name: "Resumen comparativo" });
  // Neto y Ahorro comparten ahora una tarjeta: 2 métricas + bloque agrupado.
  await expect(metrics.getByText("Comparación incompleta", { exact: true })).toHaveCount(3);
  await expect(metrics.getByRole("article", { name: "Neto operativo y ahorro" })).toContainText("Sin movimientos confirmados en el periodo");
  await expect(metrics).not.toContainText("−100");
  await expect(metrics).not.toContainText("-100");
  const categories = page.getByRole("table", { name: /categorías/i });
  const merchants = page.getByRole("table", { name: /comercios/i });
  await expect(page.getByRole("heading", { name: "Categorías con actividad observada" })).toBeVisible();
  await expect(categories).toContainText("Sin dato");
  await expect(categories).toContainText("Sin base comparable");
  await expect(categories).not.toContainText("+30,00 €");
  await expect(merchants).toContainText("Sin base comparable");
  await expect(merchants).not.toContainText("+50,00 €");
});

test("REC-CMP-001 · cobertura parcial conserva importes observados pero no inventa causas del cambio", async ({ page }) => {
  await mockComparison(page);
  await page.route(/\/api\/analysis\/source-freshness(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, latestMovementDate: "2026-09-05", sync: null }),
  }));
  await page.goto(`/compare?primaryFrom=2026-09-01&primaryTo=2026-09-10&referenceFrom=2026-08-01&referenceTo=2026-08-05&accountId=${ACCOUNT_ID}`);
  await expect(page.getByRole("heading", { name: "Categorías con actividad observada" })).toBeVisible();
  const categories = page.getByRole("table", { name: /categorías/i });
  await expect(categories).toContainText("120,00 €");
  await expect(categories).toContainText("Sin base comparable");
  await expect(categories).not.toContainText("+30,00 €");
  await expect(categories.getByRole("link", { name: /Alimentación, periodo principal/ })).toHaveAttribute("href", /categoryId=/);
  const merchants = page.getByRole("table", { name: /comercios/i });
  await expect(merchants).toContainText("Sin base comparable");
  await expect(page.getByRole("region", { name: "Resumen comparativo" })).not.toContainText("33,3 %");
});

test("CMP-UI-002 valida solapamientos sin perder la comparación vigente", async ({ page }) => {
  await openComparison(page);
  await page.getByLabel("Desde", { exact: true }).nth(1).fill("2026-09-01");
  await page.getByLabel("Hasta", { exact: true }).nth(1).fill("2026-09-02");
  await page.getByRole("button", { name: "Comparar periodos" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("debe terminar antes");
  await expect(page.getByText("Totales reconciliados")).toBeVisible();
});

test("CMP-UI-003 aplica el periodo anterior equivalente y actualiza una URL compartible", async ({ page }) => {
  await openComparison(page);
  await page.getByRole("button", { name: "Referencia equivalente" }).click();
  await expect(page.getByLabel("Desde", { exact: true }).nth(1)).toHaveValue("2026-08-22");
  await expect(page.getByLabel("Hasta", { exact: true }).nth(1)).toHaveValue("2026-08-31");
  await page.getByRole("button", { name: "Comparar periodos" }).click();
  await expect(page).toHaveURL(/referenceFrom=2026-08-22/);
  await expect(page).toHaveURL(/referenceTo=2026-08-31/);
});

test("AUD-E2E-NAV-001 · Continuar desde Comparador sigue el periodo aplicado sin recarga", async ({ page }) => {
  await openComparison(page);
  const nav = page.getByRole("navigation", { name: "Continuar desde el Comparador" });
  await expect(nav.getByRole("link", { name: /Movimientos · principal/ })).toHaveAttribute("href", /dateFrom=2026-09-01&dateTo=2026-09-10/);
  await page.getByLabel("Desde", { exact: true }).first().fill("2026-09-11");
  await page.getByLabel("Hasta", { exact: true }).first().fill("2026-09-18");
  await page.getByRole("button", { name: "Comparar periodos" }).click();
  await expect(page).toHaveURL(/primaryFrom=2026-09-11/);
  await expect(nav.getByRole("link", { name: /Movimientos · principal/ })).toHaveAttribute("href", /dateFrom=2026-09-11&dateTo=2026-09-18/);
  const analysisLink = nav.getByRole("link", { name: "Análisis" });
  await expect(analysisLink).toHaveAttribute("href", /periodMode=custom&dateFrom=2026-09-11&dateTo=2026-09-18/);
  await expect(analysisLink).toHaveAttribute("href", /compareMode=custom&compareDateFrom=/);
});
for (const viewport of [
  { label: "360", width: 360, height: 800 },
  { label: "430", width: 430, height: 900 },
  { label: "1440", width: 1440, height: 1000 },
]) {
  test(`CMP-UI-004 mantiene la jerarquía y evita desbordamiento a ${viewport.label}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openComparison(page);
    await expect(page.getByRole("form", { name: "Periodos de comparación" })).toBeVisible();
    await expect(page.getByRole("table", { name: /categorías/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}


test("AUD-E2E-CMP-001 · Ver todos expande 12 categorías y 18 comercios sin perder los dos enlaces", async ({ page }) => {
  await mockComparison(page, true);
  await page.goto(`/compare?primaryFrom=2026-09-01&primaryTo=2026-09-10&referenceFrom=2026-08-01&referenceTo=2026-08-05&accountId=${ACCOUNT_ID}`);
  const categories = page.getByRole("heading", { name: "Qué categorías explican la diferencia" }).locator("xpath=..").locator("xpath=..");
  const commerce = page.getByRole("heading", { name: "Qué comercios explican la diferencia" }).locator("xpath=..").locator("xpath=..");
  const categoryPanel = page.locator("section").filter({ has: categories.getByRole("heading", { name: "Qué categorías explican la diferencia" }) }).last();
  const merchantPanel = page.locator("section").filter({ has: commerce.getByRole("heading", { name: "Qué comercios explican la diferencia" }) }).last();
  await expect(categoryPanel.locator("tbody tr")).toHaveCount(8);
  await expect(merchantPanel.locator("tbody tr")).toHaveCount(8);

  await categoryPanel.getByRole("button", { name: "Ver todas las categorías (12)" }).click();
  await merchantPanel.getByRole("button", { name: "Ver todos los comercios (18)" }).click();
  await expect(categoryPanel.locator("tbody tr")).toHaveCount(12);
  await expect(merchantPanel.locator("tbody tr")).toHaveCount(18);
  await expect(categoryPanel.getByRole("link", { name: /Categoría 12, periodo principal/ })).toHaveAttribute("href", /dateFrom=2026-09-01/);
  await expect(merchantPanel.getByRole("link", { name: /Comercio 18, referencia/ })).toHaveAttribute("href", /dateFrom=2026-08-01/);
  await categoryPanel.getByRole("button", { name: "Ver menos categorías" }).click();
  await merchantPanel.getByRole("button", { name: "Ver menos comercios" }).click();
  await expect(categoryPanel.locator("tbody tr")).toHaveCount(8);
  await expect(merchantPanel.locator("tbody tr")).toHaveCount(8);
});


test("AUD-E2E-CMP-001 · neto y ahorro coincidentes se agrupan sin duplicar importes", async ({ page }) => {
  await openComparison(page);
  const group = page.getByRole("article", { name: "Neto operativo y ahorro" });
  await expect(group).toBeVisible();
  await expect(group).toContainText("El ahorro coincide con el neto operativo en ambos periodos");
  await expect(group).toContainText("Tasa de ahorro");
  await expect(group.getByText("300,00 €", { exact: true })).toHaveCount(1);
});
