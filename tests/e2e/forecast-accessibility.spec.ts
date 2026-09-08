import { expect, test } from "@playwright/test";

const forecastItemId = "81000000-0000-4000-8000-000000000081";

const snapshot = {
  contractVersion: 1,
  period: { dateFrom: "2026-09-09", dateTo: "2026-12-07", accountId: null },
  summary: {
    openingBalanceCents: 18884599,
    projectedIncomeCents: 150000,
    projectedExpenseCents: 7250,
    projectedNetCents: 142750,
    projectedClosingBalanceCents: 19027349,
    plannedItems: 1,
    excludedItems: 0,
    confirmedItems: 0,
  },
  items: [
    {
      id: forecastItemId,
      date: "2026-09-15",
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: null,
      merchantId: null,
      merchantName: null,
      concept: "Seguro mensual",
      amountCents: -7250,
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
      projectionEffectCents: -7250,
      projectedBalanceAfterCents: 18877349,
      actual: null,
    },
  ],
  budgetContext: [
    { month: "2026-09", budgetCents: 128633, actualExpenseCents: 6611, remainingCents: 122022, status: "on_track" },
  ],
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

const candidates = {
  forecastItemId,
  forecastDate: "2026-09-15",
  forecastAmountCents: -7250,
  days: 7,
  candidates: [
    {
      transactionId: "82000000-0000-4000-8000-000000000082",
      date: "2026-09-14",
      amountCents: -7300,
      differenceCents: 50,
      dayDifference: 1,
      accountId: "10000000-0000-4000-8000-000000000001",
      categoryId: null,
      merchantId: null,
      concept: "SEGURO REAL",
    },
  ],
};

async function mockForecast(page: import("@playwright/test").Page) {
  await page.route("**/api/forecast*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.searchParams.has("itemId")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(candidates) });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

test("Previsión conserva targets táctiles de al menos 44 px en 360, 430 y 480", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz táctil se ejecuta una vez por run");
  await mockForecast(page);

  for (const width of [360, 430, 480]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/forecast");
    const undersized = await page.locator("main a[href], main button:not([disabled]), main input:not([disabled]), main select:not([disabled])").evaluateAll((elements) =>
      elements
        .filter((element) => {
          const node = element as HTMLElement;
          const box = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && box.height < 44;
        })
        .map((element) => `${element.tagName.toLowerCase()}:${Math.round((element as HTMLElement).getBoundingClientRect().height)}px`),
    );
    expect(undersized, `${width}px debe conservar hit areas de 44px`).toEqual([]);
  }
});

test("Previsión mantiene metadata y etiquetas funcionales en al menos 14 px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la medición tipográfica se ejecuta una vez por run");
  await mockForecast(page);
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/forecast");

  const targets = [
    page.getByText("Manual · confianza Alta", { exact: true }),
    page.getByText("1 previstos", { exact: true }),
    page.getByText("Concepto", { exact: true }),
    page.getByText("Saldo después:", { exact: false }),
  ];

  for (const target of targets) {
    await expect(target).toBeVisible();
    const fontSize = await target.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
  }
});

test("Previsión asocia errores de campo y mueve foco al control inválido", async ({ page }) => {
  await mockForecast(page);
  await page.goto("/forecast");

  const concept = page.getByLabel("Concepto");
  const amount = page.getByLabel("Importe");
  await concept.fill("Seguro anual");
  await amount.fill("1,2,3");
  await page.getByRole("button", { name: "Añadir al calendario" }).click();

  await expect(amount).toHaveAttribute("aria-invalid", "true");
  const amountDescription = await amount.getAttribute("aria-describedby");
  expect(amountDescription).toBeTruthy();
  await expect(page.locator(`#${amountDescription}`)).toHaveText("Introduce un importe válido con hasta dos decimales.");
  await expect(amount).toBeFocused();

  const excludeReason = page.getByLabel("Motivo para excluir Seguro mensual");
  await page.getByRole("button", { name: "Excluir" }).click();
  await expect(excludeReason).toHaveAttribute("aria-invalid", "true");
  const excludeDescription = await excludeReason.getAttribute("aria-describedby");
  expect(excludeDescription).toBeTruthy();
  await expect(page.locator(`#${excludeDescription}`)).toHaveText("Indica el motivo antes de excluir un elemento previsto.");
  await expect(excludeReason).toBeFocused();
});

test("Previsión gestiona el foco al abrir y cerrar candidatos reales", async ({ page }) => {
  await mockForecast(page);
  await page.goto("/forecast");

  const trigger = page.getByRole("button", { name: "Buscar movimiento real" });
  await trigger.click();
  await expect(page.getByText("SEGURO REAL")).toBeVisible();
  const close = page.getByRole("button", { name: "Cerrar" });
  await expect(close).toBeFocused();

  await close.click();
  await expect(trigger).toBeFocused();
});
