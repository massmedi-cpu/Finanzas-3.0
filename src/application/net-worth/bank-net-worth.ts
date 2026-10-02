export type BankNetWorthAccount = {
  id: string;
  name: string;
  type: string;
  lifecycle: "active" | "archived";
  balanceCents: number;
  explicitBalanceDate: string | null;
};

export type BankNetWorthItem = BankNetWorthAccount & {
  side: "asset" | "liability" | "zero";
  magnitudeCents: number;
};

export type BankNetWorthSnapshot = {
  netWorthCents: number;
  assetsCents: number;
  liabilitiesCents: number;
  accountCount: number;
  asOfDate: string | null;
  assets: BankNetWorthItem[];
  liabilities: BankNetWorthItem[];
  neutral: BankNetWorthItem[];
};

function assertMoney(value: number, accountId: string) {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`invalid_net_worth_balance:${accountId}`);
  }
}

export function assembleBankNetWorth(
  accounts: BankNetWorthAccount[],
  asOfDate: string | null,
): BankNetWorthSnapshot {
  const active = accounts.filter((account) => account.lifecycle === "active");
  const assets: BankNetWorthItem[] = [];
  const liabilities: BankNetWorthItem[] = [];
  const neutral: BankNetWorthItem[] = [];

  for (const account of active) {
    assertMoney(account.balanceCents, account.id);
    const side = account.balanceCents > 0 ? "asset" : account.balanceCents < 0 ? "liability" : "zero";
    const item: BankNetWorthItem = {
      ...account,
      side,
      magnitudeCents: Math.abs(account.balanceCents),
    };
    if (side === "asset") assets.push(item);
    else if (side === "liability") liabilities.push(item);
    else neutral.push(item);
  }

  assets.sort((a, b) => b.magnitudeCents - a.magnitudeCents || a.name.localeCompare(b.name, "es"));
  liabilities.sort((a, b) => b.magnitudeCents - a.magnitudeCents || a.name.localeCompare(b.name, "es"));
  neutral.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const assetsCents = assets.reduce((sum, item) => sum + item.magnitudeCents, 0);
  const liabilitiesCents = liabilities.reduce((sum, item) => sum + item.magnitudeCents, 0);
  const netWorthCents = assetsCents - liabilitiesCents;

  if (![assetsCents, liabilitiesCents, netWorthCents].every(Number.isSafeInteger)) {
    throw new Error("invalid_net_worth_total");
  }

  return {
    netWorthCents,
    assetsCents,
    liabilitiesCents,
    accountCount: active.length,
    asOfDate,
    assets,
    liabilities,
    neutral,
  };
}
