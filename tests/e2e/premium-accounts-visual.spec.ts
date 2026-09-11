import { expect, test } from "@playwright/test";

const accountId = "91000000-0000-4000-8000-000000000091";

const balances = {
  asOfDate: "2026-09-11",
  includeArchived: false,
  accountId: null,
  totalBalanceCents: 30000,
  activeBalanceCents: 30000,
  quality: { accounts: 1, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0, integrityDeltaAccounts: 0 },
  accounts: [{
    id: accountId,
    name: "Cuenta principal",
    type: "checking",
    currency: "EUR",
    lifecycle: "active",
    openingBalanceCents: 0,
    balanceCents: 30000,
    balanceSource: "bank_explicit",
    explicitBalanceCents: 30000,
    explicitBalanceDate: "2026-09-11",
    explicitSourceRowKey: "A-1",
    reconstructedBalanceCents: 30000,
    reconstructionDeltaCents: 0,
  }],
};

const snapshot = {
  contractVersion: 1,
  period: {
    dateFrom: "2026-01-01",
    dateTo: "2026-09-11",
    accountId,
    incomeCents: 160000,
    expenseCents: 140000,
    refundCents: 0,
    adjustmentCents: 0,
    operatingNetCents: 20000,
    savingsCents: 20000,
    savingsRateBps: 1250,
    transfers: { rows: 0, pairedRows: 0, unpairedRows: 0, pairedPairs: 0, netCents: 0, grossCents: 0 },
    quality: { scopedRows: 4, includedRows: 4, manuallyExcludedRows: 0, confirmedDuplicateRows: 0, suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: { ...balances, accountId, totalBalanceCents: 30000, activeBalanceCents: 30000 },
  monthly: {
    dateFrom: "2026-01-01",
    dateTo: "2026-09-11",
    accountId,
    rows: [
      { monthStart: "2026-08-01", rows: 2, incomeCents: 100000, expenseCents: 40000, refundCents: 0, adjustmentCents: 0, operatingNetCents: 60000, savingsCents: 60000, transferNetCents: 0, transferGrossCents: 0 },
      { monthStart: "2026-09-01", rows: 2, incomeCents: 60000, expenseCents: 100000, refundCents: 0, adjustmentCents: 0, operatingNetCents: -40000, savingsCents: -40000, transferNetCents: 0, transferGrossCents: 0 },
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

async function mockAccounts(page: import("@playwright/test").Page) {
  await page.route("**/api/financial?*", async (route) => {
    const url = new URL(route.request().url());
    const payload = url.searchParams.get("mode") === "balances" ? balances : snapshot;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.route("**/api/transactions?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ rows: [], totalCount: 0, hasMore: false, nextCursor: null }),
  }));
}

test("Premium · Cuentas dibuja netos positivos y negativos a lados opuestos del cero", async ({ page }) => {
  await mockAccounts(page);
  await page.goto("/accounts");

  const positiveTrack = page.locator('[title^="Neto "]').nth(0);
  const negativeTrack = page.locator('[title^="Neto "]').nth(1);
  await expect(positiveTrack).toBeVisible();
  await expect(negativeTrack).toBeVisible();

  const positiveTrackBox = await positiveTrack.boundingBox();
  const negativeTrackBox = await negativeTrack.boundingBox();
  const positiveBarBox = await positiveTrack.locator("span").boundingBox();
  const negativeBarBox = await negativeTrack.locator("span").boundingBox();

  expect(positiveTrackBox).not.toBeNull();
  expect(negativeTrackBox).not.toBeNull();
  expect(positiveBarBox).not.toBeNull();
  expect(negativeBarBox).not.toBeNull();

  const positiveZero = positiveTrackBox!.x + positiveTrackBox!.width / 2;
  const negativeZero = negativeTrackBox!.x + negativeTrackBox!.width / 2;

  expect(positiveBarBox!.x).toBeGreaterThanOrEqual(positiveZero - 1);
  expect(positiveBarBox!.x + positiveBarBox!.width).toBeGreaterThan(positiveZero + 1);
  expect(negativeBarBox!.x + negativeBarBox!.width).toBeLessThanOrEqual(negativeZero + 1);
  expect(negativeBarBox!.x).toBeLessThan(negativeZero - 1);

  await expect(page.getByText("600,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("-400,00 €", { exact: true })).toBeVisible();
});
