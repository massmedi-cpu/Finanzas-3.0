import { expect, test } from "@playwright/test";
import {
  dateHasConfirmedCoverage,
  periodComparisonIsReliable,
  resolvePeriodCoverage,
} from "../../src/application/data-coverage";
import {
  buildAnalysisSnapshot,
  type AnalysisGatewaySnapshot,
  type AnalysisSnapshot,
} from "../../src/application/analysis/analysis-engine";
import { resolveAnalysisSelection } from "../../src/application/analysis/analysis-loader";
import { resolveBudgetSourcePresentation } from "../../src/application/analysis/analysis-presentation";
import { runAnalysisSnapshotQuery } from "../../supabase/functions/financial-app-db-gateway/analysis-query";

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
      automaticAmountCents: 100000,
      manualAmountCents: null,
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

async function mockAnalysisApi(
  page: Parameters<typeof test>[0] extends never ? never : any,
  snapshot: AnalysisSnapshot,
  latestMovementDate = snapshot.selection.dateTo,
  earliestMovementDate: string | null = "2025-01-01",
) {
  let selectedRequestSeen = false;
  await page.route("**/api/analysis/source-freshness", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, latestMovementDate, earliestMovementDate, sync: null }),
    });
  });
  await page.route(/\/api\/analysis(?:\?.*)?$/, async (route: any) => {
    const url = new URL(route.request().url());
    expect(url.pathname).toBe("/api/analysis");
    if (url.searchParams.get("month") === "2026-09") {
      expect(url.searchParams.get("range")).toBe("1m");
      selectedRequestSeen = true;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
  return () => selectedRequestSeen;
}

async function loadMockAnalysis(page: any, snapshot: AnalysisSnapshot, latestMovementDate = snapshot.selection.dateTo, earliestMovementDate: string | null = "2025-01-01") {
  const selectedRequestSeen = await mockAnalysisApi(page, snapshot, latestMovementDate, earliestMovementDate);
  await page.goto("/analysis");
  await page.getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: "1 mes" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(selectedRequestSeen).toBe(true);
  await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
}

test("QA Work · Continuar desde Análisis usa el periodo realmente aplicado", async ({ page }) => {
  const snapshot = mockSnapshot();
  const selectedRequestSeen = await mockAnalysisApi(page, snapshot);

  await page.goto("/analysis?month=2026-08&range=1m");
  await page.getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: "1 mes" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(selectedRequestSeen).toBe(true);

  const navigation = page.getByRole("navigation", { name: "Continuar desde Análisis" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: /Cash Flow/i })).toHaveAttribute("href", "/cash-flow?month=2026-09");
  await expect(navigation.getByRole("link", { name: /Presupuestos/i })).toHaveAttribute("href", "/budgets?month=2026-09");
  await expect(navigation.getByRole("link", { name: /Movimientos/i })).toHaveAttribute(
    "href",
    "/transactions?dateFrom=2026-09-01&dateTo=2026-09-15",
  );
});

test("AUD-E2E-DAT-001 · Análisis no convierte ausencia de cobertura en mejora", async ({ page }) => {
  test.skip(Boolean(process.env.VERCEL_PREVIEW_URL), "el Preview protegido valida la frontera real de workspace en otra prueba");
  const snapshot = mockSnapshot();

  await loadMockAnalysis(page, snapshot, "2026-08-31");

  const kpis = page.getByLabel("Indicadores principales del periodo");
  await expect(kpis.getByText("Comparación incompleta", { exact: true })).toHaveCount(4);
  await expect(kpis).not.toContainText("−100");
  await expect(kpis).not.toContainText("-100");
  await expect(page.getByRole("heading", { name: /Sin movimientos bancarios confirmados para este periodo: no podemos interpretar una variación/i })).toBeVisible();
  const changeSection = page.locator('section[aria-labelledby="change-heading"]');
  await expect(changeSection).toContainText("Sin cobertura bancaria confirmada");
  await expect(changeSection.getByRole("list", { name: /categoría/i })).toHaveCount(0);
  await expect(changeSection).not.toContainText("Más gasto");
  await expect(changeSection).not.toContainText("Menos gasto");
  await expect(page.getByLabel("Lectura rápida")).toContainText("Sin cobertura");
  await expect(page.getByLabel("Lectura rápida")).not.toContainText("Mayor cambio");
  await expect(page.locator('section[aria-labelledby="axioma53-accumulated-heading"]')).toContainText("No hay cobertura bancaria confirmada");
});

test("REC-ANA-001 · un mes con cobertura parcial muestra gastos reales sin inventar variaciones", async ({ page }) => {
  const snapshot = mockSnapshot();
  // All 550,00 € of the financial-period fixture have observed dates. The
  // calendar after 05/09 is unavailable, not a confirmed sequence of zeroes.
  snapshot.dailySpend = [{ date: "2026-09-02", expenseCents: 55_000, rows: 12 }];
  await loadMockAnalysis(page, snapshot, "2026-09-05");

  const changeSection = page.locator('section[aria-labelledby="change-heading"]');
  await expect(changeSection).toContainText("Sin comparación fiable");
  await expect(changeSection).toContainText("Importes observados del periodo");
  const observed = changeSection.getByRole("list", { name: "Gastos observados por categoría, periodo incompleto" });
  await expect(observed.getByRole("listitem")).toHaveCount(2);
  await expect(observed.getByRole("listitem", { name: /Alimentación: gasto observado 350,00/ })).toBeVisible();
  await expect(observed.getByRole("link", { name: "Ver movimientos" }).first()).toHaveAttribute("href", new RegExp(`categoryId=${CATEGORY_FOOD}`));
  await expect(changeSection).not.toContainText("Más gasto");
  await expect(changeSection).not.toContainText("Menos gasto");
  await expect(changeSection.getByRole("button", { name: "Variación" })).toHaveCount(0);
  await expect(page.getByLabel("Lectura rápida")).toContainText("Gasto observado");
  await expect(page.getByLabel("Lectura rápida")).not.toContainText("Mayor cambio");
  const accumulation = page.locator('section[aria-labelledby="axioma53-accumulated-heading"]');
  await expect(accumulation).toContainText("Datos observados hasta el 05/09/2026");
  await accumulation.getByText("Ver acumulado por día").click();
  await expect(accumulation.getByRole("table").getByRole("row")).toHaveCount(6);
  await expect(accumulation.getByRole("table")).not.toContainText("06/09/2026");
});

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

test("E2 · el presupuesto conserva y presenta su procedencia sin recalcular", () => {
  const total = GATEWAY.budget?.total;
  expect(total).not.toBeNull();
  expect(total).toBeDefined();
  if (!total) throw new Error("budget_fixture_missing");

  expect(resolveBudgetSourcePresentation(total)).toEqual({
    kind: "automatic",
    label: "Referencia automática · media de 3 meses",
  });
  expect(resolveBudgetSourcePresentation({
    ...total,
    manualAmountCents: 120000,
    effectiveAmountCents: 120000,
  })).toEqual({ kind: "manual", label: "Límite manual" });

  const { automaticAmountCents: _automatic, manualAmountCents: _manual, ...legacyTotal } = total;
  expect(resolveBudgetSourcePresentation(legacyTotal)).toEqual({ kind: "unknown", label: null });

  const snapshot = mockSnapshot();
  expect(snapshot.budget?.total).toMatchObject({
    automaticAmountCents: 100000,
    manualAmountCents: null,
    effectiveAmountCents: 100000,
  });
});

test("E2 · la consulta del gateway expone la procedencia presupuestaria ya calculada", () => {
  const sqlText = runAnalysisSnapshotQuery(
    (strings: TemplateStringsArray) => strings.join("?"),
    {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-15",
      previousDateFrom: "2026-08-01",
      previousDateTo: "2026-08-15",
      historyDateFrom: "2025-10-01",
      accountId: null,
      budgetMonth: "2026-09",
    },
  );

  expect(sqlText).toContain("'automaticAmountCents', b.automatic_cents");
  expect(sqlText).toContain("'manualAmountCents', b.manual_amount_cents");
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
  const budget = page.locator('section[aria-labelledby="budget-heading"]');
  await expect(budget).toContainText("Referencia automática · media de 3 meses");
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

test("E2 · ingresos parciales no representativos explican por qué la comparación queda pendiente", async ({ page }) => {
  test.skip(Boolean(process.env.VERCEL_PREVIEW_URL), "el Preview protegido valida la frontera real de workspace en otra prueba");
  const snapshot = mockSnapshot();
  snapshot.current = { ...snapshot.current, incomeCents: 38 };
  snapshot.comparison = { ...snapshot.comparison, incomeChangeBps: null };

  await loadMockAnalysis(page, snapshot);

  const kpis = page.getByLabel("Indicadores principales del periodo");
  await expect(kpis).toContainText("0,38");
  await expect(kpis).toContainText("Comparación pendiente · ingresos aún no representativos");
  await expect(kpis).not.toContainText("— vs. periodo anterior");
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

test("AUD-E2E-NAV-001 · avanzado refleja los 3 meses aplicados sin recarga", async ({ page }) => {
  const base = mockSnapshot();
  const selected: AnalysisSnapshot = {
    ...base,
    selection: { ...base.selection, month: "2026-09", range: "3m", dateFrom: "2026-07-01", dateTo: "2026-09-15" },
  };
  await page.route(/\/api\/analysis(?:\?.*)?$/, (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(selected),
  }));
  await page.route("**/api/analysis/source-freshness", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ available: true, latestMovementDate: "2026-09-15", sync: null }),
  }));
  await page.goto("/analysis?month=2026-08&range=1m");
  await page.getByRole("button", { name: "3 meses" }).first().click();
  await page.getByRole("button", { name: "Aplicar", exact: true }).first().click();
  await expect(page).toHaveURL(/range=3m/);
  await page.getByRole("button", { name: "Mostrar filtros avanzados" }).click();
  const advanced = page.locator("section[aria-labelledby=analysis-period-heading]");
  await expect(advanced.getByRole("button", { name: "3 meses" })).toHaveAttribute("aria-pressed", "true");
  await expect(advanced.getByLabel("Mes para análisis avanzado")).toHaveValue("2026-09");
});


test("REC-ANA-002 · evolución mensual no representa un mes sin cobertura como cero", async ({ page }) => {
  const snapshot = mockSnapshot();
  snapshot.history = [
    { monthStart: "2026-07-01", rows: 1, incomeCents: 10_000, expenseCents: 2_000, operatingNetCents: 8_000, savingsCents: 8_000, savingsRateBps: 8_000 },
    { monthStart: "2026-08-01", rows: 3, incomeCents: 20_000, expenseCents: 15_000, operatingNetCents: 5_000, savingsCents: 5_000, savingsRateBps: 2_500 },
    { monthStart: "2026-09-01", rows: 0, incomeCents: 0, expenseCents: 0, operatingNetCents: 0, savingsCents: 0, savingsRateBps: null },
  ];
  await loadMockAnalysis(page, snapshot, "2026-08-31");

  const chart = page.getByRole("region", { name: "Comparativa financiera visual" });
  await expect(chart).toBeVisible();
  await expect(chart.locator('button[data-month-coverage="covered"]')).toHaveCount(2);
  const missing = chart.locator('button[data-month-coverage="none"]');
  await expect(missing).toHaveCount(1);
  await expect(missing).toContainText("Sin dato");
  const data = chart.getByRole("table", { name: "Datos de la comparativa financiera" });
  await expect(data.getByRole("row", { name: /Ingresos/ }).getByRole("cell").last()).toHaveText("Sin dato");
  await expect(data.getByRole("row", { name: /Gastos/ }).getByRole("cell").last()).toHaveText("Sin dato");
  await expect(data.getByRole("row", { name: /Neto/ }).getByRole("cell").last()).toHaveText("Sin dato");
  await missing.click();
  const readout = chart.getByRole("tooltip");
  await expect(readout).toContainText("Sin datos bancarios confirmados para este mes");
  await expect(readout).not.toContainText("equilibrio");
  await expect(readout.getByRole("link", { name: /Ver movimientos/ })).toHaveCount(0);
});

test("REC-ANA-003 · el acumulado conserva el máximo visual anterior a una devolución", async ({ page }) => {
  const snapshot = mockSnapshot();
  snapshot.dailySpend = [
    { date: "2026-09-01", expenseCents: 10_000, rows: 1 },
    { date: "2026-09-02", expenseCents: -9_000, rows: 1 },
  ];
  await loadMockAnalysis(page, snapshot, "2026-09-15");

  const accumulation = page.locator('section[aria-labelledby="axioma53-accumulated-heading"]');
  await expect(accumulation.locator("strong").first()).toHaveText(/10,00\s*€/);
  await expect(accumulation).toContainText("ajustes o devoluciones");
  await expect(accumulation.getByRole("img", { name: /Gasto acumulado: 10,00/ })).toBeVisible();
  await expect(accumulation.locator("svg")).toContainText(/100,00/);
  const linePath = await accumulation.locator("path").last().getAttribute("d");
  const pointsY = [...(linePath ?? "").matchAll(/[ML]\s+[\d.]+\s+(-?[\d.]+)/g)].map((match) => Number(match[1]));
  expect(pointsY.length).toBe(15);
  expect(pointsY.every((y) => y >= 22 && y <= 204)).toBe(true);
});

test("REC-ANA-004 · cero neto por devolución no se muestra como un céntimo", async ({ page }) => {
  const snapshot = mockSnapshot();
  snapshot.dailySpend = [
    { date: "2026-09-01", expenseCents: 10_000, rows: 1 },
    { date: "2026-09-02", expenseCents: -10_000, rows: 1 },
  ];
  await loadMockAnalysis(page, snapshot, "2026-09-15");

  const accumulation = page.locator('section[aria-labelledby="axioma53-accumulated-heading"]');
  await expect(accumulation.locator("strong").first()).toHaveText(/0,00\s*€/);
  await expect(accumulation.getByRole("img", { name: /Gasto acumulado: 0,00/ })).toBeVisible();
  await expect(accumulation.locator("strong").first()).not.toContainText("0,01");
  await accumulation.getByText("Ver acumulado por día").click();
  await expect(accumulation.getByRole("table")).toContainText(/100,00/);
  await expect(accumulation.getByRole("table").getByRole("row").last()).toContainText(/0,00/);
});

test("REC-ANA-005 · Ver todos los comercios muestra el resultado completo más allá de quince", async ({ page }) => {
  const snapshot = mockSnapshot();
  const template = snapshot.merchantDrivers[0];
  expect(template).toBeDefined();
  snapshot.merchantDrivers = Array.from({ length: 18 }, (_, index) => ({
    ...template,
    id: `merchant-${index + 1}`,
    name: `Comercio de prueba ${index + 1}`,
    href: `/transactions?merchantId=merchant-${index + 1}`,
  }));
  await loadMockAnalysis(page, snapshot);

  const ranking = page.getByRole("heading", { name: "Comercios", exact: true }).locator("..").locator("..");
  await expect(ranking.getByRole("listitem")).toHaveCount(5);
  const showAll = ranking.getByRole("button", { name: "Ver todos" });
  await expect(showAll).toHaveAttribute("aria-expanded", "false");
  await showAll.click();
  await expect(ranking.getByRole("listitem")).toHaveCount(18);
  await expect(ranking.getByRole("link", { name: "Ver movimientos de Comercio de prueba 18" })).toHaveAttribute(
    "href",
    "/transactions?merchantId=merchant-18",
  );
  await expect(ranking.getByRole("button", { name: "Ver menos" })).toHaveAttribute("aria-expanded", "true");
  await ranking.getByRole("button", { name: "Ver menos" }).click();
  await expect(ranking.getByRole("listitem")).toHaveCount(5);
});

test("REC-ANA-006 · el tope de 30 comercios del servidor no se presenta como ranking completo", async ({ page }) => {
  const snapshot = mockSnapshot();
  const template = snapshot.merchantDrivers[0];
  snapshot.merchantDrivers = Array.from({ length: 30 }, (_, index) => ({
    ...template,
    id: `merchant-limited-${index + 1}`,
    name: `Comercio disponible ${index + 1}`,
    href: `/transactions?merchantId=merchant-limited-${index + 1}`,
  }));
  await loadMockAnalysis(page, snapshot);
  const ranking = page.getByRole("heading", { name: "Comercios", exact: true }).locator("..").locator("..");
  await expect(ranking).toContainText("como máximo los 30 comercios");
  await expect(ranking).toContainText("Puede haber más fuera de este ranking");
  await expect(ranking.getByRole("button", { name: "Ver todos los disponibles" })).toBeVisible();
  await expect(ranking.getByRole("link", { name: "Buscar otros en Movimientos" })).toHaveAttribute(
    "href", "/transactions?dateFrom=2026-09-01&dateTo=2026-09-15",
  );
});

test("REC-ANA-007 · cifras y fechas del acumulado legibles en 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const snapshot = mockSnapshot();
  snapshot.dailySpend = [
    { date: "2026-09-01", expenseCents: 123_456_789, rows: 1 },
    { date: "2026-09-02", expenseCents: -23_456_789, rows: 1 },
  ];
  await loadMockAnalysis(page, snapshot, "2026-09-15");
  const region = page.getByRole("region", { name: "Gráfica de gasto acumulado" });
  const visual = await region.locator("svg").evaluate((svg) => {
    const ticks = [...svg.querySelectorAll("g text")];
    const viewBox = (svg as SVGSVGElement).viewBox.baseVal;
    const scale = svg.getBoundingClientRect().width / viewBox.width;
    return {
      minRenderedLabelPx: Math.min(...ticks.map((node) => parseFloat(getComputedStyle(node).fontSize) * scale)),
      allTicksVisible: ticks.every((node) => {
        const box = (node as SVGGraphicsElement).getBBox();
        return box.x >= -0.5 && box.x + box.width <= viewBox.width + 0.5;
      }),
    };
  });
  expect(visual.minRenderedLabelPx).toBeGreaterThanOrEqual(14);
  expect(visual.allTicksVisible).toBe(true);
  await expect(region).toContainText("1.234.567,89");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("REC-COV-003 · Análisis omite los días anteriores al primer dato bancario", async ({ page }) => {
  const snapshot = mockSnapshot();
  snapshot.dailySpend = [{ date: "2026-09-04", expenseCents: 55_000, rows: 12 }];
  await loadMockAnalysis(page, snapshot, "2026-09-15", "2026-09-04");

  const accumulated = page.locator('section[aria-labelledby="axioma53-accumulated-heading"]');
  await expect(accumulated).toContainText("Datos registrados desde el 04/09/2026");
  await expect(accumulated).toContainText("Los días anteriores no se representan como ceros");
  const disclosure = accumulated.getByText("Ver acumulado por día", { exact: true });
  await disclosure.click();
  const dates = accumulated.getByRole("table").locator("tbody tr td:first-child");
  await expect(dates.first()).toHaveText("04/09/2026");
  await expect(dates).toHaveCount(12);
  await expect(dates.first()).not.toHaveText("01/09/2026");
  const comparisons = page.getByLabel("Indicadores principales del periodo");
  await expect(comparisons.getByText("Comparación incompleta", { exact: true })).toHaveCount(4);
});

test("REC-COV-006 · el extremo bancario se solicita para la cuenta realmente seleccionada", async ({ page }) => {
  const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const snapshot = mockSnapshot();
  snapshot.selection.accountId = accountId;
  const scopes: Array<string | null> = [];
  await page.route(/\/api\/analysis\/source-freshness(?:\?.*)?$/, async (route) => {
    const value = new URL(route.request().url()).searchParams.get("accountId");
    scopes.push(value);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        available: true, earliestMovementDate: "2026-09-04",
        latestMovementDate: "2026-09-15", sync: null,
      }),
    });
  });
  await page.route(/\/api\/analysis(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
  await page.goto(`/analysis?month=2026-09&range=1m&accountId=${accountId}`);
  await expect.poll(() => scopes.includes(accountId)).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Análisis" })).toBeVisible();
});


test("REC-COV-007 · el gateway anterior no certifica meses sin inicio de histórico", () => {
  const legacy = resolvePeriodCoverage({
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    earliestMovementDate: null,
    latestMovementDate: "2026-10-10",
  });
  expect(legacy.state).toBe("partial");
  expect(legacy.fromDate).toBeUndefined();
  expect(periodComparisonIsReliable(legacy)).toBe(false);
  expect(dateHasConfirmedCoverage("2026-09-12", legacy)).toBe(false);

  const knownBounds = resolvePeriodCoverage({
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    earliestMovementDate: "2026-08-01",
    latestMovementDate: "2026-10-10",
  });
  expect(knownBounds.state).toBe("covered");
  expect(dateHasConfirmedCoverage("2026-09-12", knownBounds)).toBe(true);
});

test("REC-COV-008 · el acumulado legacy empieza donde existe gasto observado", async ({ page }) => {
  const snapshot = mockSnapshot();
  snapshot.dailySpend = [{ date: "2026-09-04", expenseCents: 55_000, rows: 12 }];
  await loadMockAnalysis(page, snapshot, "2026-09-15", null);

  const accumulated = page.locator('section[aria-labelledby="axioma53-accumulated-heading"]');
  await accumulated.getByText("Ver acumulado por día", { exact: true }).click();
  const dates = accumulated.getByRole("table").getByRole("row").locator("td:first-child");
  await expect(dates.first()).toHaveText("04/09/2026");
  await expect(dates.first()).not.toHaveText("01/09/2026");
  await expect(dates).toHaveCount(12);
  const comparisons = page.getByLabel("Indicadores principales del periodo");
  await expect(comparisons.getByText("Comparación incompleta", { exact: true })).toHaveCount(4);
});


test("REC-COV-009 · cambiar de cuenta invalida inmediatamente la cobertura anterior", async ({ page }) => {
  const overall = mockSnapshot();
  const selectedAccountId = overall.accounts[0].id;
  const individual: AnalysisSnapshot = {
    ...overall,
    selection: { ...overall.selection, accountId: selectedAccountId },
  };
  let releaseScopedRequest: (() => void) | undefined;
  const holdScopedRequest = new Promise<void>((resolve) => {
    releaseScopedRequest = resolve;
  });
  let scopedRequestSeen = false;

  await page.route(/\/api\/analysis\/source-freshness(?:\?.*)?$/, async (route) => {
    const account = new URL(route.request().url()).searchParams.get("accountId");
    if (account === selectedAccountId) {
      scopedRequestSeen = true;
      await holdScopedRequest;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        available: true,
        earliestMovementDate: account ? "2026-09-04" : "2026-08-01",
        latestMovementDate: "2026-09-15",
        sync: null,
      }),
    });
  });
  await page.route(/\/api\/analysis(?:\?.*)?$/, async (route) => {
    const account = new URL(route.request().url()).searchParams.get("accountId");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(account === selectedAccountId ? individual : overall),
    });
  });

  try {
    await page.goto("/analysis?month=2026-09&range=1m");
    const comparisons = page.getByLabel("Indicadores principales del periodo");
    await expect(comparisons.getByText("Comparación incompleta", { exact: true })).toHaveCount(0);
    await page.getByRole("form", { name: "Filtros del análisis" }).locator("select").selectOption(selectedAccountId);
    await page.getByRole("button", { name: "Aplicar cambios" }).first().click();
    await expect.poll(() => scopedRequestSeen).toBe(true);
    // While the new scoped request is pending, the old account's complete
    // bounds cannot certify the selected account's comparisons.
    await expect(comparisons.getByText("Comparación incompleta", { exact: true })).toHaveCount(4);
  } finally {
    releaseScopedRequest?.();
  }
});


test("REC-COV-010 · volver a todas las cuentas no hereda la cuenta de la URL original", async ({ page }) => {
  const specific = mockSnapshot();
  const accountId = specific.accounts[0].id;
  specific.selection.accountId = accountId;
  const all = mockSnapshot();
  const freshnessScopes: Array<string | null> = [];

  await page.route(/\/api\/analysis\/source-freshness(?:\?.*)?$/, async (route) => {
    const scope = new URL(route.request().url()).searchParams.get("accountId");
    freshnessScopes.push(scope);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        available: true,
        earliestMovementDate: "2026-08-01",
        latestMovementDate: "2026-09-15",
        sync: null,
      }),
    });
  });
  await page.route(/\/api\/analysis(?:\?.*)?$/, async (route) => {
    const scope = new URL(route.request().url()).searchParams.get("accountId");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(scope === accountId ? specific : all),
    });
  });

  await page.goto(`/analysis?month=2026-09&range=1m&accountId=${accountId}`);
  await expect.poll(() => freshnessScopes.includes(accountId)).toBe(true);
  await page.getByRole("form", { name: "Filtros del análisis" }).locator("select").selectOption("");
  const requestsBeforeSwitch = freshnessScopes.length;
  await page.getByRole("button", { name: "Aplicar cambios" }).first().click();
  await expect(page).toHaveURL(/\/analysis\?month=2026-09&range=1m(?!.*accountId)/);
  await expect.poll(() => freshnessScopes.slice(requestsBeforeSwitch).includes(null)).toBe(true);
});
