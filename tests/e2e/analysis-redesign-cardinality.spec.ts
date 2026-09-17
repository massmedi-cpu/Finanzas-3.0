import { expect, test } from "@playwright/test";
import {
  buildAnalysisSnapshot,
  type AnalysisGatewaySnapshot,
} from "../../src/application/analysis/analysis-engine";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

function gatewayForCount(count: 1 | 2 | 5): AnalysisGatewaySnapshot {
  const dailySpend = Array.from({ length: count }, (_, index) => ({
    date: `2026-09-${String(2 + index * 2).padStart(2, "0")}`,
    expenseCents: 1000,
    rows: 1,
  }));
  const expenseCents = count * 1000;
  const merchantIds = Array.from({ length: count }, (_, index) =>
    `${String(index + 2).padStart(8, "0")}-2222-4222-8222-${String(index + 2).padStart(12, "0")}`,
  );

  return {
    current: {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-15",
      incomeCents: 100000,
      expenseCents,
      operatingNetCents: 100000 - expenseCents,
      savingsCents: 100000 - expenseCents,
      savingsRateBps: Math.round(((100000 - expenseCents) * 10000) / 100000),
      quality: {
        scopedRows: count,
        includedRows: count,
        manuallyExcludedRows: 0,
        confirmedDuplicateRows: 0,
      },
    },
    previous: {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-15",
      incomeCents: 100000,
      expenseCents,
      operatingNetCents: 100000 - expenseCents,
      savingsCents: 100000 - expenseCents,
      savingsRateBps: Math.round(((100000 - expenseCents) * 10000) / 100000),
    },
    history: {
      rows: Array.from({ length: 6 }, (_, index) => ({
        monthStart: `2026-${String(3 + index).padStart(2, "0")}-01`,
        rows: count,
        incomeCents: 100000,
        expenseCents,
        operatingNetCents: 100000 - expenseCents,
        savingsCents: 100000 - expenseCents,
        savingsRateBps: Math.round(((100000 - expenseCents) * 10000) / 100000),
      })),
    },
    accounts: [{ id: ACCOUNT_ID, name: "Cuenta principal", lifecycle: "active" }],
    categories: [{
      id: CATEGORY_ID,
      name: "Alimentación",
      currentExpenseCents: expenseCents,
      previousExpenseCents: expenseCents,
      currentRows: count,
      previousRows: count,
    }],
    merchants: merchantIds.map((id, index) => ({
      id,
      name: `Comercio ${index + 1}`,
      currentExpenseCents: 1000,
      previousExpenseCents: 1000,
      currentRows: 1,
      previousRows: 1,
      currentAverageCents: 1000,
      habitualAverageCents: 1000,
      historyRows: 6,
    })),
    dailySpend,
    weekdaySpend: dailySpend.map((_, index) => ({
      weekday: (index % 7) + 1,
      expenseCents: 1000,
      rows: 1,
      averageCents: 1000,
    })),
    amountBands: [{ band: "10to25", expenseCents, rows: count }],
    concepts: [{ concept: "Compra", expenseCents, rows: count, averageCents: 1000 }],
    accountSpend: [{
      accountId: ACCOUNT_ID,
      accountName: "Cuenta principal",
      expenseCents,
      rows: count,
      averageCents: 1000,
    }],
    topTransactions: dailySpend.map((row, index) => ({
      transactionId: `99999999-9999-4999-8999-${String(index + 1).padStart(12, "0")}`,
      bankDate: row.date,
      amountCents: row.expenseCents,
      conceptNormalized: "Compra",
      merchantId: merchantIds[index],
      merchantName: `Comercio ${index + 1}`,
      categoryId: CATEGORY_ID,
      categoryName: "Alimentación",
      accountId: ACCOUNT_ID,
      accountName: "Cuenta principal",
    })),
    concentration: { top3CategoryBps: 10000, top3MerchantBps: Math.min(10000, Math.round((Math.min(3, count) * 10000) / count)) },
    anomalies: [],
    fixedVariable: {
      available: count >= 2,
      reliableRecurrences: count >= 2 ? 1 : 0,
      fixedExpenseCents: count >= 2 ? 1000 : 0,
      variableExpenseCents: count >= 2 ? expenseCents - 1000 : expenseCents,
    },
    budget: null,
    forecast: null,
  };
}

function snapshotForCount(count: 1 | 2 | 5) {
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
    gateway: gatewayForCount(count),
  });
}

for (const count of [1, 2, 5] as const) {
  test(`Rediseño Análisis · ${count} dato${count === 1 ? "" : "s"} conserva gráficas válidas`, async ({ page }) => {
    const snapshot = snapshotForCount(count);
    await page.route("**/api/analysis**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/analysis", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Mes de referencia").fill("2026-09");
    await page.getByRole("button", { name: "Aplicar" }).click();

    const daily = page.getByRole("img", { name: "Evolución diaria del gasto del periodo" });
    await expect(daily).toBeVisible();
    expect(await daily.locator("circle").count()).toBe(count);

    await expect(page.getByRole("img", { name: "Gasto por día de la semana" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Distribución de movimientos por tramo de importe" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Relación entre frecuencia de compra e importe medio por comercio" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Curva de concentración del gasto por comercio" })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const box = await daily.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(300);
  });
}
