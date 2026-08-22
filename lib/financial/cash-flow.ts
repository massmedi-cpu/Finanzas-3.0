import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";

export type CashFlowMonth = { month:string; income:number; expenses:number; net:number; accumulated:number };
export type CashFlowCategory = { category:string; amount:number; movements?:number };
export type CashFlowMerchant = { merchant:string; amount:number; movements:number };
export type CashFlowPoint = { date:string; label:string; income:number; expenses:number; net:number; accumulated:number; movements:number };
export type CashFlowFacetAccount = { id:string; name:string; identifier:string };
export type CashFlowData = {
  version:string; year:number; years:number[]; income:number; expenses:number; net:number;
  positiveMonths:number; negativeMonths:number; monthly:CashFlowMonth[]; topExpenseCategories:CashFlowCategory[];
  excluded:{ savings:number; internalTransfers:number; duplicates:number; manual:number };
  rules:{ savingsAlwaysExcluded:boolean; internalTransfersExcluded:boolean; duplicatesExcluded:boolean; sourceMissingExcluded:boolean };
};
export type CashFlowRange = "day"|"week"|"month"|"quarter"|"year"|"historical"|"custom";
export type CashFlowRangeFilters = {range:CashFlowRange;anchor:string;dateFrom?:string|null;dateTo?:string|null;accountId?:string|null;category?:string|null;subcategory?:string|null;merchant?:string|null;type?:string|null};
export type CashFlowRangeData = {
  version:string;range:CashFlowRange;anchor:string;dateFrom:string;dateTo:string;bucket:"day"|"week"|"month";
  income:number;expenses:number;net:number;movements:number;positivePeriods:number;negativePeriods:number;
  series:CashFlowPoint[];topExpenseCategories:CashFlowCategory[];topMerchants:CashFlowMerchant[];
  facets:{accounts:CashFlowFacetAccount[];categories:string[];subcategories:string[];merchants:string[];types:string[]};
  filters:{accountId:string|null;category:string|null;subcategory:string|null;merchant:string|null;type:string|null};
  excluded:{savings:number;internalTransfers:number;duplicates:number;manual:number;sourceMissing:number};
  rules:{savingsAlwaysExcluded:boolean;internalTransfersExcluded:boolean;duplicatesExcluded:boolean;sourceMissingExcluded:boolean;personalSplitsApplied:boolean};
};

const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;

export async function getCashFlow(year:number):Promise<CashFlowData>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_cash_flow",{p_year:year});
  if(error||!data) throw new Error(error?.message||"cash_flow_unavailable");
  const raw=data as any;
  return {
    version:String(raw.version||APP_VERSION), year:n(raw.year), years:Array.isArray(raw.years)?raw.years.map(n):[],
    income:n(raw.income), expenses:n(raw.expenses), net:n(raw.net), positiveMonths:n(raw.positiveMonths), negativeMonths:n(raw.negativeMonths),
    monthly:Array.isArray(raw.monthly)?raw.monthly.map((m:any)=>({month:String(m.month),income:n(m.income),expenses:n(m.expenses),net:n(m.net),accumulated:n(m.accumulated)})):[],
    topExpenseCategories:Array.isArray(raw.topExpenseCategories)?raw.topExpenseCategories.map((c:any)=>({category:String(c.category),amount:n(c.amount),movements:n(c.movements)})):[],
    excluded:{savings:n(raw.excluded?.savings),internalTransfers:n(raw.excluded?.internalTransfers),duplicates:n(raw.excluded?.duplicates),manual:n(raw.excluded?.manual)},
    rules:{savingsAlwaysExcluded:Boolean(raw.rules?.savingsAlwaysExcluded),internalTransfersExcluded:Boolean(raw.rules?.internalTransfersExcluded),duplicatesExcluded:Boolean(raw.rules?.duplicatesExcluded),sourceMissingExcluded:Boolean(raw.rules?.sourceMissingExcluded)}
  };
}

export async function getCashFlowRange(filters:CashFlowRangeFilters):Promise<CashFlowRangeData>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_cash_flow_range",{
    p_range:filters.range,p_anchor:filters.anchor,p_date_from:filters.dateFrom||null,p_date_to:filters.dateTo||null,
    p_account_id:filters.accountId||null,p_category:filters.category||null,p_subcategory:filters.subcategory||null,p_merchant:filters.merchant||null,p_type:filters.type||null,
  });
  if(error||!data) throw new Error(error?.message||"cash_flow_range_unavailable");
  const r=data as any;
  return {
    version:String(r.version||APP_VERSION),range:String(r.range||filters.range) as CashFlowRange,anchor:String(r.anchor||filters.anchor),dateFrom:String(r.dateFrom||""),dateTo:String(r.dateTo||""),bucket:String(r.bucket||"month") as CashFlowRangeData["bucket"],
    income:n(r.income),expenses:n(r.expenses),net:n(r.net),movements:n(r.movements),positivePeriods:n(r.positivePeriods),negativePeriods:n(r.negativePeriods),
    series:Array.isArray(r.series)?r.series.map((x:any)=>({date:String(x.date),label:String(x.label),income:n(x.income),expenses:n(x.expenses),net:n(x.net),accumulated:n(x.accumulated),movements:n(x.movements)})):[],
    topExpenseCategories:Array.isArray(r.topExpenseCategories)?r.topExpenseCategories.map((x:any)=>({category:String(x.category),amount:n(x.amount),movements:n(x.movements)})):[],
    topMerchants:Array.isArray(r.topMerchants)?r.topMerchants.map((x:any)=>({merchant:String(x.merchant),amount:n(x.amount),movements:n(x.movements)})):[],
    facets:{accounts:Array.isArray(r.facets?.accounts)?r.facets.accounts.map((x:any)=>({id:String(x.id),name:String(x.name),identifier:String(x.identifier)})):[],categories:Array.isArray(r.facets?.categories)?r.facets.categories.map(String):[],subcategories:Array.isArray(r.facets?.subcategories)?r.facets.subcategories.map(String):[],merchants:Array.isArray(r.facets?.merchants)?r.facets.merchants.map(String):[],types:Array.isArray(r.facets?.types)?r.facets.types.map(String):[]},
    filters:{accountId:r.filters?.accountId||null,category:r.filters?.category||null,subcategory:r.filters?.subcategory||null,merchant:r.filters?.merchant||null,type:r.filters?.type||null},
    excluded:{savings:n(r.excluded?.savings),internalTransfers:n(r.excluded?.internalTransfers),duplicates:n(r.excluded?.duplicates),manual:n(r.excluded?.manual),sourceMissing:n(r.excluded?.sourceMissing)},
    rules:{savingsAlwaysExcluded:Boolean(r.rules?.savingsAlwaysExcluded),internalTransfersExcluded:Boolean(r.rules?.internalTransfersExcluded),duplicatesExcluded:Boolean(r.rules?.duplicatesExcluded),sourceMissingExcluded:Boolean(r.rules?.sourceMissingExcluded),personalSplitsApplied:Boolean(r.rules?.personalSplitsApplied)},
  };
}
