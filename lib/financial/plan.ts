import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";

export type PlanStatus="stable"|"attention"|"critical";
export type PlanSeverity="critical"|"high"|"medium"|"low";
export type PlanAction={key:string;severity:PlanSeverity;domain:string;title:string;detail:string;href:string;value:number|null;unit:string|null;date:string|null;sourcePath:string};
export type PlanSummary={
  monthlyIncome:number;monthlyExpenses:number;monthlyNet:number;
  budgetAssigned:number;budgetSpent:number;budgetAvailable:number;budgetProjectedDifference:number|null;
  forecastCurrentBalance:number;forecastProjectedBalance90:number;forecastLowestBalance90:number;forecastProjectedNet90:number;
  netWorth:number;projectedNetWorth90:number;goalMonthlyRequired:number;goalCapacityReference:number;capacityAfterGoals:number;
};
export type PlanOverview={
  version:string;asOf:string;month:string;status:PlanStatus;summary:PlanSummary;
  domains:{
    budget:{assigned:number;spent:number;available:number;overBudgetCount:number;unbudgetedSpent:number;projection:{projectedSpent:number;projectedDifference:number|null;method:string};href:string};
    forecast:{currentBalance:number;projectedBalance:number;projectedNet:number;lowestBalance:number;firstNegativeDate:string|null;eventCount:number;suggestionCount:number;href:string};
    goals:{capacityReference:number;capacityReferenceMethod:string;summary:{activeCount:number;targetTotal:number;trackedTotal:number;remainingTotal:number;monthlyRequired:number;achievedCount:number;attentionCount:number;overdueCount:number;sourceMissingCount:number};href:string};
    netWorth:{assets:number;liabilities:number;netWorth:number;projectedNetWorth90:number;forecastImpact90:number;coverage:{knownAccounts:number;accountCount:number;currentComplete:boolean};href:string};
    control:{snapshot:{income:number;expenses:number;net:number;needsReview:number;duplicates:number;unreconciled:number;overBudgetCount:number;unbudgetedSpent:number;closeBlockers:number;closeWarnings:number;closeReady:boolean};visibleAlertCount:number;hiddenAlertCount:number;href:string};
  };
  actions:PlanAction[];actionSummary:{total:number;critical:number;high:number;medium:number};
  rules:{readOnlyDecisionLayer:boolean;noAutomaticFinancialMutations:boolean;forecastDays:number;forecastSuggestionsAffectProjection:boolean;goalCapacityMethod:string;sourceFunctions:string[]};
};

const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const nullable=(value:unknown)=>value==null||value===""?null:n(value);
const severity=(value:unknown):PlanSeverity=>["critical","high","medium","low"].includes(String(value))?String(value) as PlanSeverity:"low";

export function normalizeFinancialPlan(raw:any):PlanOverview{
  const summary=raw?.summary||{};const domains=raw?.domains||{};const b=domains.budget||{};const f=domains.forecast||{};const g=domains.goals||{};const nw=domains.netWorth||{};const c=domains.control||{};const gs=g.summary||{};const cs=c.snapshot||{};
  return {
    version:String(raw?.version||APP_VERSION),asOf:String(raw?.asOf||new Date().toISOString().slice(0,10)),month:String(raw?.month||new Date().toISOString().slice(0,7)),status:["critical","attention"].includes(String(raw?.status))?raw.status:"stable",
    summary:{monthlyIncome:n(summary.monthlyIncome),monthlyExpenses:n(summary.monthlyExpenses),monthlyNet:n(summary.monthlyNet),budgetAssigned:n(summary.budgetAssigned),budgetSpent:n(summary.budgetSpent),budgetAvailable:n(summary.budgetAvailable),budgetProjectedDifference:nullable(summary.budgetProjectedDifference),forecastCurrentBalance:n(summary.forecastCurrentBalance),forecastProjectedBalance90:n(summary.forecastProjectedBalance90),forecastLowestBalance90:n(summary.forecastLowestBalance90),forecastProjectedNet90:n(summary.forecastProjectedNet90),netWorth:n(summary.netWorth),projectedNetWorth90:n(summary.projectedNetWorth90),goalMonthlyRequired:n(summary.goalMonthlyRequired),goalCapacityReference:n(summary.goalCapacityReference),capacityAfterGoals:n(summary.capacityAfterGoals)},
    domains:{
      budget:{assigned:n(b.assigned),spent:n(b.spent),available:n(b.available),overBudgetCount:n(b.overBudgetCount),unbudgetedSpent:n(b.unbudgetedSpent),projection:{projectedSpent:n(b.projection?.projectedSpent),projectedDifference:nullable(b.projection?.projectedDifference),method:String(b.projection?.method||"")},href:String(b.href||"/presupuesto")},
      forecast:{currentBalance:n(f.currentBalance),projectedBalance:n(f.projectedBalance),projectedNet:n(f.projectedNet),lowestBalance:n(f.lowestBalance),firstNegativeDate:f.firstNegativeDate||null,eventCount:n(f.eventCount),suggestionCount:n(f.suggestionCount),href:String(f.href||"/prevision")},
      goals:{capacityReference:n(g.capacityReference),capacityReferenceMethod:String(g.capacityReferenceMethod||""),summary:{activeCount:n(gs.activeCount),targetTotal:n(gs.targetTotal),trackedTotal:n(gs.trackedTotal),remainingTotal:n(gs.remainingTotal),monthlyRequired:n(gs.monthlyRequired),achievedCount:n(gs.achievedCount),attentionCount:n(gs.attentionCount),overdueCount:n(gs.overdueCount),sourceMissingCount:n(gs.sourceMissingCount)},href:String(g.href||"/objetivos")},
      netWorth:{assets:n(nw.assets),liabilities:n(nw.liabilities),netWorth:n(nw.netWorth),projectedNetWorth90:n(nw.projectedNetWorth90),forecastImpact90:n(nw.forecastImpact90),coverage:{knownAccounts:n(nw.coverage?.knownAccounts),accountCount:n(nw.coverage?.accountCount),currentComplete:Boolean(nw.coverage?.currentComplete)},href:String(nw.href||"/patrimonio")},
      control:{snapshot:{income:n(cs.income),expenses:n(cs.expenses),net:n(cs.net),needsReview:n(cs.needsReview),duplicates:n(cs.duplicates),unreconciled:n(cs.unreconciled),overBudgetCount:n(cs.overBudgetCount),unbudgetedSpent:n(cs.unbudgetedSpent),closeBlockers:n(cs.closeBlockers),closeWarnings:n(cs.closeWarnings),closeReady:Boolean(cs.closeReady)},visibleAlertCount:n(c.visibleAlertCount),hiddenAlertCount:n(c.hiddenAlertCount),href:String(c.href||"/control")},
    },
    actions:Array.isArray(raw?.actions)?raw.actions.map((a:any,index:number)=>({key:String(a.key||a.sourcePath||`plan-action-${index}`),severity:severity(a.severity),domain:String(a.domain||"control"),title:String(a.title||"Revisar"),detail:String(a.detail||""),href:String(a.href||"/control"),value:a.value==null?null:n(a.value),unit:a.unit||null,date:a.date||null,sourcePath:String(a.sourcePath||"")})):[],
    actionSummary:{total:n(raw?.actionSummary?.total),critical:n(raw?.actionSummary?.critical),high:n(raw?.actionSummary?.high),medium:n(raw?.actionSummary?.medium)},
    rules:{readOnlyDecisionLayer:Boolean(raw?.rules?.readOnlyDecisionLayer),noAutomaticFinancialMutations:Boolean(raw?.rules?.noAutomaticFinancialMutations),forecastDays:n(raw?.rules?.forecastDays)||90,forecastSuggestionsAffectProjection:Boolean(raw?.rules?.forecastSuggestionsAffectProjection),goalCapacityMethod:String(raw?.rules?.goalCapacityMethod||""),sourceFunctions:Array.isArray(raw?.rules?.sourceFunctions)?raw.rules.sourceFunctions.map(String):[]},
  };
}

export async function getFinancialPlan(month?:string|null):Promise<PlanOverview>{
  const supabase=await createClient();
  const pMonth=month&&/^\d{4}-\d{2}$/.test(month)?`${month}-01`:new Date().toISOString().slice(0,10);
  const {data,error}=await supabase.rpc("financial_app_plan_overview",{p_month:pMonth});
  if(error||!data)throw new Error(error?.message||"financial_plan_unavailable");
  return normalizeFinancialPlan(data);
}
