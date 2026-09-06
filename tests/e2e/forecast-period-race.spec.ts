import { expect, test } from "@playwright/test";

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

    const dateFrom = url.searchParams.get("dateFrom") ?? "2026-09-07";
    const dateTo = url.searchParams.get("dateTo") ?? "2026-12-06";

    if (dateFrom === "2026-10-01" && dateTo !== "2026-10-31") {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(snapshot("RESPUESTA OBSOLETA", dateFrom, dateTo)),
      });
      return;
    }

    if (dateFrom === "2026-10-01" && dateTo === "2026-10-31") {
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
  await expect(page.getByText("PERIODO INICIAL")).toBeVisible();

  await page.getByLabel("Desde").fill("2026-10-01");
  await page.getByLabel("Hasta").fill("2026-10-31");

  await expect(page.getByText("PERIODO MÁS RECIENTE")).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.getByText("PERIODO MÁS RECIENTE")).toBeVisible();
  await expect(page.getByText("RESPUESTA OBSOLETA")).toHaveCount(0);
});
