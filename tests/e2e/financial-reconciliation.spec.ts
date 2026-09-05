import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const dateFrom = "2026-01-01";
const dateTo = "2026-09-05";

function sum(rows: any[], field: string) {
  return rows.reduce((total, row) => total + Number(row?.[field] ?? 0), 0);
}

test("protected preview reconciles period and monthly financial views to the cent", async ({ request }) => {
  test.skip(!isProtectedPreview, "Real financial reconciliation is a protected-preview gate.");

  const response = await request.get(
    `/api/financial?mode=snapshot&dateFrom=${dateFrom}&dateTo=${dateTo}`,
  );
  expect(response.ok()).toBeTruthy();
  const snapshot = await response.json();
  const period = snapshot.period;
  const months = snapshot.monthly.rows;

  expect(months.map((row: any) => row.monthStart)).toEqual([
    "2026-01-01",
    "2026-02-01",
    "2026-03-01",
    "2026-04-01",
    "2026-05-01",
    "2026-06-01",
    "2026-07-01",
    "2026-08-01",
    "2026-09-01",
  ]);

  expect(sum(months, "incomeCents")).toBe(period.incomeCents);
  expect(sum(months, "expenseCents")).toBe(period.expenseCents);
  expect(sum(months, "refundCents")).toBe(period.refundCents);
  expect(sum(months, "adjustmentCents")).toBe(period.adjustmentCents);
  expect(sum(months, "operatingNetCents")).toBe(period.operatingNetCents);
  expect(sum(months, "transferNetCents")).toBe(period.transfers.netCents);
  expect(sum(months, "transferGrossCents")).toBe(period.transfers.grossCents);

  expect(period.savingsCents).toBe(period.operatingNetCents);
  expect(period.operatingNetCents).toBe(
    period.incomeCents - period.expenseCents + period.refundCents + period.adjustmentCents,
  );
});

test("protected preview reconciles consolidated balances with every account row", async ({ request }) => {
  test.skip(!isProtectedPreview, "Real balance reconciliation is a protected-preview gate.");

  const response = await request.get(
    `/api/financial?mode=snapshot&dateFrom=${dateFrom}&dateTo=${dateTo}`,
  );
  expect(response.ok()).toBeTruthy();
  const snapshot = await response.json();
  const balances = snapshot.balances;
  const accounts = balances.accounts;

  expect(accounts.length).toBe(balances.quality.accounts);
  expect(sum(accounts, "balanceCents")).toBe(balances.totalBalanceCents);
  expect(
    accounts.filter((account: any) => account.lifecycle === "active").reduce(
      (total: number, account: any) => total + Number(account.balanceCents),
      0,
    ),
  ).toBe(balances.activeBalanceCents);

  const explicitAccounts = accounts.filter((account: any) => account.explicitBalanceCents !== null);
  const reconstructedAccounts = accounts.filter((account: any) => account.explicitBalanceCents === null);
  const integrityDeltaAccounts = explicitAccounts.filter(
    (account: any) => Number(account.reconstructionDeltaCents) !== 0,
  );

  expect(explicitAccounts.length).toBe(balances.quality.explicitBalanceAccounts);
  expect(reconstructedAccounts.length).toBe(balances.quality.reconstructedBalanceAccounts);
  expect(integrityDeltaAccounts.length).toBe(balances.quality.integrityDeltaAccounts);

  for (const account of accounts) {
    expect(account.currency).toBe("EUR");
    if (account.explicitBalanceCents !== null) {
      expect(account.balanceSource).toBe("bank_explicit");
      expect(account.balanceCents).toBe(account.explicitBalanceCents);
      expect(account.explicitBalanceDate <= dateTo).toBeTruthy();
      expect(account.reconstructionDeltaCents).toBe(
        account.explicitBalanceCents - account.reconstructedBalanceCents,
      );
    } else {
      expect(account.balanceSource).toBe("reconstructed");
      expect(account.balanceCents).toBe(account.reconstructedBalanceCents);
    }
  }
});
