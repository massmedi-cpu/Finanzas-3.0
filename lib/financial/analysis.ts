import { createClient } from "@/lib/supabase/server";

const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const maybeNumber=(v:unknown)=>v==null?null:n(v);

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

export async function getAnalysisOverview(year?:number):Promise<AnalysisOverview>{
  const supabase=await createClient();
  const requested=Number.isInteger(year)&&year!>=2000&&year!<=2100?year:new Date().getFullYear();
  const {data,error}=await supabase.rpc("financial_app_analysis_overview",{p_year:requested});
  if(error||!data) throw new Error(error?.message||"analysis_unavailable");
  const r=data as any;
  return {
    version:String(r.version||"0.9.0"),year:n(r.year),periodStart:String(r.periodStart||""),periodEnd:String(r.periodEnd||""),comparisonYear:n(r.comparisonYear),comparisonPeriodEnd:String(r.comparisonPeriodEnd||""),
    income:n(r.income),expenses:n(r.expenses),net:n(r.net),movements:n(r.movements),priorIncome:n(r.priorIncome),priorExpenses:n(r.priorExpenses),priorNet:n(r.priorNet),priorMovements:n(r.priorMovements),
    incomeChangePercent:maybeNumber(r.incomeChangePercent),expenseChangePercent:maybeNumber(r.expenseChangePercent),netChange:n(r.netChange),uncategorizedCount:n(r.uncategorizedCount),uncategorizedAmount:n(r.uncategorizedAmount),
    monthly:Array.isArray(r.monthly)?r.monthly.map((m:any)=>({month:String(m.month),label:String(m.label),income:n(m.income),expenses:n(m.expenses),net:n(m.net),priorIncome:maybeNumber(m.priorIncome),priorExpenses:maybeNumber(m.priorExpenses),priorNet:maybeNumber(m.priorNet),available:Boolean(m.available),partial:Boolean(m.partial),complete:Boolean(m.complete)})):[],
    categories:Array.isArray(r.categories)?r.categories.map((x:any)=>({category:String(x.category),amount:n(x.amount),movements:n(x.movements),share:n(x.share)})):[],
    merchants:Array.isArray(r.merchants)?r.merchants.map((x:any)=>({merchant:String(x.merchant),amount:n(x.amount),movements:n(x.movements)})):[],
    deviations:Array.isArray(r.deviations)?r.deviations.map((x:any)=>({category:String(x.category),current:n(x.current),previous3MonthAverage:n(x.previous3MonthAverage),changePercent:maybeNumber(x.changePercent)})):[],
    years:Array.isArray(r.years)?r.years.map(Number).filter(Number.isFinite):[],
    rules:{samePeriodComparison:Boolean(r.rules?.samePeriodComparison),partialMonthUsesSameElapsedDays:Boolean(r.rules?.partialMonthUsesSameElapsedDays),excludeSavings:Boolean(r.rules?.excludeSavings),excludeInternalTransfers:Boolean(r.rules?.excludeInternalTransfers),excludeDuplicates:Boolean(r.rules?.excludeDuplicates),respectCashFlowOverride:Boolean(r.rules?.respectCashFlowOverride)}
  };
}
