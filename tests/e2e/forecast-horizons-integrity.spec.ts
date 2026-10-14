import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const accountId = "10000000-0000-4000-8000-000000000001";
const otherAccountId = "10000000-0000-4000-8000-000000000002";
const itemId = "81000000-0000-4000-8000-000000000001";
const from = "2026-10-01";
const monthlyTo = "2026-10-31";
const yearlyTo = "2027-10-01";

// Business reference: 1.000,00 opening - 200,00 payment = 800,00 closing.
// Each response honours the actual requested dates and account.
function fixture(dateFrom: string, dateTo: string, selectedAccount: string | null = accountId, opening = 100000, manual = false) {
  const baseItem = {
    id: itemId, date: "2026-10-15", accountId: selectedAccount, accountName: "Cuenta principal",
    categoryId: null, categoryName: null, merchantId: null, merchantName: null,
    concept: "Seguro del hogar", amountCents: -20000, origin: "manual", confidence: "high",
    recurrenceId: null, budgetId: null, confirmedTransactionId: null, excluded: false,
    excludedReason: "", reconciliationNote: "", projectionKey: null,
    updatedAt: "2026-10-01T10:00:00Z", status: "planned", affectsProjection: true,
    projectionEffectCents: -20000, projectedBalanceAfterCents: opening - 20000, actual: null,
  };
  const items = [baseItem];
  if (manual) items.push({
    ...baseItem, id: "81000000-0000-4000-8000-000000000002", date: "2026-10-20",
    concept: "Revisión del coche", amountCents: -2500, projectionEffectCents: -2500,
    projectedBalanceAfterCents: opening - 22500,
  });
  return {
    contractVersion: 1,
    period: { dateFrom, dateTo, accountId: selectedAccount },
    summary: {
      openingBalanceCents: opening, projectedIncomeCents: 0, projectedExpenseCents: manual ? 22500 : 20000,
      projectedNetCents: manual ? -22500 : -20000, projectedClosingBalanceCents: opening - (manual ? 22500 : 20000),
      plannedItems: items.length, excludedItems: 0, confirmedItems: 0,
    },
    items, budgetContext: [],
    balanceContext: {
      quality: { accounts: 1, integrityDeltaAccounts: 0, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 },
      accounts: [{ id: accountId, name: "Cuenta principal", balanceCents: opening, balanceSource: "explicit", explicitBalanceDate: "2026-09-30", reconstructionDeltaCents: 0 }],
    },
    principles: {
      bankSource: "read_only", openingBalanceSource: "financial_account_balances", recurrenceSource: "active_recurrences_only",
      budgetsCreateDatedItems: false, excludedItemsAffectCashFlow: false, confirmedItemsAffectCashFlow: false, getHasSideEffects: false,
    },
  };
}

const horizons = (page: Page) => page.getByRole("region", { name: "Tu dinero en cuatro horizontes" });
const twelveMonths = (page: Page) => horizons(page).getByRole("article").filter({ has: page.getByText("12 meses", { exact: true }) });

test("REC-HORIZON-001 · another account's annual forecast is rejected and can be reread safely", async ({ page }) => {
  let rejected = true;
  const writes: string[] = [];
  await page.route("**/api/forecast*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") writes.push(request.method());
    const to = new URL(request.url()).searchParams.get("dateTo")!;
    await route.fulfill({ json: fixture(from, to, to === yearlyTo && rejected ? otherAccountId : accountId) });
  });
  await page.goto(`/forecast?dateFrom=${from}&dateTo=${monthlyTo}&accountId=${accountId}`);
  await expect(page.getByRole("heading", { name: "Seguro del hogar", exact: true })).toBeVisible();
  await expect(horizons(page).getByRole("article")).toHaveCount(0);
  await expect(horizons(page).getByRole("status")).toContainText("No se han podido verificar");
  rejected = false;
  await horizons(page).getByRole("button", { name: "Reintentar horizontes" }).click();
  await expect(twelveMonths(page)).toContainText(/800,00\s?€/);
  expect(writes).toEqual([]);
});

test("REC-HORIZON-002 · a changed start date replaces annual balances and their query scope", async ({ page }) => {
  const annualRequests: string[] = [];
  await page.route("**/api/forecast*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const selectedFrom = query.get("dateFrom")!;
    const to = query.get("dateTo")!;
    if (to.startsWith("2027")) annualRequests.push(`${selectedFrom}:${to}`);
    await route.fulfill({ json: fixture(selectedFrom, to, accountId, selectedFrom === from ? 100000 : 200000) });
  });
  await page.goto(`/forecast?dateFrom=${from}&dateTo=${monthlyTo}&accountId=${accountId}`);
  await expect(twelveMonths(page)).toContainText(/800,00\s?€/);
  await page.getByLabel("Desde", { exact: true }).fill("2026-10-02");
  await expect(twelveMonths(page)).toContainText(/1\.800,00\s?€/);
  await expect.poll(() => annualRequests).toContain("2026-10-02:2027-10-02");
  await expect(horizons(page).getByText("800,00 €", { exact: true })).toHaveCount(0);
});

test("REC-HORIZON-003 · a verified manual payment updates both detailed and annual balances", async ({ page }) => {
  let saved = false;
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/forecast*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      writes.push(request.postDataJSON());
      saved = true;
      await route.fulfill({ json: { id: "81000000-0000-4000-8000-000000000002", origin: "manual" } });
      return;
    }
    const query = new URL(request.url()).searchParams;
    await route.fulfill({ json: fixture(query.get("dateFrom")!, query.get("dateTo")!, accountId, 100000, saved) });
  });
  await page.goto(`/forecast?dateFrom=${from}&dateTo=${monthlyTo}&accountId=${accountId}`);
  await expect(twelveMonths(page)).toContainText(/800,00\s?€/);
  await page.getByLabel("Concepto", { exact: true }).fill("Revisión del coche");
  await page.getByLabel("Fecha", { exact: true }).fill("2026-10-20");
  await page.getByLabel("Importe", { exact: true }).fill("25,00");
  await page.getByRole("button", { name: "Añadir al calendario" }).click();
  await expect(page.getByRole("heading", { name: "Revisión del coche", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen de previsión" })).toContainText(/775,00\s?€/);
  await expect(twelveMonths(page)).toContainText(/775,00\s?€/);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ action: "manual", amountCents: -2500, accountId });
});

test("REC-HORIZON-004 · a 12-month detail supplies all horizons without a duplicate GET", async ({ page }) => {
  const reads: string[] = [];
  await page.route("**/api/forecast*", async (route) => {
    expect(route.request().method()).toBe("GET");
    reads.push(route.request().url());
    const query = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: fixture(query.get("dateFrom")!, query.get("dateTo")!) });
  });
  await page.goto(`/forecast?dateFrom=${from}&dateTo=${yearlyTo}&accountId=${accountId}`);
  await expect(twelveMonths(page)).toContainText(/800,00\s?€/);
  expect(reads).toHaveLength(1);
});

test("REC-HORIZON-005 · malformed annual HTTP 200 stays recoverable without crashing the page", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (error) => crashes.push(error.message));
  await page.route("**/api/forecast*", async (route) => {
    const to = new URL(route.request().url()).searchParams.get("dateTo")!;
    const data = fixture(from, to);
    await route.fulfill({ json: to === yearlyTo ? { ...data, items: "not-a-list" } : data });
  });
  await page.goto(`/forecast?dateFrom=${from}&dateTo=${monthlyTo}&accountId=${accountId}`);
  await expect(horizons(page).getByRole("button", { name: "Reintentar horizontes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seguro del hogar", exact: true })).toBeVisible();
  expect(crashes).toEqual([]);
});

for (const theme of ["light", "dark"] as const) test(`REC-HORIZON-006 · usable ${theme} horizon cards across phone, tablet and desktop`, async ({ page }, info) => {
  test.skip(info.project.name !== "chromium-desktop", "The width matrix runs once per build.");
  await page.route("**/api/forecast*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: fixture(query.get("dateFrom")!, query.get("dateTo")!) });
  });
  {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [360, 390, 768, 1024, 1100, 1280, 1366, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(`/forecast?dateFrom=${from}&dateTo=${yearlyTo}&accountId=${accountId}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(twelveMonths(page)).toContainText(/800,00\s?€/);
      const overflow = await horizons(page).getByRole("article").evaluateAll((cards) =>
        cards.map((card) => card.scrollWidth - card.clientWidth));
      expect(overflow, `${theme} ${width}px`).toEqual([0, 0, 0, 0]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if ([390, 1440].includes(width)) {
        const accessibility = await new AxeBuilder({ page })
          .include('[aria-labelledby="forecast-horizons-title"]')
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(accessibility.violations.map((issue) => ({ id: issue.id, nodes: issue.nodes.map((node) => node.failureSummary) }))).toEqual([]);
      }
      await horizons(page).screenshot({ path: info.outputPath(`${theme}-${width}.png`) });
      if (width === 1280 && theme === "light") {
        await page.setViewportSize({ width, height: 720 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: info.outputPath("after-page-light-1280.png") });
      }
    }
  }
});

test("REC-HORIZON-007 · corrupt detail labels recover through a read without regenerating or writing", async ({ page }) => {
  let corrupt = true;
  const writes: string[] = [];
  const crashes: string[] = [];
  page.on("pageerror", (error) => crashes.push(error.message));
  await page.route("**/api/forecast*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") writes.push(request.method());
    const query = new URL(request.url()).searchParams;
    const data = fixture(query.get("dateFrom")!, query.get("dateTo")!);
    await route.fulfill({ json: corrupt ? { ...data, items: [{ ...data.items[0], concept: {} }] } : data });
  });
  await page.goto(`/forecast?dateFrom=${from}&dateTo=${monthlyTo}&accountId=${accountId}`);
  await expect(page.getByRole("region", { name: "Resumen de previsión" })).toHaveCount(0);
  const retry = page.locator("main").getByRole("button", { name: "Reintentar lectura" });
  await expect(retry).toBeEnabled();
  corrupt = false;
  await retry.click();
  await expect(page.getByRole("heading", { name: "Seguro del hogar", exact: true })).toBeVisible();
  await expect(twelveMonths(page)).toContainText(/800,00\s?€/);
  expect(writes).toEqual([]);
  expect(crashes).toEqual([]);
});

test("REC-HORIZON-008 · changed dates survive the URL and every compatible module handoff", async ({ page }) => {
  await page.route("**/api/forecast*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const selectedFrom = query.get("dateFrom")!;
    const data = fixture(selectedFrom, query.get("dateTo")!);
    data.items[0].date = selectedFrom.slice(0, 7) + "-15";
    await route.fulfill({ json: data });
  });
  await page.goto(`/forecast?dateFrom=${from}&dateTo=${monthlyTo}&accountId=${accountId}`);
  await expect(page.getByRole("heading", { name: "Seguro del hogar", exact: true })).toBeVisible();
  await page.getByLabel("Hasta", { exact: true }).fill("2026-11-30");
  await page.getByLabel("Desde", { exact: true }).fill("2026-11-01");
  await expect(page).toHaveURL(/dateFrom=2026-11-01&dateTo=2026-11-30/);
  const navigation = page.getByRole("navigation", { name: "Continuar desde Previsión" });
  await expect(navigation.getByRole("link", { name: /^Cash Flow/ })).toHaveAttribute("href", "/cash-flow?month=2026-11");
  await expect(navigation.getByRole("link", { name: /^Presupuestos/ })).toHaveAttribute("href", "/budgets?month=2026-11");
  await expect(navigation.getByRole("link", { name: /^Movimientos/ })).toHaveAttribute("href", `/transactions?accountId=${accountId}`);
  const recurrent = navigation.getByRole("link", { name: /^Recurrentes/ });
  await expect(recurrent).toHaveAttribute("href", new RegExp(`forecastDateFrom=2026-11-01&forecastDateTo=2026-11-30&forecastAccountId=${accountId}`));
  await page.reload();
  await expect(page.getByLabel("Desde", { exact: true })).toHaveValue("2026-11-01");
  await expect(page.getByLabel("Hasta", { exact: true })).toHaveValue("2026-11-30");
});
