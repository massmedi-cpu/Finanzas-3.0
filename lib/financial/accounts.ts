import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString, nullableNumber, nullableString, recordArray } from "@/lib/validation/json";
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

export type HomeAccount = {
  id: string;
  name: string;
  identifier: string;
  role: string;
  balance: number | null;
  balanceDate: string | null;
  previousBalance: number | null;
};

export type HomeAccountsOverview = {
  version: string;
  month: string;
  accounts: HomeAccount[];
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

function normalizeSource(value: unknown): AccountSource {
  const raw=asRecord(value);
  return {identifier:asString(raw.identifier),label:asString(raw.label),primary:asBoolean(raw.primary)};
}

function normalizeBalancePoint(value: unknown): BalancePoint {
  const raw=asRecord(value);
  return {month:asString(raw.month),balance:nullableNumber(raw.balance)};
}

function normalizeAccount(value: unknown): FinancialAccount {
  const raw=asRecord(value);
  return {
    id:asString(raw.id),name:asString(raw.name),institution:nullableString(raw.institution),productType:nullableString(raw.productType),identifier:asString(raw.identifier),role:asString(raw.role),currency:asString(raw.currency,"EUR"),cashFlowEnabled:asBoolean(raw.cashFlowEnabled),
    balance:nullableNumber(raw.balance),balanceDate:nullableString(raw.balanceDate),movements:asNumber(raw.movements),firstDate:nullableString(raw.firstDate),lastDate:nullableString(raw.lastDate),
    monthIncome:asNumber(raw.monthIncome),monthExpenses:asNumber(raw.monthExpenses),monthNet:asNumber(raw.monthNet),
    balanceSeries:asArray(raw.balanceSeries).map(normalizeBalancePoint),sources:asArray(raw.sources).map(normalizeSource),
  };
}

function normalizeHomeAccount(value: unknown): HomeAccount {
  const raw=asRecord(value);
  return {
    id:asString(raw.id),
    name:asString(raw.name),
    identifier:asString(raw.identifier),
    role:asString(raw.role),
    balance:nullableNumber(raw.balance),
    balanceDate:nullableString(raw.balanceDate),
    previousBalance:nullableNumber(raw.previousBalance),
  };
}

function normalizeMovement(value: unknown): AccountMovement {
  const raw=asRecord(value);
  return {
    id:asString(raw.id),sourceId:asString(raw.sourceId),date:asString(raw.date),concept:nullableString(raw.concept),counterparty:nullableString(raw.counterparty),category:nullableString(raw.category),type:nullableString(raw.type),
    amount:asNumber(raw.amount),balance:nullableNumber(raw.balance),sourceIdentifier:nullableString(raw.sourceIdentifier),needsReview:asBoolean(raw.needsReview),
  };
}

export async function getAccountsOverview(): Promise<AccountsOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_app_accounts");
  if (error || !data) throw new Error(error?.message || "accounts_unavailable");
  const raw=asRecord(data);
  return {
    version:asString(raw.version,APP_VERSION),month:asString(raw.month),totalAvailable:asNumber(raw.totalAvailable),accounts:recordArray(raw.accounts).map(normalizeAccount),
  };
}

export async function getHomeAccountsOverview(): Promise<HomeAccountsOverview> {
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_home_accounts");
  if(error||!data)throw new Error(error?.message||"home_accounts_unavailable");
  const raw=asRecord(data);
  return {
    version:asString(raw.version,APP_VERSION),
    month:asString(raw.month),
    accounts:recordArray(raw.accounts).map(normalizeHomeAccount),
  };
}

export async function getAccountDetail(id: string): Promise<AccountDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_app_account_detail", { p_account_id: id });
  if (error || !data) throw new Error(error?.message || "account_unavailable");
  const raw=asRecord(data);
  const account=normalizeAccount(raw.account);
  return {
    version:asString(raw.version,APP_VERSION),
    account:{id:account.id,name:account.name,institution:account.institution,productType:account.productType,identifier:account.identifier,role:account.role,currency:account.currency,cashFlowEnabled:account.cashFlowEnabled,balance:account.balance,balanceDate:account.balanceDate,movements:account.movements,firstDate:account.firstDate,lastDate:account.lastDate},
    sources:asArray(raw.sources).map(normalizeSource),balanceSeries:asArray(raw.balanceSeries).map(normalizeBalancePoint),recentMovements:asArray(raw.recentMovements).map(normalizeMovement),
  };
}
