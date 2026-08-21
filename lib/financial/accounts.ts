import { createClient } from "@/lib/supabase/server";
import type { BalancePoint } from "@/components/balance-chart";

export type AccountSource = { identifier: string; label: string; primary: boolean };

export type FinancialAccount = {
  id: string;
  name: string;
  institution: string | null;
  productType: string | null;
  identifier: string;
  role: string;
  currency: string;
  cashFlowEnabled: boolean;
  balance: number | null;
  balanceDate: string | null;
  movements: number;
  firstDate: string | null;
  lastDate: string | null;
  monthIncome: number;
  monthExpenses: number;
  monthNet: number;
  sources: AccountSource[];
  balanceSeries: BalancePoint[];
};

export type AccountsOverview = {
  version: string;
  month: string;
  totalAvailable: number;
  accounts: FinancialAccount[];
};

export type AccountMovement = {
  id: string;
  sourceId: string;
  date: string;
  concept: string | null;
  counterparty: string | null;
  category: string | null;
  type: string | null;
  amount: number;
  balance: number | null;
  sourceIdentifier: string | null;
  needsReview: boolean;
};

export type AccountDetail = {
  version: string;
  account: Omit<FinancialAccount, "monthIncome" | "monthExpenses" | "monthNet" | "sources" | "balanceSeries">;
  sources: AccountSource[];
  balanceSeries: BalancePoint[];
  recentMovements: AccountMovement[];
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAccount(raw: any): FinancialAccount {
  return {
    ...raw,
    balance: raw.balance == null ? null : asNumber(raw.balance),
    movements: asNumber(raw.movements),
    monthIncome: asNumber(raw.monthIncome),
    monthExpenses: asNumber(raw.monthExpenses),
    monthNet: asNumber(raw.monthNet),
    balanceSeries: Array.isArray(raw.balanceSeries) ? raw.balanceSeries.map((point: any) => ({ month: String(point.month), balance: point.balance == null ? null : asNumber(point.balance) })) : [],
    sources: Array.isArray(raw.sources) ? raw.sources : [],
  };
}

export async function getAccountsOverview(): Promise<AccountsOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_app_accounts");
  if (error || !data) throw new Error(error?.message || "accounts_unavailable");
  const raw = data as any;
  return {
    version: String(raw.version || "0.4.0"),
    month: String(raw.month || ""),
    totalAvailable: asNumber(raw.totalAvailable),
    accounts: Array.isArray(raw.accounts) ? raw.accounts.map(normalizeAccount) : [],
  };
}

export async function getAccountDetail(id: string): Promise<AccountDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_app_account_detail", { p_account_id: id });
  if (error || !data) throw new Error(error?.message || "account_unavailable");
  const raw = data as any;
  const a = raw.account || {};
  return {
    version: String(raw.version || "0.4.0"),
    account: {
      id: String(a.id || ""), name: String(a.name || ""), institution: a.institution ?? null, productType: a.productType ?? null,
      identifier: String(a.identifier || ""), role: String(a.role || ""), currency: String(a.currency || "EUR"), cashFlowEnabled: Boolean(a.cashFlowEnabled),
      balance: a.balance == null ? null : asNumber(a.balance), balanceDate: a.balanceDate ?? null, movements: asNumber(a.movements), firstDate: a.firstDate ?? null, lastDate: a.lastDate ?? null,
    },
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    balanceSeries: Array.isArray(raw.balanceSeries) ? raw.balanceSeries.map((point: any) => ({ month: String(point.month), balance: point.balance == null ? null : asNumber(point.balance) })) : [],
    recentMovements: Array.isArray(raw.recentMovements) ? raw.recentMovements.map((movement: any) => ({ ...movement, amount: asNumber(movement.amount), balance: movement.balance == null ? null : asNumber(movement.balance), needsReview: Boolean(movement.needsReview) })) : [],
  };
}
