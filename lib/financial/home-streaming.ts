import { createClient } from "@/lib/supabase/server";
import { asBoolean, asNumber, asRecord } from "@/lib/validation/json";
import type { FinancialDashboard } from "@/lib/financial/dashboard";
import type { BudgetMonth } from "@/lib/financial/budget";
import type { ReconciliationSummary } from "@/lib/financial/reconciliation";

export type HomeControlSummary={
  visibleAlerts:number;
  hiddenAlerts:number;
  closeReady:boolean;
  closeBlockers:number;
  closeWarnings:number;
};

export async function getHomeReconciliationSummary():Promise<ReconciliationSummary>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_reconciliation_summary");
  if(error||!data)throw new Error(error?.message||"reconciliation_summary_unavailable");
  const r=asRecord(data);
  return{
    total:asNumber(r.total),
    reconciled:asNumber(r.reconciled),
    pending:asNumber(r.pending),
    notReconciled:asNumber(r.notReconciled),
    notApplicable:asNumber(r.notApplicable),
  };
}

export async function getHomeControlSummary(dashboard:FinancialDashboard,budget:BudgetMonth):Promise<HomeControlSummary>{
  const supabase=await createClient();
  const month=/^\d{4}-\d{2}$/.test(dashboard.month)?`${dashboard.month}-01`:null;
  const {data,error}=await supabase.rpc("financial_app_control_summary",{
    p_month:month,
    p_cash_flow:{income:dashboard.income,expenses:dashboard.expenses,net:dashboard.cashFlow},
    p_budget:budget,
  });
  if(error||!data)throw new Error(error?.message||"control_summary_unavailable");
  const r=asRecord(data);
  return{
    visibleAlerts:asNumber(r.visibleAlerts),
    hiddenAlerts:asNumber(r.hiddenAlerts),
    closeReady:asBoolean(r.closeReady),
    closeBlockers:asNumber(r.closeBlockers),
    closeWarnings:asNumber(r.closeWarnings),
  };
}
