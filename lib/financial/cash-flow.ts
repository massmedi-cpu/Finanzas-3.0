import { createClient } from "@/lib/supabase/server";

export type CashFlowMonth = { month:string; income:number; expenses:number; net:number; accumulated:number };
export type CashFlowCategory = { category:string; amount:number };
export type CashFlowData = {
  version:string; year:number; years:number[]; income:number; expenses:number; net:number;
  positiveMonths:number; negativeMonths:number; monthly:CashFlowMonth[]; topExpenseCategories:CashFlowCategory[];
  excluded:{ savings:number; internalTransfers:number; duplicates:number; manual:number };
  rules:{ savingsAlwaysExcluded:boolean; internalTransfersExcluded:boolean; duplicatesExcluded:boolean; sourceMissingExcluded:boolean };
};

const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;

export async function getCashFlow(year:number):Promise<CashFlowData>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_cash_flow",{p_year:year});
  if(error||!data) throw new Error(error?.message||"cash_flow_unavailable");
  const raw=data as any;
  return {
    version:String(raw.version||"0.5.0"), year:n(raw.year), years:Array.isArray(raw.years)?raw.years.map(n):[],
    income:n(raw.income), expenses:n(raw.expenses), net:n(raw.net), positiveMonths:n(raw.positiveMonths), negativeMonths:n(raw.negativeMonths),
    monthly:Array.isArray(raw.monthly)?raw.monthly.map((m:any)=>({month:String(m.month),income:n(m.income),expenses:n(m.expenses),net:n(m.net),accumulated:n(m.accumulated)})):[],
    topExpenseCategories:Array.isArray(raw.topExpenseCategories)?raw.topExpenseCategories.map((c:any)=>({category:String(c.category),amount:n(c.amount)})):[],
    excluded:{savings:n(raw.excluded?.savings),internalTransfers:n(raw.excluded?.internalTransfers),duplicates:n(raw.excluded?.duplicates),manual:n(raw.excluded?.manual)},
    rules:{savingsAlwaysExcluded:Boolean(raw.rules?.savingsAlwaysExcluded),internalTransfersExcluded:Boolean(raw.rules?.internalTransfersExcluded),duplicatesExcluded:Boolean(raw.rules?.duplicatesExcluded),sourceMissingExcluded:Boolean(raw.rules?.sourceMissingExcluded)}
  };
}
