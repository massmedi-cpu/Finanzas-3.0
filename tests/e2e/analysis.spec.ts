import { expect, test } from "@playwright/test";
import {
  buildAnalysisSnapshot,
  type AnalysisGatewaySnapshot,
  type AnalysisSnapshot,
} from "../../src/application/analysis/analysis-engine";
import { resolveAnalysisSelection } from "../../src/application/analysis/analysis-loader";

const CATEGORY_FOOD = "11111111-1111-4111-8111-111111111111";
const CATEGORY_TRANSPORT = "33333333-3333-4333-8333-333333333333";
const MERCHANT_MARKET = "22222222-2222-4222-8222-222222222222";
const MERCHANT_FUEL = "44444444-4444-4444-8444-444444444444";

const HISTORY = [
  ["2025-10-01", 180000, 70000, 110000, 6111],
  ["2025-11-01", 180000, 68000, 112000, 6222],
  ["2025-12-01", 190000, 72000, 118000, 6211],
  ["2026-01-01", 200000, 65000, 135000, 6750],
  ["2026-02-01", 200000, 64000, 136000, 6800],
  ["2026-03-01", 205000, 63000, 142000, 6927],
  ["2026-04-01", 205000, 62000, 143000, 6976],
  ["2026-05-01", 210000, 61000, 149000, 7095],
  ["2026-06-01", 210000, 60000, 150000, 7143],
  ["2026-07-01", 210000, 59000, 151000, 7190],
  ["2026-08-01", 200000, 60000, 140000, 7000],
  ["2026-09-01", 210000, 55000, 155000, 7381],
].map(([monthStart, incomeCents, expenseCents, savingsCents, savingsRateBps]) => ({
  monthStart: monthStart as string,
  rows: 12,
  incomeCents: incomeCents as number,
  expenseCents: expenseCents as number,
  operatingNetCents: savingsCents as number,
  savingsCents: savingsCents as number,
  savingsRateBps: savingsRateBps as number,
}));

const GATEWAY: AnalysisGatewaySnapshot = {
  current: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-15",
    incomeCents: 210000,
    expenseCents: 55000,
    operatingNetCents: 155000,
    savingsCents: 155000,
    savingsRateBps: 7381,
    quality: {
      scopedRows: 14,
      includedRows: 12,
      manuallyExcludedRows: 1,
      confirmedDuplicateRows: 1,
      suspectedDuplicateRows: 1,
      signMismatchRows: 0,
    },
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
  accounts: [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Cuenta principal", lifecycle: "active" },
  ],
  categories: [
    {
      id: CATEGORY_FOOD,
      name: "Alimentación",
      currentExpenseCents: 35000,
      previousExpenseCents: 30000,
      currentRows: 7,
      previousRows: 6,
    },
    {
      id: CATEGORY_TRANSPORT,
      name: "Transporte",
      currentExpenseCents: 20000,
      previousExpenseCents: 30000,
      currentRows: 5,
      previousRows: 6,
    },
  ],
  merchants: [
    {
      id: MERCHANT_MARKET,
      name: "Mercado Central",
      currentExpenseCents: 35000,
      previousExpenseCents: 32000,
      currentRows: 7,
      previousRows: 7,
      currentAverageCents: 5000,
      habitualAverageCents: 4500,
      historyRows: 12,
    },
    {
      id: MERCHANT_FUEL,
      name: "Gasolinera",
      currentExpenseCents: 20000,
      previousExpenseCents: 28000,
      currentRows: 5,
      previousRows: 5,
      currentAverageCents: 4000,
      habitualAverageCents: 5200,
      historyRows: 10,
    },
  ],
  concentration: { top3CategoryBps: 10000, top3MerchantBps: 10000 },
  anomalies: [
    {
      transactionId: "55555555-5555-4555-8555-555555555555",
      bankDate: "2026-09-12",
      amountCents: 15000,
      merchantId: MERCHANT_MARKET,
      merchantName: "Mercado Central",
      categoryId: CATEGORY_FOOD,
      categoryName: "Alimentación",
      conceptNormalized: "COMPRA EXTRAORDINARIA",
      habitualCents: 9000,
      historyRows: 8,
      variationBps: 6667,
    },
  ],
  fixedVariable: {
    available: true,
    reliableRecurrences: 3,
    fixedExpenseCents: 25000,
    variableExpenseCents: 30000,
  },
  budget: {
    month: "2026-09",
    total: {
      effectiveAmountCents: 100000,
      actualExpenseCents: 55000,
      remainingCents: 45000,
      progressBps: 5500,
      status: "on_track",
    },
    overCategories: [],
  },
  forecast: {
    period: { dateFrom: "2026-09-15", dateTo: "2026-09-30", accountId: null },
    summary: {
      plannedItems: 2,
      projectedNetCents: -15000,
      projectedIncomeCents: 0,
      projectedExpenseCents: 15000,
      projectedClosingBalanceCents: 85000,
      openingBalanceCents: 100000,
    },
  },
};

function mockSnapshot(): AnalysisSnapshot {
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
    gateway: GATEWAY,
  });
}

async function mockAnalysisApi(page: Parameters<typeof test>[0] extends never ? never : any, snapshot: AnalysisSnapshot) {
  await page.route(/\/api\/analysis(?:\?.*)?$/, async (route: any) => {
    const url = new URL(route.request().url());
    expect(url.pathname).toBe("/api/analysis");
    expect(url.searchParams.get("month")).toBe("2026-09");
    expect(url.searchParams.get("range")).toBe("1m");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
}

async function loadMockAnalysis(page: any, snapshot: AnalysisSnapshot) {
  await mockAnalysisApi(page, snapshot);
  await page.goto("/analysis");
  await page.getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: "1 mes" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
}

test("E2 · el motor v2 reconcilia al céntimo, excluye el mes parcial de medias y crea drill-down", () => {
  const snapshot = mockSnapshot();

  expect(snapshot.contractVersion).toBe(2);
  expect(snapshot.quality.reconciled).toBe(true);
  expect(snapshot.quality.categoryExpenseCents).toBe(55000);
  expect(snapshot.averages.last3Months?.expenseCents).toBe(59667);
  expect(snapshot.averages.last6Months?.expenseCents).toBe(60833);
  expect(snapshot.trends.expense.direction).toBe("down");
  expect(snapshot.trends.expense.sampleMonths).toBe(6);
  expect(snapshot.fixedVariable.fixedShareBps).toBe(4545);
  expect(snapshot.categoryDrivers[0].href).toContain(`categoryId=${CATEGORY_FOOD}`);
  expect(snapshot.merchantDrivers[0].href).toContain(`merchantId=${MERCHANT_MARKET}`);
  expect(snapshot.anomalies[0].href).toContain(`merchantId=${MERCHANT_MARKET}`);
  expect(snapshot.principles.generativeAi).toBe(false);
});

test("E2 · el motor v2 falla cerrado si los drivers no reconcilian con el motor financiero", () => {
  expect(() => buildAnalysisSnapshot({
    range: "1m",
    month: "2026-09",
    accountId: null,
    dateFrom: "2026-09-01",
    dateTo: "2026-09-15",
    previousDateFrom: "2026-08-01",
    previousDateTo: "2026-08-15",
    partial: true,
    partialMonthStart: "2026-09-01",
    gateway: {
      ...GATEWAY,
      current: { ...GATEWAY.current, expenseCents: 56000 },
    },
  })).toThrow("analysis_reconciliation_failed");
});

test("E2 · los rangos completos comparan ventanas equivalentes y rechazan meses futuros", () => {
  expect(resolveAnalysisSelection({ month: "2026-08", range: "3m" })).toMatchObject({
    range: "3m",
    month: "2026-08",
    dateFrom: "2026-06-01",
    dateTo: "2026-08-31",
    previousDateFrom: "2026-03-01",
    previousDateTo: "2026-05-31",
    partial: false,
  });
  expect(() => resolveAnalysisSelection({ month: "2099-01", range: "1m" })).toThrow("invalid_analysis_future_month");
});

test("E2 · Análisis v2 representa decisiones, gráficas y drill-down sin recalcular en React", async ({ page }, testInfo) => {
  test.skip(Boolean(process.env.VERCEL_PREVIEW_URL), "el Preview protegido valida la frontera real de workspace en otra prueba");
  const snapshot = mockSnapshot();

  await loadMockAnalysis(page, snapshot);

  await expect(page.getByRole("heading", { name: "Cómo está cambiando tu dinero" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tu gasto ha disminuido 50,00/ })).toBeVisible();
  await expect(page.getByLabel("Indicadores principales del periodo")).toContainText(/2\.100,00/);
  await expect(page.getByLabel("Indicadores principales del periodo")).toContainText(/550,00/);
  await expect(page.getByLabel("Lectura rápida")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comercios principales" })).toBeVisible();
  await expect(page.getByText(/\+3,8 pp vs\. periodo anterior/)).toBeVisible();
  await expect(page.getByText(/Totales reconciliados al céntimo/)).toBeVisible();
  const composition = page.locator('section[aria-labelledby="distribution-heading"]');
  await expect(composition.getByRole("link", { name: /Alimentación/ })).toHaveAttribute("href", new RegExp(`categoryId=${CATEGORY_FOOD}`));

  if (testInfo.project.name === "chromium-mobile") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const applyBox = await page.getByRole("button", { name: "Aplicar" }).boundingBox();
    expect(applyBox).not.toBeNull();
    expect(applyBox!.height).toBeGreaterThanOrEqual(44);
    const monthButton = page.getByRole("button", { name: /^Neto septiembre de 2026:/i }).last();
    await expect(monthButton).toHaveAttribute("aria-label", /periodo parcial/i);
    const monthBox = await monthButton.boundingBox();
    expect(monthBox).not.toBeNull();
    expect(monthBox!.height).toBeGreaterThanOrEqual(44);
  }
});

test("E2 · Análisis mantiene la composición responsive en 360, 430, 768, 1024, 1280 y 1440 px", async ({ page }, testInfo) => {
  test.skip(Boolean(process.env.VERCEL_PREVIEW_URL), "el Preview protegido valida la frontera real de workspace en otra prueba");
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz de anchos se ejecuta una vez sobre Chromium");
  const snapshot = mockSnapshot();

  await loadMockAnalysis(page, snapshot);

  for (const width of [360, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Indicadores principales del periodo")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow horizontal a ${width}px`).toBeLessThanOrEqual(1);
    const applyBox = await page.getByRole("button", { name: "Aplicar" }).boundingBox();
    expect(applyBox, `botón Aplicar a ${width}px`).not.toBeNull();
    expect(applyBox!.height, `alto táctil de Aplicar a ${width}px`).toBeGreaterThanOrEqual(44);
  }
});

test("E2 · Preview protegido conserva contrato v2 y falla cerrado sin workspace autenticado", async ({ request }) => {
  test.skip(!process.env.VERCEL_PREVIEW_URL, "solo se ejecuta contra Preview protegido");

  const response = await request.get("/api/analysis?month=2026-08&range=1m");
  expect(response.status()).toBe(403);
  expect(response.headers()["x-analysis-contract"]).toBe("2");

  await expect(response.json()).resolves.toMatchObject({
    code: "workspace_context_required",
  });
});
