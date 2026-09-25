import { expect, test, type Page } from "@playwright/test";
import type { AnalysisGatewaySnapshot } from "../../src/application/analysis/analysis-engine";
import { buildComparisonSnapshot } from "../../src/application/comparison/comparison-engine";
import { resolveComparisonSelection } from "../../src/application/comparison/comparison-selection";

const ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "20000000-0000-4000-8000-000000000002";
const MERCHANT_ID = "30000000-0000-4000-8000-000000000003";

function snapshotFor(url: URL) {
  const selection = resolveComparisonSelection({
    primaryFrom: url.searchParams.get("primaryFrom"),
    primaryTo: url.searchParams.get("primaryTo"),
    referenceFrom: url.searchParams.get("referenceFrom"),
    referenceTo: url.searchParams.get("referenceTo"),
    accountId: url.searchParams.get("accountId"),
  }, "2026-09-25");
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
    categories: [
      { id: CATEGORY_ID, name: "Alimentación", currentExpenseCents: 12_000, previousExpenseCents: 9_000, currentRows: 3, previousRows: 2 },
      { id: null, name: "Sin categoría", currentExpenseCents: 8_000, previousExpenseCents: 6_000, currentRows: 1, previousRows: 1 },
    ],
    merchants: [
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

async function mockComparison(page: Page) {
  await page.route("**/api/analysis/source-freshness", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, latestMovementDate: "2026-09-25", sync: null }),
  }));
  await page.route("**/api/compare?**", async (route) => {
    const snapshot = snapshotFor(new URL(route.request().url()));
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
