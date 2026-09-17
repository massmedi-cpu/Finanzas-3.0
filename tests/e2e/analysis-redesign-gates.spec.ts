import { expect, test, type Page } from "@playwright/test";
import {
  buildAnalysisSnapshot,
  type AnalysisGatewaySnapshot,
  type AnalysisSnapshot,
} from "../../src/application/analysis/analysis-engine";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const MERCHANT_ID = "22222222-2222-4222-8222-222222222222";

const HISTORY = [
  ["2026-03-01", 100000, 8000],
  ["2026-04-01", 100000, 7600],
  ["2026-05-01", 100000, 7200],
  ["2026-06-01", 100000, 6800],
  ["2026-07-01", 100000, 6400],
  ["2026-08-01", 100000, 6000],
].map(([monthStart, incomeCents, expenseCents]) => {
  const income = incomeCents as number;
  const expense = expenseCents as number;
  const savings = income - expense;
  return {
    monthStart: monthStart as string,
    rows: 3,
    incomeCents: income,
    expenseCents: expense,
    operatingNetCents: savings,
    savingsCents: savings,
    savingsRateBps: Math.round((savings * 10000) / income),
  };
});

function buildSnapshot(gateway: AnalysisGatewaySnapshot): AnalysisSnapshot {
  return buildAnalysisSnapshot({
    range: "1m",
    month: "2026-09",
    accountId: null,
    dateFrom: "2026-09-01",
    dateTo: "2026-09-15",
    previousDateFrom: "2026-08-01",
    previousDateTo: "2026-08-15",
    partial: true,
    partialMonthStart: "2026-09-01",
    gateway,
  });
}

const LOW_DATA_SNAPSHOT = buildSnapshot({
  current: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-15",
    incomeCents: 100000,
    expenseCents: 6000,
    operatingNetCents: 94000,
    savingsCents: 94000,
    savingsRateBps: 9400,
    quality: { scopedRows: 3, includedRows: 3, manuallyExcludedRows: 0, confirmedDuplicateRows: 0 },
  },
  previous: {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-15",
    incomeCents: 100000,
    expenseCents: 5000,
    operatingNetCents: 95000,
    savingsCents: 95000,
    savingsRateBps: 9500,
  },
  history: { rows: HISTORY },
  accounts: [{ id: ACCOUNT_ID, name: "Cuenta principal", lifecycle: "active" }],
  categories: [{
    id: CATEGORY_ID,
    name: "Alimentación",
    currentExpenseCents: 6000,
    previousExpenseCents: 5000,
    currentRows: 3,
    previousRows: 2,
  }],
  merchants: [{
    id: MERCHANT_ID,
    name: "Mercado Central",
    currentExpenseCents: 6000,
    previousExpenseCents: 5000,
    currentRows: 3,
    previousRows: 2,
    currentAverageCents: 2000,
    habitualAverageCents: 1800,
    historyRows: 6,
  }],
  dailySpend: [
    { date: "2026-09-02", expenseCents: 1000, rows: 1 },
    { date: "2026-09-08", expenseCents: 2000, rows: 1 },
    { date: "2026-09-14", expenseCents: 3000, rows: 1 },
  ],
  weekdaySpend: [
    { weekday: 1, expenseCents: 2000, rows: 1, averageCents: 2000 },
    { weekday: 2, expenseCents: 1000, rows: 1, averageCents: 1000 },
    { weekday: 7, expenseCents: 3000, rows: 1, averageCents: 3000 },
  ],
  amountBands: [
    { band: "10to25", expenseCents: 3000, rows: 2 },
    { band: "25to50", expenseCents: 3000, rows: 1 },
  ],
  concepts: [{ concept: "Compra puntual", expenseCents: 6000, rows: 3, averageCents: 2000 }],
  accountSpend: [{ accountId: ACCOUNT_ID, accountName: "Cuenta principal", expenseCents: 6000, rows: 3, averageCents: 2000 }],
  topTransactions: [
    {
      transactionId: "99999999-9999-4999-8999-999999999991",
      bankDate: "2026-09-14",
      amountCents: 3000,
      conceptNormalized: "Compra puntual",
      merchantId: MERCHANT_ID,
      merchantName: "Mercado Central",
      categoryId: CATEGORY_ID,
      categoryName: "Alimentación",
      accountId: ACCOUNT_ID,
      accountName: "Cuenta principal",
    },
    {
      transactionId: "99999999-9999-4999-8999-999999999992",
      bankDate: "2026-09-08",
      amountCents: 2000,
      conceptNormalized: "Compra puntual",
      merchantId: MERCHANT_ID,
      merchantName: "Mercado Central",
      categoryId: CATEGORY_ID,
      categoryName: "Alimentación",
      accountId: ACCOUNT_ID,
      accountName: "Cuenta principal",
    },
    {
      transactionId: "99999999-9999-4999-8999-999999999993",
      bankDate: "2026-09-02",
      amountCents: 1000,
      conceptNormalized: "Compra puntual",
      merchantId: MERCHANT_ID,
      merchantName: "Mercado Central",
      categoryId: CATEGORY_ID,
      categoryName: "Alimentación",
      accountId: ACCOUNT_ID,
      accountName: "Cuenta principal",
    },
  ],
  concentration: { top3CategoryBps: 10000, top3MerchantBps: 10000 },
  anomalies: [],
  fixedVariable: {
    available: true,
    reliableRecurrences: 1,
    fixedExpenseCents: 2000,
    variableExpenseCents: 4000,
  },
  budget: null,
  forecast: null,
});

const EMPTY_SNAPSHOT = buildSnapshot({
  current: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-15",
    incomeCents: 0,
    expenseCents: 0,
    operatingNetCents: 0,
    savingsCents: 0,
    savingsRateBps: null,
    quality: { scopedRows: 0, includedRows: 0, manuallyExcludedRows: 0, confirmedDuplicateRows: 0 },
  },
  previous: {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-15",
    incomeCents: 0,
    expenseCents: 0,
    operatingNetCents: 0,
    savingsCents: 0,
    savingsRateBps: null,
  },
  history: { rows: [] },
  accounts: [{ id: ACCOUNT_ID, name: "Cuenta principal", lifecycle: "active" }],
  categories: [],
  merchants: [],
  dailySpend: [],
  weekdaySpend: [],
  amountBands: [],
  concepts: [],
  accountSpend: [],
  topTransactions: [],
  concentration: { top3CategoryBps: null, top3MerchantBps: null },
  anomalies: [],
  fixedVariable: {
    available: false,
    reliableRecurrences: 0,
    fixedExpenseCents: 0,
    variableExpenseCents: 0,
  },
  budget: null,
  forecast: null,
});

async function openAnalysis(page: Page, snapshot: AnalysisSnapshot) {
  await page.route("**/api/analysis**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
  await page.goto("/analysis", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
}

for (const width of [390, 1440] as const) {
  test(`Rediseño Análisis · ${width}px mantiene pocos datos legibles y sin overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 900 : 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openAnalysis(page, LOW_DATA_SNAPSHOT);

    await expect(page.getByRole("img", { name: "Evolución diaria del gasto del periodo" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Gasto por día de la semana" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Distribución de movimientos por tramo de importe" })).toBeVisible();
    const heatmap = page.getByRole("img", { name: "Mapa de calor diario del gasto" });
    const scatter = page.getByRole("img", { name: "Relación entre frecuencia de compra e importe medio por comercio" });
    await expect(heatmap).toBeVisible();
    await expect(scatter).toBeVisible();
    await expect(page.getByRole("img", { name: "Curva de concentración del gasto por comercio" })).toBeVisible();

    const dailyChart = page.getByRole("img", { name: "Evolución diaria del gasto del periodo" });
    expect(await dailyChart.locator("circle").count()).toBe(3);
    const dailyBox = await dailyChart.boundingBox();
    expect(dailyBox).not.toBeNull();
    expect(dailyBox!.height).toBeLessThan(300);

    const heatmapUsage = await heatmap.evaluate((svg) => {
      const cells = Array.from(svg.querySelectorAll("rect"));
      if (cells.length < 2) return 1;
      const svgBox = svg.getBoundingClientRect();
      const boxes = cells.map((cell) => cell.getBoundingClientRect());
      const left = Math.min(...boxes.map((box) => box.left));
      const right = Math.max(...boxes.map((box) => box.right));
      return svgBox.width > 0 ? (right - left) / svgBox.width : 0;
    });
    expect(heatmapUsage).toBeGreaterThan(0.55);

    const scatterLabelsClear = await scatter.evaluate((svg) => {
      const labels = Array.from(svg.querySelectorAll("text"));
      const caption = labels.find((node) => node.textContent?.includes("Mayor importe"));
      const values = labels.filter((node) => node.textContent?.includes("€"));
      if (!caption || values.length === 0) return false;
      const captionBox = caption.getBoundingClientRect();
      return values.every((value) => {
        const valueBox = value.getBoundingClientRect();
        return captionBox.right <= valueBox.left
          || valueBox.right <= captionBox.left
          || captionBox.bottom <= valueBox.top
          || valueBox.bottom <= captionBox.top;
      });
    });
    expect(scatterLabelsClear).toBe(true);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

    const sectionBoxes = await page.locator("main section").evaluateAll((sections) => sections.map((section) => {
      const rect = section.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }));
    for (const box of sectionBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(width + 1);
      expect(box.width).toBeGreaterThan(0);
    }

    const quickReadLink = page.getByLabel("Lectura rápida").locator("a").first();
    await expect(quickReadLink).toBeVisible();
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    const transitionSeconds = await quickReadLink.evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration));
    expect(transitionSeconds).toBeLessThanOrEqual(0.001);

    await page.screenshot({ path: testInfo.outputPath(`analysis-low-data-${width}.png`), fullPage: true });
  });
}

test("Rediseño Análisis · 390px mantiene el estado sin movimientos compacto y explícito", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openAnalysis(page, EMPTY_SNAPSHOT);

  await expect(page.getByRole("heading", { name: "Patrones que no se ven en un simple total" })).toHaveCount(0);
  await expect(page.getByText("No hay categorías con gasto elegible en el periodo.", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin clasificación fiable todavía", { exact: true })).toBeVisible();
  await expect(page.getByText("No hay gastos elegibles en el periodo.", { exact: true }).first()).toBeVisible();

  for (const headingName of ["Dónde se concentra el gasto", "Gasto fijo y variable"] as const) {
    const section = page.getByRole("heading", { name: headingName }).locator("xpath=ancestor::section[1]");
    const box = await section.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(300);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await expect(page.getByRole("status", { name: "Cargando análisis financiero" })).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath("analysis-empty-390.png"), fullPage: true });
});
