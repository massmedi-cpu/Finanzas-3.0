import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString, nullableNumber } from "@/lib/validation/json";

export type AnalysisMonth={month:string;label:string;income:number;expenses:number;net:number;priorIncome:number|null;priorExpenses:number|null;priorNet:number|null;available:boolean;partial:boolean;complete:boolean};
export type AnalysisCategory={category:string;amount:number;movements:number;share:number};
export type AnalysisMerchant={merchant:string;amount:number;movements:number};
export type AnalysisDeviation={category:string;current:number;previous3MonthAverage:number;changePercent:number|null};
export type AnalysisOverview={
  version:string;year:number;periodStart:string;periodEnd:string;comparisonYear:number;comparisonPeriodEnd:string;
  income:number;expenses:number;net:number;movements:number;priorIncome:number;priorExpenses:number;priorNet:number;priorMovements:number;
  incomeChangePercent:number|null;expenseChangePercent:number|null;netChange:number;uncategorizedCount:number;uncategorizedAmount:number;
  monthly:AnalysisMonth[];categories:AnalysisCategory[];merchants:AnalysisMerchant[];deviations:AnalysisDeviation[];years:number[];
  rules:{samePeriodComparison:boolean;partialMonthUsesSameElapsedDays:boolean;excludeSavings:boolean;excludeInternalTransfers:boolean;excludeDuplicates:boolean;respectCashFlowOverride:boolean};
};

function parseOverview(data:unknown):AnalysisOverview{
  const r=asRecord(data);const rules=asRecord(r.rules);
  return {
    version:asString(r.version,APP_VERSION),year:asNumber(r.year),periodStart:asString(r.periodStart),periodEnd:asString(r.periodEnd),comparisonYear:asNumber(r.comparisonYear),comparisonPeriodEnd:asString(r.comparisonPeriodEnd),
    income:asNumber(r.income),expenses:asNumber(r.expenses),net:asNumber(r.net),movements:asNumber(r.movements),priorIncome:asNumber(r.priorIncome),priorExpenses:asNumber(r.priorExpenses),priorNet:asNumber(r.priorNet),priorMovements:asNumber(r.priorMovements),
    incomeChangePercent:nullableNumber(r.incomeChangePercent),expenseChangePercent:nullableNumber(r.expenseChangePercent),netChange:asNumber(r.netChange),uncategorizedCount:asNumber(r.uncategorizedCount),uncategorizedAmount:asNumber(r.uncategorizedAmount),
    monthly:asArray(r.monthly).map(value=>{const m=asRecord(value);return{month:asString(m.month),label:asString(m.label),income:asNumber(m.income),expenses:asNumber(m.expenses),net:asNumber(m.net),priorIncome:nullableNumber(m.priorIncome),priorExpenses:nullableNumber(m.priorExpenses),priorNet:nullableNumber(m.priorNet),available:asBoolean(m.available),partial:asBoolean(m.partial),complete:asBoolean(m.complete)}}),
    categories:asArray(r.categories).map(value=>{const x=asRecord(value);return{category:asString(x.category),amount:asNumber(x.amount),movements:asNumber(x.movements),share:asNumber(x.share)}}),
    merchants:asArray(r.merchants).map(value=>{const x=asRecord(value);return{merchant:asString(x.merchant),amount:asNumber(x.amount),movements:asNumber(x.movements)}}),
    deviations:asArray(r.deviations).map(value=>{const x=asRecord(value);return{category:asString(x.category),current:asNumber(x.current),previous3MonthAverage:asNumber(x.previous3MonthAverage),changePercent:nullableNumber(x.changePercent)}}),
    years:asArray(r.years).map(asNumber).filter(value=>Number.isFinite(value)),
    rules:{samePeriodComparison:asBoolean(rules.samePeriodComparison),partialMonthUsesSameElapsedDays:asBoolean(rules.partialMonthUsesSameElapsedDays),excludeSavings:asBoolean(rules.excludeSavings),excludeInternalTransfers:asBoolean(rules.excludeInternalTransfers),excludeDuplicates:asBoolean(rules.excludeDuplicates),respectCashFlowOverride:asBoolean(rules.respectCashFlowOverride)}
  };
}

export async function getAnalysisOverview(year?:number):Promise<AnalysisOverview>{
  const supabase=await createClient();
  const requested=Number.isInteger(year)&&year!>=2000&&year!<=2100?year:new Date().getFullYear();
  const {data,error}=await supabase.rpc("financial_app_analysis_overview",{p_year:requested});
  if(error||!data) throw new Error(error?.message||"analysis_unavailable");
  return parseOverview(data);
}

export async function getAnalysisOverviewPeriod(from:string,to:string):Promise<AnalysisOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_analysis_overview_period",{p_from:from,p_to:to});
  if(error||!data) throw new Error(error?.message||"analysis_period_unavailable");
  return parseOverview(data);
}
