import { createClient } from "@/lib/supabase/server";

export type DashboardAccount = {
  id: string;
  name: string;
  identifier: string;
  role: string;
  cashFlowEnabled: boolean;
  balance: number | null;
  balanceDate: string | null;
};

export type FinancialDashboard = {
  version: string;
  month: string;
  accounts: DashboardAccount[];
  totalAvailable: number;
  income: number;
  expenses: number;
  cashFlow: number;
  movementsTotal: number;
  needsReview: number;
  reviewSource: number;
  lastMovementDate: string | null;
  sync: {
    status: string;
    finishedAt: string | null;
    sourceModifiedAt: string | null;
    newCount: number;
    updatedCount: number;
    reviewCount: number;
  } | null;
};

export async function getFinancialDashboard(): Promise<FinancialDashboard> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_app_dashboard");
  if (error || !data) throw new Error(error?.message || "dashboard_unavailable");
  return data as FinancialDashboard;
}
