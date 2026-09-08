import { expect, test } from "@playwright/test";
import { buildAnalysisSnapshot } from "../../src/application/analysis/analysis-engine";

const MOCK_SNAPSHOT = {
  contractVersion: 1 as const,
  month: "2026-09",
  current: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    incomeCents: 210000,
    expenseCents: 55000,
    operatingNetCents: 155000,
    savingsCents: 155000,
    savingsRateBps: 7381,
  },
  previous: {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    incomeCents: 200000,
    expenseCents: 60000,
    operatingNetCents: 140000,
    savingsCents: 140000,
    savingsRateBps: 7000,
  },
  comparison: {
    incomeDeltaCents: 10000,
    incomeChangeBps: 500,
    expenseDeltaCents: -5000,
    expenseChangeBps: -833,
    netDeltaCents: 15000,
    netChangeBps: 1071,
  },
  categoryDrivers: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Alimentación", expenseCents: 35000, shareBps: 6364, rows: 8, href: "/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&kind=expense&categoryId=11111111-1111-4111-8111-111111111111" },
    { id: null, name: "Sin categoría", expenseCents: 20000, shareBps: 3636, rows: 4, href: "/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&kind=expense&categoryId=__uncategorized__" },
  ],
  merchantDrivers: [
    { id: "22222222-2222-4222-8222-222222222222", name: "Mercado Central", expenseCents: 35000, shareBps: 6364, rows: 8, href: "/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&kind=expense&merchantId=22222222-2222-4222-8222-222222222222" },
    { id: null, name: "Sin comercio", expenseCents: 20000, shareBps: 3636, rows: 4, href: null },
  ],
  quality: { expenseRows: 14, excludedRows: 1, confirmedDuplicateRows: 1, reconciled: true },
  principles: { bankSource: "read_only" as const, totals: "financial_period" as const, drivers: "effective_transaction_query" as const },
};

test("E2 · el motor de Análisis reconcilia drivers con el periodo financiero central", () => {
  const snapshot = buildAnalysisSnapshot({
    month: "2026-09",
    current: { ...MOCK_SNAPSHOT.current, expenseCents: 5500 },
    previous: MOCK_SNAPSHOT.previous,
    expenseRows: [
      { id: "a", bankDate: "2026-09-04", amountCents: -3000, category: { effectiveId: "11111111-1111-4111-8111-111111111111", effectiveName: "Alimentación" }, merchant: { effectiveId: "22222222-2222-4222-8222-222222222222", effectiveName: "Mercado Central" }, kind: { effective: "expense" }, duplicateState: "none", excludedFromAnalytics: false },
      { id: "b", bankDate: "2026-09-03", amountCents: -2500, category: { effectiveId: null, effectiveName: null }, merchant: { effectiveId: null, effectiveName: null }, kind: { effective: "expense" }, duplicateState: "suspected", excludedFromAnalytics: false },
      { id: "c", bankDate: "2026-09-02", amountCents: -1000, category: { effectiveId: null, effectiveName: null }, merchant: { effectiveId: null, effectiveName: null }, kind: { effective: "expense" }, duplicateState: "confirmed", excludedFromAnalytics: false },
      { id: "d", bankDate: "2026-09-01", amountCents: -500, category: { effectiveId: null, effectiveName: null }, merchant: { effectiveId: null, effectiveName: null }, kind: { effective: "expense" }, duplicateState: "none", excludedFromAnalytics: true },
    ],
  });

  expect(snapshot.quality).toEqual({ expenseRows: 4, excludedRows: 1, confirmedDuplicateRows: 1, reconciled: true });
  expect(snapshot.categoryDrivers.map((item) => [item.name, item.expenseCents])).toEqual([
    ["Alimentación", 3000],
    ["Sin categoría", 2500],
  ]);
  expect(snapshot.categoryDrivers[1].href).toContain("categoryId=__uncategorized__");
  expect(snapshot.merchantDrivers[1].href).toBeNull();
});

test("E2 · el motor falla cerrado si drivers y financial.period no reconcilian", () => {
  expect(() => buildAnalysisSnapshot({
    month: "2026-09",
    current: { ...MOCK_SNAPSHOT.current, expenseCents: 9999 },
    previous: MOCK_SNAPSHOT.previous,
    expenseRows: [],
  })).toThrow("analysis_reconciliation_failed");
});

test("E2 · Análisis representa comparación, drivers y drill-down sin recalcular en React", async ({ page }, testInfo) => {
  test.skip(Boolean(process.env.VERCEL_PREVIEW_URL), "el Preview protegido se valida con el contrato real en otra prueba");
  await page.route("**/api/analysis**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.pathname).toBe("/api/analysis");
    expect(url.searchParams.get("month")).toBe("2026-09");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_SNAPSHOT) });
  });
  await page.goto("/analysis");

  await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumen financiero del periodo" });
  await expect(summary.getByText("2.100,00 €", { exact: true })).toBeVisible();
  await expect(summary.getByText("550,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText(/Reconciliado al céntimo/i)).toBeVisible();
  const categoryLink = page.getByRole("link", { name: "Ver movimientos", exact: true }).first();
  await expect(categoryLink).toHaveAttribute("href", /categoryId=11111111-1111-4111-8111-111111111111/);

  if (testInfo.project.name === "chromium-mobile") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const buttonBox = await page.getByRole("button", { name: "Actualizar análisis" }).boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
  }
});

test("E2 · Preview protegido expone Análisis real reconciliado y read-only", async ({ request }) => {
  test.skip(!process.env.VERCEL_PREVIEW_URL, "solo se ejecuta contra Preview protegido");
  const response = await request.get("/api/analysis?month=2026-08");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.contractVersion).toBe(1);
  expect(payload.month).toBe("2026-08");
  expect(payload.quality?.reconciled).toBe(true);
  expect(payload.principles).toEqual({
    bankSource: "read_only",
    totals: "financial_period",
    drivers: "effective_transaction_query",
  });
  expect(Array.isArray(payload.categoryDrivers)).toBe(true);
  expect(Array.isArray(payload.merchantDrivers)).toBe(true);
});
