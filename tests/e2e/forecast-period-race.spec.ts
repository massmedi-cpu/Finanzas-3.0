import { expect, test } from "@playwright/test";

function madridTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addIsoDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function snapshot(concept: string, dateFrom: string, dateTo: string) {
  return {
    contractVersion: 1,
    period: { dateFrom, dateTo, accountId: null },
    summary: {
      openingBalanceCents: 18884599,
      projectedIncomeCents: 0,
      projectedExpenseCents: 1000,
      projectedNetCents: -1000,
      projectedClosingBalanceCents: 18883599,
      plannedItems: 1,
      excludedItems: 0,
      confirmedItems: 0,
    },
    items: [{
      id: "84000000-0000-4000-8000-000000000084",
      date: dateFrom,
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: null,
      merchantId: null,
      merchantName: null,
      concept,
      amountCents: -1000,
      origin: "manual",
      confidence: "high",
      recurrenceId: null,
      budgetId: null,
      confirmedTransactionId: null,
      excluded: false,
      excludedReason: "",
      reconciliationNote: "",
      projectionKey: null,
      status: "planned",
      affectsProjection: true,
      projectionEffectCents: -1000,
      projectedBalanceAfterCents: 18883599,
      actual: null,
    }],
    budgetContext: [],
    balanceContext: {
      quality: { accounts: 2, integrityDeltaAccounts: 0, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0 },
      accounts: [],
    },
    principles: {
      bankSource: "read_only",
      openingBalanceSource: "financial_account_balances",
      recurrenceSource: "active_recurrences_only",
      budgetsCreateDatedItems: false,
      excludedItemsAffectCashFlow: false,
      confirmedItemsAffectCashFlow: false,
      getHasSideEffects: false,
    },
  };
}

test("forecast keeps the newest period when an older request finishes later", async ({ page }) => {
  const targetFrom = addIsoDays(madridTodayIso(), 31);
  const targetTo = addIsoDays(targetFrom, 30);

  await page.route("**/api/forecast*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    const url = new URL(request.url());
    if (url.searchParams.has("itemId")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [] }) });
      return;
    }

    const dateFrom = url.searchParams.get("dateFrom") ?? addIsoDays(madridTodayIso(), 1);
    const dateTo = url.searchParams.get("dateTo") ?? addIsoDays(madridTodayIso(), 90);

    if (dateFrom === targetFrom && dateTo !== targetTo) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(snapshot("RESPUESTA OBSOLETA", dateFrom, dateTo)),
      });
      return;
    }

    if (dateFrom === targetFrom && dateTo === targetTo) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(snapshot("PERIODO MÁS RECIENTE", dateFrom, dateTo)),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot("PERIODO INICIAL", dateFrom, dateTo)),
    });
  });

  await page.goto("/forecast");
  await expect(page.getByRole("heading", { name: "PERIODO INICIAL", exact: true })).toBeVisible();

  await page.getByLabel("Desde", { exact: true }).fill(targetFrom);
  await page.getByLabel("Hasta").fill(targetTo);

  await expect(page.getByRole("heading", { name: "PERIODO MÁS RECIENTE", exact: true })).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.getByRole("heading", { name: "PERIODO MÁS RECIENTE", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "RESPUESTA OBSOLETA", exact: true })).toHaveCount(0);
});

test("forecast identifies the old period if loading the chosen dates fails", async ({ page }) => {
  const today = madridTodayIso();
  const targetFrom = addIsoDays(today, 31);
  const baselineFrom = addIsoDays(today, 1);
  const baselineTo = addIsoDays(today, 90);

  await page.route("**/api/forecast*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("dateFrom") === targetFrom) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "source_unavailable" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot("DATO DEL PERIODO ANTERIOR", baselineFrom, baselineTo)),
    });
  });

  await page.goto("/forecast");
  await expect(page.getByRole("heading", { name: "DATO DEL PERIODO ANTERIOR" })).toBeVisible();
  await page.getByLabel("Desde", { exact: true }).fill(targetFrom);

  await expect(page.locator("main").getByRole("alert")).toContainText("source_unavailable");
  await expect(page.locator("main").getByRole("status")).toContainText("Las cifras visibles corresponden al");
  await expect(page.getByRole("heading", { name: "DATO DEL PERIODO ANTERIOR" })).toBeVisible();
});
