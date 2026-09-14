import { expect, test, type Locator, type Page } from "@playwright/test";

const accountId = "91000000-0000-4000-8000-000000000091";

const balances = {
  asOfDate: "2026-09-07",
  includeArchived: false,
  accountId: null,
  totalBalanceCents: 20000,
  activeBalanceCents: 20000,
  quality: {
    accounts: 1,
    explicitBalanceAccounts: 1,
    reconstructedBalanceAccounts: 0,
    integrityDeltaAccounts: 0,
  },
  accounts: [
    {
      id: accountId,
      name: "Cuenta principal · 0091",
      type: "checking",
      currency: "EUR",
      lifecycle: "active",
      openingBalanceCents: 0,
      balanceCents: 20000,
      balanceSource: "bank_explicit",
      explicitBalanceCents: 20000,
      explicitBalanceDate: "2026-09-07",
      explicitSourceRowKey: "A-1",
      reconstructedBalanceCents: 20000,
      reconstructionDeltaCents: 0,
    },
  ],
};

const snapshot = {
  contractVersion: 1,
  period: {
    dateFrom: "2026-01-01",
    dateTo: "2026-09-07",
    accountId,
    incomeCents: 150000,
    expenseCents: 70000,
    refundCents: 0,
    adjustmentCents: 0,
    operatingNetCents: 80000,
    savingsCents: 80000,
    savingsRateBps: 5333,
    transfers: {
      rows: 2,
      pairedRows: 2,
      unpairedRows: 0,
      pairedPairs: 1,
      netCents: 0,
      grossCents: 20000,
    },
    quality: {
      scopedRows: 4,
      includedRows: 4,
      manuallyExcludedRows: 0,
      confirmedDuplicateRows: 0,
      suspectedDuplicateRows: 0,
      signMismatchRows: 0,
    },
  },
  balances: {
    ...balances,
    accountId,
    totalBalanceCents: 20000,
    activeBalanceCents: 20000,
  },
  monthly: {
    dateFrom: "2026-01-01",
    dateTo: "2026-09-07",
    accountId,
    rows: [
      {
        monthStart: "2026-09-01",
        rows: 2,
        incomeCents: 50000,
        expenseCents: 30000,
        refundCents: 0,
        adjustmentCents: 0,
        operatingNetCents: 20000,
        savingsCents: 20000,
        transferNetCents: 0,
        transferGrossCents: 0,
      },
    ],
  },
  principles: {
    bankSource: "read_only",
    transfersExcludedFromSavings: true,
    suspectedDuplicatesIncluded: true,
    confirmedDuplicatesExcluded: true,
    manualAnalyticsExclusionRespected: true,
    explicitBankBalancePreferred: true,
  },
};

const transactions = {
  totalCount: 1,
  hasMore: false,
  nextCursor: null,
  rows: [
    {
      id: "93000000-0000-4000-8000-000000000093",
      bankDate: "2026-09-06",
      amountCents: -1234,
      balanceAfterCents: 20000,
      account: { id: accountId, name: "Cuenta principal · 0091" },
      concept: {
        original: "Movimiento prueba",
        processed: "Movimiento prueba",
        effective: "Movimiento prueba",
      },
      category: {
        originalId: null,
        originalName: null,
        effectiveId: null,
        effectiveName: "Compras",
      },
      kind: { original: "expense", effective: "expense" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
};

async function mockAccounts(page: Page) {
  await page.route("**/api/financial?*", async (route) => {
    const url = new URL(route.request().url());
    const body = url.searchParams.get("mode") === "balances" ? balances : snapshot;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/transactions?*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(transactions) });
  });
}

async function expectMinimumFont(target: Locator, minimumPx: number) {
  await expect(target).toBeVisible();
  const fontSize = await target.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(minimumPx);
}

test("Cuentas usa iconografía de producto y mantiene microtexto funcional legible en móvil", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz tipográfica se ejecuta una vez por run");
  await mockAccounts(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/accounts");

  const accountButton = page.getByRole("button", { name: /Cuenta principal/ });
  await expect(accountButton).toBeVisible();
  await expect(accountButton.locator("svg")).toHaveCount(1);

  await expectMinimumFont(page.getByText("Fuente bancaria · solo lectura", { exact: true }), 13);
  await expectMinimumFont(page.getByText("Cuenta corriente", { exact: true }), 13);
  await expectMinimumFont(page.getByText("Saldo bancario · 07/09/2026", { exact: true }), 13);
  await expectMinimumFont(page.getByText("Saldo confirmado por el banco el 07/09/2026", { exact: true }), 14);
  await expectMinimumFont(page.getByText("Saldo actual", { exact: true }), 14);
  await expectMinimumFont(page.getByText("No computan como ahorro", { exact: true }), 13);
  await expectMinimumFont(page.getByText("Compras", { exact: true }), 13);
  await expectMinimumFont(page.getByText("Gasto", { exact: true }), 13);
  await expectMinimumFont(page.getByText("-12,34 €", { exact: true }), 14);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
