import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const accountA = "91000000-0000-4000-8000-000000000091";
const accountB = "92000000-0000-4000-8000-000000000092";

const balances = {
  asOfDate: "2026-09-07",
  includeArchived: false,
  accountId: null,
  totalBalanceCents: 30000,
  activeBalanceCents: 30000,
  quality: {
    accounts: 2,
    explicitBalanceAccounts: 2,
    reconstructedBalanceAccounts: 0,
    integrityDeltaAccounts: 0,
  },
  accounts: [
    {
      id: accountA,
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
    {
      id: accountB,
      name: "Ahorro · 0092",
      type: "savings",
      currency: "EUR",
      lifecycle: "active",
      openingBalanceCents: 0,
      balanceCents: 10000,
      balanceSource: "bank_explicit",
      explicitBalanceCents: 10000,
      explicitBalanceDate: "2026-09-06",
      explicitSourceRowKey: "B-1",
      reconstructedBalanceCents: 10000,
      reconstructionDeltaCents: 0,
    },
  ],
};

function snapshotFor(accountId: string) {
  const selected = balances.accounts.find((account) => account.id === accountId) ?? balances.accounts[0];
  return {
    contractVersion: 1,
    period: {
      dateFrom: "2026-01-01",
      dateTo: "2026-09-07",
      accountId: selected.id,
      incomeCents: selected.id === accountA ? 150000 : 50000,
      expenseCents: selected.id === accountA ? 70000 : 5000,
      refundCents: 0,
      adjustmentCents: 0,
      operatingNetCents: selected.id === accountA ? 80000 : 45000,
      savingsCents: selected.id === accountA ? 80000 : 45000,
      savingsRateBps: 5333,
      transfers: { rows: 2, pairedRows: 2, unpairedRows: 0, pairedPairs: 1, netCents: 0, grossCents: 20000 },
      quality: { scopedRows: 4, includedRows: 4, manuallyExcludedRows: 0, confirmedDuplicateRows: 0, suspectedDuplicateRows: 0, signMismatchRows: 0 },
    },
    balances: {
      ...balances,
      accountId: selected.id,
      totalBalanceCents: selected.balanceCents,
      activeBalanceCents: selected.balanceCents,
      quality: { accounts: 1, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0, integrityDeltaAccounts: 0 },
      accounts: [selected],
    },
    monthly: {
      dateFrom: "2026-01-01",
      dateTo: "2026-09-07",
      accountId: selected.id,
      rows: [
        { monthStart: "2026-08-01", rows: 2, incomeCents: 100000, expenseCents: 40000, refundCents: 0, adjustmentCents: 0, operatingNetCents: 60000, savingsCents: 60000, transferNetCents: 0, transferGrossCents: 20000 },
        { monthStart: "2026-09-01", rows: 2, incomeCents: 50000, expenseCents: 30000, refundCents: 0, adjustmentCents: 0, operatingNetCents: 20000, savingsCents: 20000, transferNetCents: 0, transferGrossCents: 0 },
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
}

function transactionsFor(accountId: string) {
  return {
    totalCount: 1,
    hasMore: false,
    nextCursor: null,
    rows: [
      {
        id: "93000000-0000-4000-8000-000000000093",
        bankDate: "2026-09-06",
        amountCents: accountId === accountA ? -1234 : 2500,
        balanceAfterCents: accountId === accountA ? 20000 : 10000,
        account: { id: accountId, name: accountId === accountA ? "Cuenta principal · 0091" : "Ahorro · 0092" },
        concept: { original: "Movimiento prueba", processed: "Movimiento prueba", effective: "Movimiento prueba" },
        category: { originalId: null, originalName: null, effectiveId: null, effectiveName: "Compras" },
        kind: { original: accountId === accountA ? "expense" : "income", effective: accountId === accountA ? "expense" : "income" },
        duplicateState: "none",
        excludedFromAnalytics: false,
      },
    ],
  };
}

async function mockAccountsApis(page: import("@playwright/test").Page) {
  await page.route("**/api/financial?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "balances") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(balances) });
      return;
    }
    const accountId = url.searchParams.get("accountId") ?? accountA;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshotFor(accountId)) });
  });

  await page.route("**/api/transactions?*", async (route) => {
    const url = new URL(route.request().url());
    const accountId = url.searchParams.get("accountId") ?? accountA;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(transactionsFor(accountId)) });
  });
}

test("accounts UI renders central balances, scoped metrics and recent movements", async ({ page }) => {
  await mockAccountsApis(page);
  await page.goto("/accounts");

  await expect(page.getByRole("heading", { name: "Tu dinero, cuenta por cuenta" })).toBeVisible();
  await expect(page.getByLabel("Saldo total en cuentas").getByText("300,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText(/FASE\s+\d/i)).toHaveCount(0);
  await expect(page.getByText(/PATRIMONIO DISPONIBLE/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Cuenta principal/ })).toBeVisible();
  await expect(page.getByText("1.500,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("700,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("Movimiento prueba")).toBeVisible();

  await page.getByRole("button", { name: /Ahorro/ }).click();
  await expect(page.getByRole("heading", { name: "Ahorro · 0092" })).toBeVisible();
  await expect(page.getByText("500,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("50,00 €", { exact: true })).toBeVisible();
});

test("accounts UI keeps touch targets usable on narrow mobile screens", async ({ page }) => {
  await mockAccountsApis(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/accounts");

  const controls = [
    page.getByRole("button", { name: "Ver archivadas" }),
    page.getByRole("button", { name: /Cuenta principal/ }),
    page.getByRole("button", { name: /Ahorro/ }),
    page.getByRole("link", { name: "Abrir Movimientos" }),
  ];

  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("protected preview exposes F10 accounts from the existing financial and transaction engines", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected F10 preview");

  const buildResponse = await request.get("/api/build");
  expect(buildResponse.ok()).toBeTruthy();
  const build = await buildResponse.json();
  expect(build.phase).toBeGreaterThanOrEqual(10);
  if (build.phase === 10) expect(build.phaseName).toBe("Cuentas");
  if (process.env.GITHUB_SHA) expect(build.commit).toBe(process.env.GITHUB_SHA);

  const balancesResponse = await request.get("/api/financial?mode=balances");
  expect(balancesResponse.ok()).toBeTruthy();
  const liveBalances = await balancesResponse.json();
  expect(liveBalances.activeBalanceCents).toBe(18884599);
  expect(liveBalances.accounts).toHaveLength(2);
  expect(liveBalances.quality.explicitBalanceAccounts).toBe(2);

  const selected = liveBalances.accounts[0];
  expect(selected?.id).toBeTruthy();
  const snapshotResponse = await request.get(
    `/api/financial?mode=snapshot&dateFrom=2026-01-01&dateTo=${liveBalances.asOfDate}&accountId=${selected.id}`,
  );
  expect(snapshotResponse.ok()).toBeTruthy();
  const snapshot = await snapshotResponse.json();
  expect(snapshot.contractVersion).toBe(1);
  expect(snapshot.period.accountId).toBe(selected.id);
  expect(snapshot.monthly.accountId).toBe(selected.id);
  expect(snapshot.balances.accounts).toHaveLength(1);
  expect(snapshot.principles.bankSource).toBe("read_only");
  expect(snapshot.principles.transfersExcludedFromSavings).toBe(true);
  expect(snapshot.principles.explicitBankBalancePreferred).toBe(true);

  const transactionsResponse = await request.get(`/api/transactions?accountId=${selected.id}&limit=8`);
  expect(transactionsResponse.ok()).toBeTruthy();
  const transactionPage = await transactionsResponse.json();
  expect(Array.isArray(transactionPage.rows)).toBe(true);
  for (const row of transactionPage.rows) expect(row.account.id).toBe(selected.id);
});
