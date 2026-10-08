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
  accounts: [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Cuenta principal", lifecycle: "active" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Cuenta secundaria", lifecycle: "active" },
  ],
  categories: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Alimentación", currentExpenseCents: 35000, previousExpenseCents: 30000, currentRows: 7, previousRows: 6 },
    { id: "33333333-3333-4333-8333-333333333333", name: "Transporte", currentExpenseCents: 20000, previousExpenseCents: 29900, currentRows: 5, previousRows: 6 },
    { id: "55555555-5555-4555-8555-555555555553", name: "Solo anterior", currentExpenseCents: 0, previousExpenseCents: 100, currentRows: 0, previousRows: 1 },
  ],
  merchants: [
    { id: "22222222-2222-4222-8222-222222222222", name: "Mercado Central", currentExpenseCents: 35000, previousExpenseCents: 32000, currentRows: 7, previousRows: 7, currentAverageCents: 5000, habitualAverageCents: 4500, historyRows: 12 },
    { id: "44444444-4444-4444-8444-444444444444", name: "Gasolinera", currentExpenseCents: 20000, previousExpenseCents: 28000, currentRows: 5, previousRows: 5, currentAverageCents: 4000, habitualAverageCents: 5200, historyRows: 10 },
  ],
  dailySpend: [
    { date: "2026-09-01", expenseCents: 5000, rows: 2 },
    { date: "2026-09-03", expenseCents: 12000, rows: 2 },
    { date: "2026-09-05", expenseCents: 7000, rows: 1 },
    { date: "2026-09-08", expenseCents: 9000, rows: 2 },
    { date: "2026-09-11", expenseCents: 10000, rows: 2 },
    { date: "2026-09-15", expenseCents: 12000, rows: 3 },
  ],
  weekdaySpend: [
    { weekday: 1, expenseCents: 14000, rows: 3, averageCents: 4667 },
    { weekday: 2, expenseCents: 5000, rows: 1, averageCents: 5000 },
    { weekday: 3, expenseCents: 12000, rows: 2, averageCents: 6000 },
    { weekday: 4, expenseCents: 10000, rows: 2, averageCents: 5000 },
    { weekday: 5, expenseCents: 7000, rows: 2, averageCents: 3500 },
    { weekday: 6, expenseCents: 4000, rows: 1, averageCents: 4000 },
    { weekday: 7, expenseCents: 3000, rows: 1, averageCents: 3000 },
  ],
  amountBands: [
    { band: "lt10", expenseCents: 2500, rows: 4 },
    { band: "10to25", expenseCents: 6500, rows: 3 },
    { band: "25to50", expenseCents: 10000, rows: 2 },
    { band: "50to100", expenseCents: 16000, rows: 2 },
    { band: "100to250", expenseCents: 20000, rows: 1 },
  ],
  concepts: [
    { concept: "Compra supermercado", expenseCents: 24000, rows: 5, averageCents: 4800 },
    { concept: "Combustible", expenseCents: 16000, rows: 3, averageCents: 5333 },
    { concept: "Restauración", expenseCents: 9000, rows: 2, averageCents: 4500 },
  ],
  accountSpend: [
    { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", accountName: "Cuenta principal", expenseCents: 40000, rows: 8, averageCents: 5000 },
    { accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", accountName: "Cuenta secundaria", expenseCents: 15000, rows: 4, averageCents: 3750 },
  ],
  topTransactions: [
    {
      transactionId: "99999999-9999-4999-8999-999999999991",
      bankDate: "2026-09-15",
      amountCents: 12000,
      conceptNormalized: "Compra supermercado",
      merchantId: "22222222-2222-4222-8222-222222222222",
      merchantName: "Mercado Central",
      categoryId: "11111111-1111-4111-8111-111111111111",
      categoryName: "Alimentación",
      accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      accountName: "Cuenta principal",
    },
    {
      transactionId: "99999999-9999-4999-8999-999999999992",
      bankDate: "2026-09-11",
      amountCents: 10000,
      conceptNormalized: "Combustible",
      merchantId: "44444444-4444-4444-8444-444444444444",
      merchantName: "Gasolinera",
      categoryId: "33333333-3333-4333-8333-333333333333",
      categoryName: "Transporte",
      accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      accountName: "Cuenta secundaria",
    },
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
  test(`Premium Análisis v5 · ${width}px sin overflow y con jerarquía financiera completa`, async ({ page }, testInfo) => {
    await page.route("**/api/analysis**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) });
    });
    // Este escenario certifica la lectura con cobertura conocida; la cobertura
    // desconocida se valida por separado, sin inventar tendencias financieras.
    await page.route("**/api/analysis/source-freshness", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: true, latestMovementDate: "2026-09-15", sync: null }),
      });
    });

    await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
    await page.goto("/analysis", { waitUntil: "domcontentloaded" });
    await page.getByRole("form", { name: "Filtros del análisis" }).getByLabel("Mes de referencia").fill("2026-09");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).toHaveURL(/\/analysis\?month=2026-09&range=1m$/);

    await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Indicadores principales del periodo")).toBeVisible();
    await expect(page.getByLabel("Indicadores principales del periodo")).toContainText("Neto del periodo");
    await expect(page.getByLabel("Lectura rápida")).toBeVisible();
    await expect(page.getByLabel("Lectura rápida")).toContainText("Sin previsiones");
    await expect(page.getByRole("heading", { name: "Patrones que no se ven en un simple total" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Evolución diaria del gasto del periodo" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Gasto por día de la semana" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Distribución de movimientos por tramo de importe" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Relación entre frecuencia de compra e importe medio por comercio" })).toBeVisible();
    const weekday = page.getByRole("img", { name: "Gasto por día de la semana" });
    await expect(weekday).toHaveAttribute("aria-label", /lunes, 140,00\s*€/);
    for (const [name, maximum] of [
      ["Gráfica de gasto diario", 760],
      ["Gráfica de comercios", 620],
      ["Curva de concentración", 620],
    ] as const) {
      const chart = page.getByRole("region", { name });
      await expect.poll(() => chart.evaluate((element, maxWidth) => {
        const svg = element.querySelector("svg");
        return !!svg && Math.abs(svg.viewBox.baseVal.width - Math.min(maxWidth, element.clientWidth)) <= 1;
      }, maximum)).toBe(true);
      expect(await chart.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    if (width <= 430) {
      const firstDay = await weekday.locator(":scope > div").nth(0).boundingBox();
      const secondDay = await weekday.locator(":scope > div").nth(1).boundingBox();
      expect(firstDay).not.toBeNull();
      expect(secondDay).not.toBeNull();
      expect(secondDay!.y).toBeGreaterThan(firstDay!.y);
    }

    if (
      (testInfo.project.name === "chromium-desktop" && [360, 430, 768, 1440].includes(width))
      || (testInfo.project.name === "chromium-mobile" && width === 360)
    ) {
      for (const [name, chart] of [
        ["daily", "Evolución diaria del gasto del periodo"],
        ["weekday", "Gasto por día de la semana"],
        ["heatmap", "Mapa de calor diario del gasto"],
        ["merchants", "Relación entre frecuencia de compra e importe medio por comercio"],
        ["concentration", "Curva de concentración del gasto por comercio"],
      ]) {
        const card = page.getByRole("img", { name: chart }).locator("xpath=ancestor::div[contains(@class, 'chartCard')][1]");
        await card.scrollIntoViewIfNeeded();
        await card.evaluate((element) => {
          window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 110, behavior: "instant" });
        });
        await card.screenshot({ path: testInfo.outputPath(`analysis-patterns-${testInfo.project.name}-${width}-${name}.png`) });
      }
    }

    const dailyData = page.getByText("Ver datos diarios", { exact: true });
    await dailyData.click();
    await expect(dailyData.locator("..").getByRole("table")).toContainText(/120,00\s*€/);
    const merchantData = page.getByText("Ver datos de comercios", { exact: true });
    await merchantData.click();
    await expect(merchantData.locator("..").getByRole("table")).toContainText("Mercado Central");
    if (width <= 430) {
      const merchantTable = merchantData.locator("..").getByRole("region", { name: "Ver datos de comercios: desplazar tabla" });
      expect(await merchantTable.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      await expect(merchantData.locator("..").getByText("Desliza la tabla para ver todas las columnas.")).toBeVisible();
    }

    const scatter = page.getByRole("img", { name: "Relación entre frecuencia de compra e importe medio por comercio" });
    const xTicks = await scatter.locator('text[y="270"]').allTextContents();
    expect(xTicks.length).toBeGreaterThanOrEqual(2);
    expect(new Set(xTicks).size).toBe(xTicks.length);
    await expect(page.getByText("Qué descripciones concentran más gasto")).toBeVisible();
    await expect(page.getByText("Detalle procedente del movimiento original")).toBeVisible();
    await expect(page.getByLabel("Gasto por cuenta").getByText("Cuenta secundaria")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comercios principales" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cómo está cambiando tu dinero" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tu gasto (ha aumentado|ha disminuido|se mantiene)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dónde se concentra el gasto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gasto fijo y variable" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Movimientos que merecen la pena revisar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Presupuesto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Previsión" })).toBeVisible();
    await expect(page.getByText("Sin previsiones activas")).toBeVisible();
    await expect(page.getByText(/Detalle por categorías disponible en Presupuestos/i)).toBeVisible();

    const accessibleTrendTable = page.getByRole("table", { name: "Datos de la comparativa financiera" });
    await expect(accessibleTrendTable).toBeAttached();
    await expect(accessibleTrendTable).toContainText("Ingresos");
    await expect(accessibleTrendTable).toContainText("Gastos");
    expect(await accessibleTrendTable.evaluate((element) => {
      const container = element.parentElement;
      if (!container) return false;
      const style = window.getComputedStyle(container);
      return style.display !== "none"
        && style.position === "absolute"
        && style.overflow === "hidden"
        && style.whiteSpace === "nowrap"
        && style.clip !== "auto";
    })).toBe(true);

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

    await page.getByRole("button", { name: "3 meses" }).click();
    await expect(page.getByRole("button", { name: "Aplicar cambios" })).toBeVisible();
    await range.click();
    await expect(page.getByRole("button", { name: "Aplicar" })).toBeVisible();

    const trendViews = page.getByRole("group", { name: "Vista de la evolución financiera" });
    const trendAll = trendViews.getByRole("button", { name: "Conjunto", exact: true });
    const trendFlow = trendViews.getByRole("button", { name: "Ingresos y gastos", exact: true });
    const trendNet = trendViews.getByRole("button", { name: "Neto", exact: true });
    await expect(trendAll).toHaveAttribute("aria-pressed", "true");
    await trendFlow.click();
    await expect(trendFlow).toHaveAttribute("aria-pressed", "true");
    await trendNet.click();
    await expect(trendNet).toHaveAttribute("aria-pressed", "true");
    await trendAll.click();

    const compareMode = page.getByRole("button", { name: "Actual vs anterior", exact: true });
    await compareMode.click();
    await expect(compareMode).toHaveAttribute("aria-pressed", "true");

    const previousOnlyRow = page.getByRole("listitem", { name: /Solo anterior: gasto actual 0,00.*periodo comparable 1,00/ });
    await expect(previousOnlyRow).toBeVisible();
    const zeroCurrentBar = previousOnlyRow.locator('i[data-zero="true"]');
    await expect(zeroCurrentBar).toHaveCount(1);
    expect(await zeroCurrentBar.evaluate((element) => (element as HTMLElement).style.width)).toBe("0%");
    expect(await zeroCurrentBar.evaluate((element) => element.getBoundingClientRect().width)).toBe(0);

    await page.getByRole("button", { name: "Variación", exact: true }).click();

    const chartMonths = page.getByRole("button", { name: /Ingresos\b.*\bgastos\b/i });
    const chartMonth = chartMonths.last();
    await expect(chartMonth).toBeVisible();
    const chartMonthBox = await chartMonth.boundingBox();
    expect(chartMonthBox).not.toBeNull();
    expect(chartMonthBox!.height).toBeGreaterThanOrEqual(44);

    await chartMonth.focus();
    await expect(chartMonth).toHaveAttribute("aria-pressed", "true");
    const tooltip = page.getByRole("tooltip").filter({ hasText: /Ingresos/ });
    await expect(tooltip).toBeVisible();
    await expect(tooltip).not.toContainText("frente al mes anterior");

    const chartMonthCount = await chartMonths.count();
    if (chartMonthCount > 1) {
      await chartMonths.nth(chartMonthCount - 2).focus();
      await expect(tooltip).toContainText(/Neto (sin cambios|[+−].*) frente al mes anterior/);
    }

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


test("QA-02 · Análisis no convierte un periodo sin cobertura completa en tendencia favorable", async ({ page }) => {
  await page.route("**/api/analysis**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) });
  });
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, latestMovementDate: "2026-09-10", sync: null }),
    });
  });

  await page.goto("/analysis", { waitUntil: "domcontentloaded" });
  await page.getByRole("form", { name: "Filtros del análisis" }).getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: /Aplicar/ }).click();

  await expect(page.getByRole("heading", { name: /Datos hasta 10 sept 2026: no interpretamos el periodo posterior como mejora ni empeoramiento/ })).toBeVisible();
  const kpis = page.getByLabel("Indicadores principales del periodo");
  await expect(kpis).toContainText("Cobertura incompleta: no interpretamos la variación como tendencia");
  await expect(kpis).not.toContainText("Tasa de ahorro al alza");
  await expect(kpis).not.toContainText("Tasa de ahorro a la baja");
});

test("QA Work · el texto atenuado de Análisis mantiene contraste AA en tema oscuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.route("**/api/analysis**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) });
  });
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, latestMovementDate: "2026-09-15", sync: null }),
    });
  });

  await page.goto("/analysis", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const contrast = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const muted = root.getPropertyValue("--color-text-muted").trim();
    const surface = root.getPropertyValue("--color-surface-strong").trim();

    const rgb = (hex: string) => {
      const value = hex.replace("#", "");
      if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Unexpected color token: ${hex}`);
      return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
    };
    const luminance = (hex: string) => rgb(hex)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);

    const mutedLuminance = luminance(muted);
    const surfaceLuminance = luminance(surface);
    const lighter = Math.max(mutedLuminance, surfaceLuminance);
    const darker = Math.min(mutedLuminance, surfaceLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  });

  expect(contrast).toBeGreaterThanOrEqual(4.5);
});

test("QA-03 · Lectura rápida y Patrones usan superficies legibles en tema claro", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.route("**/api/analysis**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) });
  });
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, latestMovementDate: "2026-09-15", sync: null }),
    });
  });

  await page.goto("/analysis", { waitUntil: "domcontentloaded" });
  await page.getByRole("form", { name: "Filtros del análisis" }).getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: /Aplicar/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const quick = page.locator('[class*="quickReadIntro"]').first();
  const patterns = page.locator('div[class*="heading"]').filter({ hasText: "PATRONES DEL PERIODO" }).first();
  await expect(quick).toBeVisible();
  await expect(patterns).toBeVisible();

  for (const surface of [quick, patterns]) {
    const computed = await surface.evaluate((element) => {
      const style = getComputedStyle(element);
      const child = element.querySelector("strong, h2, span");
      return {
        backgroundImage: style.backgroundImage,
        color: child ? getComputedStyle(child).color : style.color,
      };
    });
    expect(computed.backgroundImage).not.toContain("rgba(14, 25, 48");
    expect(computed.backgroundImage).not.toContain("rgba(7, 14, 29");
    expect(computed.color).not.toBe("rgb(247, 249, 255)");
  }

  await quick.screenshot({ path: testInfo.outputPath("qa03-light-quick-read.png") });
  await patterns.screenshot({ path: testInfo.outputPath("qa03-light-patterns.png") });
});


test("QA-04 · acumulado y ritmo diario respetan el calendario y representan días sin gasto", async ({ page }) => {
  await page.route(/\/api\/analysis(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) });
  });
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, latestMovementDate: "2026-09-15", sync: null }),
    });
  });

  await page.goto("/analysis", { waitUntil: "domcontentloaded" });
  await page.getByRole("form", { name: "Filtros del análisis" }).getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: /Aplicar/ }).click();

  const accumulated = page.getByRole("region", { name: "Gráfica de gasto acumulado" });
  const accumulatedXs = await accumulated.locator("circle").evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("cx"))),
  );
  expect(accumulatedXs).toHaveLength(SNAPSHOT.dailySpend.length);
  expect(accumulatedXs[1] - accumulatedXs[0]).toBeCloseTo(accumulatedXs[2] - accumulatedXs[1], 4);
  expect(accumulatedXs.at(-1)! - accumulatedXs.at(-2)!).toBeGreaterThan((accumulatedXs[1] - accumulatedXs[0]) * 1.5);

  const daily = page.getByRole("region", { name: "Gráfica de gasto diario" });
  const dailyXs = await daily.locator("circle").evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("cx"))),
  );
  expect(dailyXs).toHaveLength(SNAPSHOT.dailySpend.length);
  expect(dailyXs.at(-1)! - dailyXs.at(-2)!).toBeGreaterThan((dailyXs[1] - dailyXs[0]) * 1.5);

  const dailyDetails = page.getByText("Ver datos diarios", { exact: true });
  await dailyDetails.click();
  await expect(dailyDetails.locator("..").getByRole("table").locator("tbody tr")).toHaveCount(15);
  const zeroDay = dailyDetails.locator("..").getByRole("table").getByRole("row", { name: /^2 sept / });
  await expect(zeroDay).toContainText("0,00");
  await expect(zeroDay.getByRole("cell").last()).toHaveText("0");
});

test("QA-06 · Análisis identifica la tasa histórica como agregada y no como media de porcentajes mensuales", async ({ page }) => {
  await page.route(/\/api\/analysis(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) });
  });
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, latestMovementDate: "2026-09-15", sync: null }),
    });
  });

  await page.goto("/analysis", { waitUntil: "domcontentloaded" });
  await page.getByRole("form", { name: "Filtros del análisis" }).getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: /Aplicar/ }).click();

  const rateKpi = page.getByLabel("Indicadores principales del periodo").locator("article").filter({ hasText: "Tasa de ahorro" });
  await expect(rateKpi).toContainText("Tasa agregada");
  await expect(rateKpi).toContainText(/Tasa de ahorro agregada (al alza|a la baja|estable)/);
  await expect(rateKpi).not.toContainText("Media mensual · 3 m");
});


test("QA-23 · Análisis no dibuja barras para ingresos o gastos exactamente a cero", async ({ page }) => {
  const zeroGateway = structuredClone(GATEWAY);
  zeroGateway.history.rows[4] = {
    ...zeroGateway.history.rows[4],
    incomeCents: 0,
    expenseCents: 0,
    operatingNetCents: 0,
    savingsCents: 0,
    savingsRateBps: null,
  };
  const zeroSnapshot = buildAnalysisSnapshot({
    range: "1m",
    month: "2026-09",
    accountId: null,
    dateFrom: "2026-09-01",
    dateTo: "2026-09-15",
    previousDateFrom: "2026-08-01",
    previousDateTo: "2026-08-15",
    partial: true,
    partialMonthStart: "2026-09-01",
    gateway: zeroGateway,
  });

  await page.route("**/api/analysis**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(zeroSnapshot) });
  });
  await page.goto("/analysis", { waitUntil: "domcontentloaded" });

  const chart = page.getByRole("img", { name: "Evolución mensual de ingresos, gastos y neto." });
  await expect(chart).toBeVisible();
  const zeroBars = chart.locator('rect[data-zero="true"]');
  await expect(zeroBars).toHaveCount(2);
  expect(await zeroBars.evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("height"))))).toEqual([0, 0]);
  await expect(chart.locator('rect[data-series="income"][data-zero="true"]')).toHaveCount(1);
  await expect(chart.locator('rect[data-series="expense"][data-zero="true"]')).toHaveCount(1);
});


test("AUD-E2E-DAT-001 · Análisis no rompe si se desconoce la fecha de cobertura bancaria", async ({ page }) => {
  await page.route(/\/api\/analysis(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) });
  });
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, latestMovementDate: null, sync: null }),
    });
  });

  await page.goto("/analysis", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("form", { name: "Filtros del análisis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Cobertura bancaria desconocida/ })).toBeVisible();
  await expect(page.getByText("Cobertura desconocida · comparación no disponible").first()).toBeVisible();
});
