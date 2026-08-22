import { createClient } from "@/lib/supabase/server";

export type ControlSeverity="critical"|"high"|"medium"|"low";
export type ControlAlertState="open"|"resolved"|"dismissed"|"snoozed";
export type ControlSnapshot={
  month:string;monthStart:string;monthEnd:string;income:number;expenses:number;net:number;
  needsReview:number;duplicates:number;unreconciled:number;overBudgetCount:number;unbudgetedSpent:number;
  highExpenseThreshold:number;highExpenses:Array<{transactionId:string;date:string;amount:number;expense:number;category:string|null;subcategory:string|null;merchant:string|null}>;
  closeBlockers:number;closeWarnings:number;closeReady:boolean;
};
export type ControlAlert={
  key:string;type:string;severity:ControlSeverity;title:string;detail:string;href:string;state:ControlAlertState;
  count?:number;amount?:number;date?:string;merchant?:string|null;month?:string;snoozedUntil?:string|null;note?:string|null;
};
export type MonthClose={id:string;month:string;status:"closed"|"reopened";snapshot:ControlSnapshot;notes:string|null;closedAt:string;reopenedAt:string|null};
export type ControlOverview={
  version:string;month:string;snapshot:ControlSnapshot;previousMonthSnapshot:ControlSnapshot;alerts:ControlAlert[];hiddenAlertCount:number;
  alertHistory:Array<{key:string;state:ControlAlertState;snoozedUntil:string|null;note:string|null;updatedAt:string}>;closes:MonthClose[];
  rules:{highExpense:string;closeBlockers:string;closeWarnings:string};
};

const MONTH_RE=/^\d{4}-\d{2}$/;
export async function getControlCenter(month?:string|null):Promise<ControlOverview>{
  const supabase=await createClient();
  const pMonth=month&&MONTH_RE.test(month)?`${month}-01`:null;
  const {data,error}=await supabase.rpc("financial_app_control_center",{p_month:pMonth});
  if(error||!data)throw new Error(error?.message||"control_center_unavailable");
  return data as ControlOverview;
}
