import { createClient } from "@/lib/supabase/server";

export type AnalysisMonth = { month:string; observed:boolean; income:number|null; expenses:number|null; net:number|null; movements:number|null; previousIncome:number|null; previousExpenses:number|null; previousNet:number|null };
export type AnalysisCategory = { category:string; amount:number; movements:number; previousAmount:number; changePercent:number|null };
export type AnalysisCounterparty = { name:string; amount:number; movements:number };
export type HighExpenseMonth = { month:string; expenses:number; deviationPercent:number };
export type AnalysisOverview = {
  version:string;year:number;previousYear:number;throughMonth:number;years:number[];income:number;expenses:number;net:number;previousIncome:number;previousExpenses:number;previousNet:number;
  incomeChangePercent:number|null;expenseChangePercent:number|null;netChange:number;monthsObserved:number;averageMonthlyIncome:number;averageMonthlyExpenses:number;savingsRatePercent:number;
  monthly:AnalysisMonth[];categories:AnalysisCategory[];merchants:AnalysisCounterparty[];incomeSources:AnalysisCounterparty[];highExpenseMonths:HighExpenseMonth[];
};
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
export async function getAnalysisOverview(year?:number):Promise<AnalysisOverview>{
  const supabase=await createClient();
  const pYear=Number.isInteger(year)&&Number(year)>=2000&&Number(year)<=2100?Number(year):new Date().getFullYear();
  const {data,error}=await supabase.rpc("financial_app_analysis_overview",{p_year:pYear});
  if(error||!data) throw new Error(error?.message||"analysis_unavailable");
  const r:any=data;
  return {version:String(r.version||"0.9.0"),year:n(r.year),previousYear:n(r.previousYear),throughMonth:n(r.throughMonth),years:Array.isArray(r.years)?r.years.map(n):[],income:n(r.income),expenses:n(r.expenses),net:n(r.net),previousIncome:n(r.previousIncome),previousExpenses:n(r.previousExpenses),previousNet:n(r.previousNet),incomeChangePercent:r.incomeChangePercent==null?null:n(r.incomeChangePercent),expenseChangePercent:r.expenseChangePercent==null?null:n(r.expenseChangePercent),netChange:n(r.netChange),monthsObserved:n(r.monthsObserved),averageMonthlyIncome:n(r.averageMonthlyIncome),averageMonthlyExpenses:n(r.averageMonthlyExpenses),savingsRatePercent:n(r.savingsRatePercent),monthly:Array.isArray(r.monthly)?r.monthly.map((m:any)=>({month:String(m.month),observed:Boolean(m.observed),income:m.income==null?null:n(m.income),expenses:m.expenses==null?null:n(m.expenses),net:m.net==null?null:n(m.net),movements:m.movements==null?null:n(m.movements),previousIncome:m.previousIncome==null?null:n(m.previousIncome),previousExpenses:m.previousExpenses==null?null:n(m.previousExpenses),previousNet:m.previousNet==null?null:n(m.previousNet)})):[],categories:Array.isArray(r.categories)?r.categories.map((c:any)=>({category:String(c.category),amount:n(c.amount),movements:n(c.movements),previousAmount:n(c.previousAmount),changePercent:c.changePercent==null?null:n(c.changePercent)})):[],merchants:Array.isArray(r.merchants)?r.merchants.map((x:any)=>({name:String(x.name),amount:n(x.amount),movements:n(x.movements)})):[],incomeSources:Array.isArray(r.incomeSources)?r.incomeSources.map((x:any)=>({name:String(x.name),amount:n(x.amount),movements:n(x.movements)})):[],highExpenseMonths:Array.isArray(r.highExpenseMonths)?r.highExpenseMonths.map((x:any)=>({month:String(x.month),expenses:n(x.expenses),deviationPercent:n(x.deviationPercent)})):[]};
}
