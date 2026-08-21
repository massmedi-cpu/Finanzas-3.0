import { createClient } from "@/lib/supabase/server";

export type BankNetWorthItem = {
  id: string;
  kind: "bank";
  name: string;
  identifier: string;
  role: string;
  balance: number | null;
  balanceDate: string | null;
  automatic: boolean;
};

export type ManualNetWorthItem = {
  id: string;
  kind: "manual";
  name: string;
  itemType: "asset" | "liability";
  category: string | null;
  value: number;
  valuationDate: string;
  includeInTotal: boolean;
  notes: string | null;
  active: boolean;
};

export type NetWorthHistoryPoint = {
  month: string;
  bankNet: number;
  manualNet: number;
  netWorth: number | null;
  complete: boolean;
  knownAccounts: number;
  accountCount: number;
};

export type NetWorthOverview = {
  version: string;
  asOf: string;
  assets: number;
  liabilities: number;
  netWorth: number;
  bankAssets: number;
  manualAssets: number;
  manualLiabilities: number;
  forecastImpact90: number;
  projectedNetWorth90: number;
  changeFromFirstCompletePercent: number;
  bankItems: BankNetWorthItem[];
  manualItems: ManualNetWorthItem[];
  history: NetWorthHistoryPoint[];
  coverage: { knownAccounts: number; accountCount: number; currentComplete: boolean };
  rules: {
    manualItemsRequireUserAction: boolean;
    forecastUsesSavedOnly: boolean;
    suggestionsAffectProjection: boolean;
    incompleteHistoricalMonthsAreNull: boolean;
  };
};

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function normalizeNetWorth(raw: any): NetWorthOverview {
  return {
    version: String(raw?.version || "0.8.0"),
    asOf: String(raw?.asOf || new Date().toISOString().slice(0, 10)),
    assets: n(raw?.assets),
    liabilities: n(raw?.liabilities),
    netWorth: n(raw?.netWorth),
    bankAssets: n(raw?.bankAssets),
    manualAssets: n(raw?.manualAssets),
    manualLiabilities: n(raw?.manualLiabilities),
    forecastImpact90: n(raw?.forecastImpact90),
    projectedNetWorth90: n(raw?.projectedNetWorth90),
    changeFromFirstCompletePercent: n(raw?.changeFromFirstCompletePercent),
    bankItems: Array.isArray(raw?.bankItems) ? raw.bankItems.map((item: any) => ({
      id: String(item.id), kind: "bank" as const, name: String(item.name), identifier: String(item.identifier || ""), role: String(item.role || "other"),
      balance: item.balance == null ? null : n(item.balance), balanceDate: item.balanceDate || null, automatic: Boolean(item.automatic),
    })) : [],
    manualItems: Array.isArray(raw?.manualItems) ? raw.manualItems.map((item: any) => ({
      id: String(item.id), kind: "manual" as const, name: String(item.name), itemType: item.itemType === "liability" ? "liability" as const : "asset" as const,
      category: item.category || null, value: n(item.value), valuationDate: String(item.valuationDate), includeInTotal: Boolean(item.includeInTotal), notes: item.notes || null, active: Boolean(item.active),
    })) : [],
    history: Array.isArray(raw?.history) ? raw.history.map((point: any) => ({
      month: String(point.month), bankNet: n(point.bankNet), manualNet: n(point.manualNet), netWorth: point.netWorth == null ? null : n(point.netWorth),
      complete: Boolean(point.complete), knownAccounts: n(point.knownAccounts), accountCount: n(point.accountCount),
    })) : [],
    coverage: { knownAccounts: n(raw?.coverage?.knownAccounts), accountCount: n(raw?.coverage?.accountCount), currentComplete: Boolean(raw?.coverage?.currentComplete) },
    rules: {
      manualItemsRequireUserAction: Boolean(raw?.rules?.manualItemsRequireUserAction), forecastUsesSavedOnly: Boolean(raw?.rules?.forecastUsesSavedOnly),
      suggestionsAffectProjection: Boolean(raw?.rules?.suggestionsAffectProjection), incompleteHistoricalMonthsAreNull: Boolean(raw?.rules?.incompleteHistoricalMonthsAreNull),
    },
  };
}

export async function getNetWorthOverview(months = 18): Promise<NetWorthOverview> {
  const supabase = await createClient();
  const safeMonths = Math.max(6, Math.min(60, Number.isFinite(months) ? Math.trunc(months) : 18));
  const { data, error } = await supabase.rpc("financial_app_net_worth_overview", { p_months: safeMonths });
  if (error || !data) throw new Error(error?.message || "net_worth_unavailable");
  return normalizeNetWorth(data);
}
