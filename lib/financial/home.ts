import { createClient } from "@/lib/supabase/server";
import type { FinancialDashboard } from "@/lib/financial/dashboard";
import type { AccountsOverview } from "@/lib/financial/accounts";
import type { BudgetMonth } from "@/lib/financial/budget";
import type { ForecastOverview } from "@/lib/financial/forecast";
import type { AnalysisOverview } from "@/lib/financial/analysis";
import type { ReconciliationSummary } from "@/lib/financial/reconciliation";
export type HomeOverview={version:string;dashboard:FinancialDashboard;accounts:AccountsOverview;budget:BudgetMonth;forecast:ForecastOverview;analysis:AnalysisOverview;reconciliation:{version:string;summary:ReconciliationSummary};controlSummary:{visibleAlerts:number;hiddenAlerts:number;closeReady:boolean;closeBlockers:number;closeWarnings:number}};
export async function getHomeOverview():Promise<HomeOverview>{const supabase=await createClient();const{data,error}=await supabase.rpc("financial_app_home_overview");if(error||!data)throw new Error(error?.message||"home_unavailable");return data as HomeOverview}
