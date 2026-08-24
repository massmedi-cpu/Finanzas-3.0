import { APP_VERSION } from "@/lib/app-version";
import { madridToday } from "@/lib/time/madrid";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString, nullableNumber, nullableString } from "@/lib/validation/json";

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

function normalizeBudget(value:unknown):BudgetItem{const raw=asRecord(value);const rawStatus=asString(raw.status);return {
  id:asString(raw.id),name:asString(raw.name,asString(raw.category,"Presupuesto")),category:asString(raw.category,"Sin categoría"),subcategory:nullableString(raw.subcategory),
  assigned:asNumber(raw.assigned),spent:asNumber(raw.spent),carryover:asBoolean(raw.carryover),carryIn:asNumber(raw.carryIn),available:asNumber(raw.available),percent:asNumber(raw.percent),suggestion:asNumber(raw.suggestion),movements:asNumber(raw.movements),notes:nullableString(raw.notes),
  projectedSpend:nullableNumber(raw.projectedSpend),projectedDifference:nullableNumber(raw.projectedDifference),status:rawStatus==="attention"||rawStatus==="exceeded"?rawStatus:"correct",daysRemaining:asNumber(raw.daysRemaining),
};}

export async function getBudgetMonth(month?:string):Promise<BudgetMonth>{
  const supabase=await createClient();
  const pMonth=month&&/^\d{4}-\d{2}$/.test(month)?`${month}-01`:madridToday();
  const {data,error}=await supabase.rpc("financial_app_budget_month",{p_month:pMonth});
  if(error||!data)throw new Error(error?.message||"budget_unavailable");
  const raw=asRecord(data);const calendar=asRecord(raw.calendar);const projection=asRecord(raw.projection);const annual=asRecord(raw.annual);
  return {
    version:asString(raw.version,APP_VERSION),month:asString(raw.month,pMonth.slice(0,7)),assigned:asNumber(raw.assigned),spent:asNumber(raw.spent),available:asNumber(raw.available),overBudgetCount:asNumber(raw.overBudgetCount),unbudgetedSpent:asNumber(raw.unbudgetedSpent),
    budgets:asArray(raw.budgets).map(normalizeBudget),
    unbudgeted:asArray(raw.unbudgeted).map(value=>{const item=asRecord(value);return{category:asString(item.category,"Sin categoría"),subcategory:nullableString(item.subcategory),spent:asNumber(item.spent),suggestion:asNumber(item.suggestion),movements:asNumber(item.movements)}}),
    categories:asArray(raw.categories).map(value=>asString(value)),
    calendar:{daysInMonth:asNumber(calendar.daysInMonth),daysElapsed:asNumber(calendar.daysElapsed),daysRemaining:asNumber(calendar.daysRemaining)},
    projection:{projectedSpent:asNumber(projection.projectedSpent),projectedDifference:nullableNumber(projection.projectedDifference),method:asString(projection.method)},
    annual:{year:asNumber(annual.year),assigned:asNumber(annual.assigned),budgetedSpent:asNumber(annual.budgetedSpent),totalSpent:asNumber(annual.totalSpent),difference:nullableNumber(annual.difference),months:asArray(annual.months).map(value=>{const m=asRecord(value);return{month:asString(m.month),assigned:asNumber(m.assigned),budgetedSpent:asNumber(m.budgetedSpent),totalSpent:asNumber(m.totalSpent),difference:nullableNumber(m.difference)}})},
  };
}
