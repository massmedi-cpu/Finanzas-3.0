import { expect, test } from "@playwright/test";
import {
  buildAnalysisSnapshot,
  type AnalysisGatewaySnapshot,
} from "../../src/application/analysis/analysis-engine";

const WIDTHS = [360, 430, 768, 1024, 1280, 1440] as const;

const HISTORY = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(2025, 9 + index, 1));
  const monthStart = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const incomeCents = 190000 + index * 1500;
  const expenseCents = 72000 - index * 1400;
  const savingsCents = incomeCents - expenseCents;
  return {
    monthStart,
    rows: 12,
    incomeCents,
    expenseCents,
    operatingNetCents: savingsCents,
    savingsCents,
    savingsRateBps: Math.round((savingsCents * 10000) / incomeCents),
  };
});

const GATEWAY: AnalysisGatewaySnapshot = {
  current: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-15",
    incomeCents: 210000,
    expenseCents: 55000,
    operatingNetCents: 155000,
    savingsCents: 155000,
    savingsRateBps: 7381,
    quality: { includedRows: 12, manuallyExcludedRows: 0, confirmedDuplicateRows: 0 },
  },
  previous: {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-15",
    incomeCents: 200000,
    expenseCents: 60000,
    operatingNetCents: 140000,
    savingsCents: 140000,
    savingsRateBps: 7000,
  },
  history: { rows: HISTORY },
  accounts: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Cuenta principal", lifecycle: "active" }],
  categories: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Alimentación", currentExpenseCents: 35000, previousExpenseCents: 30000, currentRows: 7, previousRows: 6 },
    { id: "33333333-3333-4333-8333-333333333333", name: "Transporte", currentExpenseCents: 20000, previousExpenseCents: 30000, currentRows: 5, previousRows: 6 },
  ],
  merchants: [
    { id: "22222222-2222-4222-8222-222222222222", name: "Mercado Central", currentExpenseCents: 35000, previousExpenseCents: 32000, currentRows: 7, previousRows: 7, currentAverageCents: 5000, habitualAverageCents: 4500, historyRows: 12 },
    { id: "44444444-4444-4444-8444-444444444444", name: "Gasolinera", currentExpenseCents: 20000, previousExpenseCents: 28000, currentRows: 5, previousRows: 5, currentAverageCents: 4000, habitualAverageCents: 5200, historyRows: 10 },
  ],
  concentration: { top3CategoryBps: 10000, top3MerchantBps: 10000 },
  anomalies: [],
  fixedVariable: { available: false, reliableRecurrences: 0, fixedExpenseCents: 0, variableExpenseCents: 55000 },
  budget: {
    month: "2026-09",
    total: { effectiveAmountCents: 100000, actualExpenseCents: 55000, remainingCents: 45000, progressBps: 5500, status: "on_track" },
    overCategories: [],
    categoryDetailDeferred: true,
  },
  forecast: {
    period: { dateFrom: "2026-09-15", dateTo: "2026-09-30", accountId: null },
    summary: {
      plannedItems: 0,
      projectedNetCents: 0,
      projectedIncomeCents: 0,
      projectedExpenseCents: 0,
      projectedClosingBalanceCents: null,
      openingBalanceCents: null,
    },
    detailDeferred: true,
  },
};

const SNAPSHOT = buildAnalysisSnapshot({
  range: "1m",
  month: "2026-09",
  accountId: null,
  dateFrom: "2026-09-01",
  dateTo: "2026-09-15",
  previousDateFrom: "2026-08-01",
  previousDateTo: "2026-08-15",
  partial: true,
  partialMonthStart: "2026-09-01",
  gateway: GATEWAY,
});

for (const width of WIDTHS) {
  test(`Premium Análisis · ${width}px sin overflow y con jerarquía financiera completa`, async ({ page }) => {
    await page.route("**/api/analysis**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) });
    });

    await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
    await page.goto("/analysis", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Mes de referencia").fill("2026-09");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).toHaveURL(/\/analysis\?month=2026-09&range=1m$/);

    await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Indicadores principales del periodo")).toBeVisible();
    await expect(page.getByLabel("Lectura rápida")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comercios principales" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cómo está cambiando tu dinero" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tu gasto (ha aumentado|ha disminuido|se mantiene)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dónde se concentra el gasto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gasto fijo y variable" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Movimientos que merece la pena revisar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Presupuesto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Previsión" })).toBeVisible();
    await expect(page.getByText(/Detalle por categorías disponible en Presupuestos/i)).toBeVisible();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    ).toBe(true);

    const apply = page.getByRole("button", { name: "Aplicar" });
    const applyBox = await apply.boundingBox();
    expect(applyBox).not.toBeNull();
    expect(applyBox!.height).toBeGreaterThanOrEqual(44);

    const range = page.getByRole("button", { name: "1 mes" });
    const rangeBox = await range.boundingBox();
    expect(rangeBox).not.toBeNull();
    expect(rangeBox!.height).toBeGreaterThanOrEqual(44);

    const chartMonth = page.getByRole("button", { name: /Ingresos\b.*\bgastos\b/i }).last();
    await expect(chartMonth).toBeVisible();
    const chartMonthBox = await chartMonth.boundingBox();
    expect(chartMonthBox).not.toBeNull();
    expect(chartMonthBox!.height).toBeGreaterThanOrEqual(44);

    await chartMonth.focus();
    await expect(chartMonth).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("tooltip").filter({ hasText: /Ingresos/ })).toBeVisible();

    const sectionBoxes = await page.locator("main section").evaluateAll((sections) =>
      sections.map((section) => {
        const rect = section.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    );
    for (const box of sectionBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(width + 1);
      expect(box.width).toBeGreaterThan(0);
    }
  });
}
