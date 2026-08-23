import { APP_VERSION } from "@/lib/app-version";
import { madridToday } from "@/lib/time/madrid";
import { createClient } from "@/lib/supabase/server";

export type BudgetStatus="correct"|"attention"|"exceeded";
export type BudgetItem = {
  id:string;name:string;category:string;subcategory:string|null;assigned:number;spent:number;carryover:boolean;carryIn:number;available:number;percent:number;suggestion:number;movements:number;notes:string|null;
  projectedSpend:number|null;projectedDifference:number|null;status:BudgetStatus;daysRemaining:number;
};
export type UnbudgetedItem={category:string;subcategory:string|null;spent:number;suggestion:number;movements:number};
export type BudgetAnnualMonth={month:string;assigned:number;budgetedSpent:number;totalSpent:number;difference:number|null};
export type BudgetMonth={
  version:string;month:string;assigned:number;spent:number;available:number;overBudgetCount:number;unbudgetedSpent:number;budgets:BudgetItem[];unbudgeted:UnbudgetedItem[];categories:string[];
  calendar:{daysInMonth:number;daysElapsed:number;daysRemaining:number};
  projection:{projectedSpent:number;projectedDifference:number|null;method:"not_started"|"actual_closed"|"current_daily_rate"|string};
  annual:{year:number;assigned:number;budgetedSpent:number;totalSpent:number;difference:number|null;months:BudgetAnnualMonth[]};
};
const asNumber=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const nullableNumber=(value:unknown)=>value==null?null:asNumber(value);
function normalizeBudget(raw:any):BudgetItem{return {
  id:String(raw.id),name:String(raw.name||raw.category||"Presupuesto"),category:String(raw.category||"Sin categoría"),subcategory:raw.subcategory||null,
  assigned:asNumber(raw.assigned),spent:asNumber(raw.spent),carryover:Boolean(raw.carryover),carryIn:asNumber(raw.carryIn),available:asNumber(raw.available),percent:asNumber(raw.percent),suggestion:asNumber(raw.suggestion),movements:asNumber(raw.movements),notes:raw.notes||null,
  projectedSpend:nullableNumber(raw.projectedSpend),projectedDifference:nullableNumber(raw.projectedDifference),status:["attention","exceeded"].includes(String(raw.status))?String(raw.status) as BudgetStatus:"correct",daysRemaining:asNumber(raw.daysRemaining),
};}
export async function getBudgetMonth(month?:string):Promise<BudgetMonth>{
  const supabase=await createClient();
  const pMonth=month&&/^\d{4}-\d{2}$/.test(month)?`${month}-01`:madridToday();
  const {data,error}=await supabase.rpc("financial_app_budget_month",{p_month:pMonth});
  if(error||!data)throw new Error(error?.message||"budget_unavailable");
  const raw=data as any;
  return {
    version:String(raw.version||APP_VERSION),month:String(raw.month||pMonth.slice(0,7)),assigned:asNumber(raw.assigned),spent:asNumber(raw.spent),available:asNumber(raw.available),overBudgetCount:asNumber(raw.overBudgetCount),unbudgetedSpent:asNumber(raw.unbudgetedSpent),
    budgets:Array.isArray(raw.budgets)?raw.budgets.map(normalizeBudget):[],
    unbudgeted:Array.isArray(raw.unbudgeted)?raw.unbudgeted.map((item:any)=>({category:String(item.category||"Sin categoría"),subcategory:item.subcategory||null,spent:asNumber(item.spent),suggestion:asNumber(item.suggestion),movements:asNumber(item.movements)})):[],
    categories:Array.isArray(raw.categories)?raw.categories.map(String):[],
    calendar:{daysInMonth:asNumber(raw.calendar?.daysInMonth),daysElapsed:asNumber(raw.calendar?.daysElapsed),daysRemaining:asNumber(raw.calendar?.daysRemaining)},
    projection:{projectedSpent:asNumber(raw.projection?.projectedSpent),projectedDifference:nullableNumber(raw.projection?.projectedDifference),method:String(raw.projection?.method||"")},
    annual:{year:asNumber(raw.annual?.year),assigned:asNumber(raw.annual?.assigned),budgetedSpent:asNumber(raw.annual?.budgetedSpent),totalSpent:asNumber(raw.annual?.totalSpent),difference:nullableNumber(raw.annual?.difference),months:Array.isArray(raw.annual?.months)?raw.annual.months.map((m:any)=>({month:String(m.month),assigned:asNumber(m.assigned),budgetedSpent:asNumber(m.budgetedSpent),totalSpent:asNumber(m.totalSpent),difference:nullableNumber(m.difference)})):[]},
  };
}
