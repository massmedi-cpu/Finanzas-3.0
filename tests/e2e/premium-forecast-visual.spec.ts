import { expect, test, type Page } from "@playwright/test";

const itemId = "82000000-0000-4000-8000-000000000182";

const snapshot = {
  contractVersion: 1,
  period: { dateFrom: "2026-09-16", dateTo: "2026-12-14", accountId: null },
  summary: {
    openingBalanceCents: 245000,
    projectedIncomeCents: 180000,
    projectedExpenseCents: 96500,
    projectedNetCents: 83500,
    projectedClosingBalanceCents: 328500,
    plannedItems: 2,
    excludedItems: 0,
    confirmedItems: 0,
  },
  items: [
    {
      id: itemId,
      date: "2026-09-25",
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: "Hogar",
      merchantId: null,
      merchantName: null,
      concept: "Seguro del hogar",
      amountCents: -6500,
      origin: "manual",
      confidence: "high",
      recurrenceId: null,
      budgetId: null,
      confirmedTransactionId: null,
      excluded: false,
      excludedReason: "",
      reconciliationNote: "",
      projectionKey: null,
      updatedAt: "2026-09-15T18:00:00.000Z",
      status: "planned",
      affectsProjection: true,
      projectionEffectCents: -6500,
      projectedBalanceAfterCents: 238500,
      actual: null,
    },
    {
      id: "82000000-0000-4000-8000-000000000183",
      date: "2026-10-01",
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: "Ingresos",
      merchantId: null,
      merchantName: null,
      concept: "Ingreso previsto",
      amountCents: 180000,
      origin: "recurring",
      confidence: "high",
      recurrenceId: "82000000-0000-4000-8000-000000000184",
      budgetId: null,
      confirmedTransactionId: null,
      excluded: false,
      excludedReason: "",
      reconciliationNote: "",
      projectionKey: "recurrence:visual:2026-10-01",
      updatedAt: "2026-09-15T18:00:00.000Z",
      status: "planned",
      affectsProjection: true,
      projectionEffectCents: 180000,
      projectedBalanceAfterCents: 418500,
      actual: null,
    },
  ],
  budgetContext: [
    { month: "2026-09", budgetCents: 128633, actualExpenseCents: 14121, remainingCents: 114512, status: "on_track" },
    { month: "2026-10", budgetCents: 128633, actualExpenseCents: 0, remainingCents: 128633, status: "on_track" },
  ],
  balanceContext: {
    quality: { accounts: 2, integrityDeltaAccounts: 0, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0 },
    accounts: [
      { id: "82000000-0000-4000-8000-000000000185", name: "Cuenta principal", balanceCents: 245000, balanceSource: "explicit", explicitBalanceDate: "2026-09-15", reconstructionDeltaCents: 0 },
    ],
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

async function mockForecast(page: Page) {
  await page.route("**/api/forecast*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated: 0 }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
}

test("Previsión premium conserva densidad, reflow y touch en seis anchos", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz completa se ejecuta una vez por run");
  await mockForecast(page);

  for (const width of [360, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/forecast");

    const heading = page.getByRole("heading", { name: "Previsión", exact: true });
    await expect(heading).toBeVisible();
    await expect(page.getByText("Anticipa ingresos y gastos, revisa recurrencias", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Resumen de previsión")).toBeVisible();
    await expect(page.getByLabel("Curva de saldo prevista")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Movimientos previstos" })).toBeVisible();

    const metrics = await page.locator("main").evaluate((main) => {
      const heading = main.querySelector("h1");
      const undersized = Array.from(main.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])"))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && box.height < 44;
        })
        .map((element) => `${element.tagName.toLowerCase()}:${Math.round(element.getBoundingClientRect().height)}px`);

      return {
        overflow: main.scrollWidth - main.clientWidth,
        undersized,
        headingPx: heading ? Number.parseFloat(getComputedStyle(heading).fontSize) : 999,
      };
    });

    expect(metrics.overflow, `${width}px no debe introducir overflow horizontal de página`).toBeLessThanOrEqual(1);
    expect(metrics.undersized, `${width}px debe conservar targets táctiles >=44 px`).toEqual([]);
    expect(metrics.headingPx, `${width}px debe mantener un título discreto`).toBeLessThanOrEqual(40);
  }
});
