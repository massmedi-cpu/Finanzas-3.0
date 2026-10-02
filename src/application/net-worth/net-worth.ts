import type { AccountType, EntityLifecycle } from "../../domain/models";

export type NetWorthBalanceInput = {
  id: string;
  name: string;
  type: AccountType;
  currency: "EUR";
  lifecycle: EntityLifecycle;
  balanceCents: number;
  balanceSource: "bank_explicit" | "reconstructed";
  explicitBalanceDate: string | null;
};

export type NetWorthEntry = {
  id: string;
  name: string;
  type: AccountType;
  balanceCents: number;
  valueCents: number;
  bucket: "asset" | "liability" | "excluded";
  reason:
    | "financial_asset"
    | "overdraft_liability"
    | "credit_liability"
    | "credit_sign_ambiguous"
    | "unclassified_account"
    | "archived_account"
    | "invalid_balance";
  balanceSource: "bank_explicit" | "reconstructed";
  balanceDate: string | null;
};

export type NetWorthSnapshot = {
  contractVersion: 1;
  scope: "known_financial_accounts";
  asOfDate: string | null;
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  includedAccounts: number;
  excludedAccounts: number;
  entries: NetWorthEntry[];
  principles: {
    bankSource: "read_only";
    assetsMinusLiabilities: true;
    archivedAccountsExcluded: true;
    unknownAccountTypesExcluded: true;
    ambiguousCreditBalancesExcluded: true;
    manualAssetsIncluded: false;
  };
};

const FINANCIAL_ASSET_TYPES = new Set<AccountType>([
  "checking",
  "savings",
  "cash",
  "investment",
]);

function classify(account: NetWorthBalanceInput): NetWorthEntry {
  const base = {
    id: account.id,
    name: account.name,
    type: account.type,
    balanceCents: account.balanceCents,
    balanceSource: account.balanceSource,
    balanceDate: account.explicitBalanceDate,
  } as const;

  if (account.lifecycle !== "active") {
    return { ...base, valueCents: 0, bucket: "excluded", reason: "archived_account" };
  }

  if (!Number.isSafeInteger(account.balanceCents)) {
    return { ...base, valueCents: 0, bucket: "excluded", reason: "invalid_balance" };
  }

  if (account.type === "credit") {
    if (account.balanceCents < 0) {
      return {
        ...base,
        valueCents: Math.abs(account.balanceCents),
        bucket: "liability",
        reason: "credit_liability",
      };
    }

    // The current bank contract does not guarantee whether a positive credit
    // balance means debt or overpayment. Excluding it is safer than inventing
    // a liability sign convention and keeps the result auditable.
    return { ...base, valueCents: 0, bucket: "excluded", reason: "credit_sign_ambiguous" };
  }

  if (!FINANCIAL_ASSET_TYPES.has(account.type)) {
    return { ...base, valueCents: 0, bucket: "excluded", reason: "unclassified_account" };
  }

  if (account.balanceCents < 0) {
    return {
      ...base,
      valueCents: Math.abs(account.balanceCents),
      bucket: "liability",
      reason: "overdraft_liability",
    };
  }

  return {
    ...base,
    valueCents: account.balanceCents,
    bucket: "asset",
    reason: "financial_asset",
  };
}

export function buildNetWorthSnapshot(
  accounts: readonly NetWorthBalanceInput[],
  asOfDate: string | null,
): NetWorthSnapshot {
  const entries = accounts.map(classify);
  const assetsCents = entries
    .filter((entry) => entry.bucket === "asset")
    .reduce((sum, entry) => sum + entry.valueCents, 0);
  const liabilitiesCents = entries
    .filter((entry) => entry.bucket === "liability")
    .reduce((sum, entry) => sum + entry.valueCents, 0);

  if (!Number.isSafeInteger(assetsCents) || !Number.isSafeInteger(liabilitiesCents)) {
    throw new Error("net_worth_total_out_of_range");
  }

  const netWorthCents = assetsCents - liabilitiesCents;
  if (!Number.isSafeInteger(netWorthCents)) throw new Error("net_worth_total_out_of_range");

  return {
    contractVersion: 1,
    scope: "known_financial_accounts",
    asOfDate,
    assetsCents,
    liabilitiesCents,
    netWorthCents,
    includedAccounts: entries.filter((entry) => entry.bucket !== "excluded").length,
    excludedAccounts: entries.filter((entry) => entry.bucket === "excluded").length,
    entries,
    principles: {
      bankSource: "read_only",
      assetsMinusLiabilities: true,
      archivedAccountsExcluded: true,
      unknownAccountTypesExcluded: true,
      ambiguousCreditBalancesExcluded: true,
      manualAssetsIncluded: false,
    },
  };
}
