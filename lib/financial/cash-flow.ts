import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString, nullableString } from "@/lib/validation/json";

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

function normalizeCategory(value:unknown):CashFlowCategory{const x=asRecord(value);return{category:asString(x.category),amount:asNumber(x.amount),movements:asNumber(x.movements)}}

export async function getCashFlow(year:number):Promise<CashFlowData>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_cash_flow",{p_year:year});
  if(error||!data) throw new Error(error?.message||"cash_flow_unavailable");
  const raw=asRecord(data),excluded=asRecord(raw.excluded),rules=asRecord(raw.rules);
  return {
    version:asString(raw.version,APP_VERSION), year:asNumber(raw.year), years:asArray(raw.years).map(value=>asNumber(value)),
    income:asNumber(raw.income), expenses:asNumber(raw.expenses), net:asNumber(raw.net), positiveMonths:asNumber(raw.positiveMonths), negativeMonths:asNumber(raw.negativeMonths),
    monthly:asArray(raw.monthly).map(value=>{const m=asRecord(value);return{month:asString(m.month),income:asNumber(m.income),expenses:asNumber(m.expenses),net:asNumber(m.net),accumulated:asNumber(m.accumulated)}}),
    topExpenseCategories:asArray(raw.topExpenseCategories).map(normalizeCategory),
    excluded:{savings:asNumber(excluded.savings),internalTransfers:asNumber(excluded.internalTransfers),duplicates:asNumber(excluded.duplicates),manual:asNumber(excluded.manual)},
    rules:{savingsAlwaysExcluded:asBoolean(rules.savingsAlwaysExcluded),internalTransfersExcluded:asBoolean(rules.internalTransfersExcluded),duplicatesExcluded:asBoolean(rules.duplicatesExcluded),sourceMissingExcluded:asBoolean(rules.sourceMissingExcluded)}
  };
}

export async function getCashFlowRange(filters:CashFlowRangeFilters):Promise<CashFlowRangeData>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_cash_flow_range",{
    p_range:filters.range,p_anchor:filters.anchor,p_date_from:filters.dateFrom||null,p_date_to:filters.dateTo||null,
    p_account_id:filters.accountId||null,p_category:filters.category||null,p_subcategory:filters.subcategory||null,p_merchant:filters.merchant||null,p_type:filters.type||null,
  });
  if(error||!data) throw new Error(error?.message||"cash_flow_range_unavailable");
  const r=asRecord(data),facets=asRecord(r.facets),normalizedFilters=asRecord(r.filters),excluded=asRecord(r.excluded),rules=asRecord(r.rules);
  const rawRange=asString(r.range,filters.range);const range:CashFlowRange=["day","week","month","quarter","year","historical","custom"].includes(rawRange)?rawRange as CashFlowRange:filters.range;
  const rawBucket=asString(r.bucket,"month");const bucket:CashFlowRangeData["bucket"]=["day","week","month"].includes(rawBucket)?rawBucket as CashFlowRangeData["bucket"]:"month";
  return {
    version:asString(r.version,APP_VERSION),range,anchor:asString(r.anchor,filters.anchor),dateFrom:asString(r.dateFrom),dateTo:asString(r.dateTo),bucket,
    income:asNumber(r.income),expenses:asNumber(r.expenses),net:asNumber(r.net),movements:asNumber(r.movements),positivePeriods:asNumber(r.positivePeriods),negativePeriods:asNumber(r.negativePeriods),
    series:asArray(r.series).map(value=>{const x=asRecord(value);return{date:asString(x.date),label:asString(x.label),income:asNumber(x.income),expenses:asNumber(x.expenses),net:asNumber(x.net),accumulated:asNumber(x.accumulated),movements:asNumber(x.movements)}}),
    topExpenseCategories:asArray(r.topExpenseCategories).map(normalizeCategory),
    topMerchants:asArray(r.topMerchants).map(value=>{const x=asRecord(value);return{merchant:asString(x.merchant),amount:asNumber(x.amount),movements:asNumber(x.movements)}}),
    facets:{accounts:asArray(facets.accounts).map(value=>{const x=asRecord(value);return{id:asString(x.id),name:asString(x.name),identifier:asString(x.identifier)}}),categories:asArray(facets.categories).map(value=>asString(value)),subcategories:asArray(facets.subcategories).map(value=>asString(value)),merchants:asArray(facets.merchants).map(value=>asString(value)),types:asArray(facets.types).map(value=>asString(value))},
    filters:{accountId:nullableString(normalizedFilters.accountId),category:nullableString(normalizedFilters.category),subcategory:nullableString(normalizedFilters.subcategory),merchant:nullableString(normalizedFilters.merchant),type:nullableString(normalizedFilters.type)},
    excluded:{savings:asNumber(excluded.savings),internalTransfers:asNumber(excluded.internalTransfers),duplicates:asNumber(excluded.duplicates),manual:asNumber(excluded.manual),sourceMissing:asNumber(excluded.sourceMissing)},
    rules:{savingsAlwaysExcluded:asBoolean(rules.savingsAlwaysExcluded),internalTransfersExcluded:asBoolean(rules.internalTransfersExcluded),duplicatesExcluded:asBoolean(rules.duplicatesExcluded),sourceMissingExcluded:asBoolean(rules.sourceMissingExcluded),personalSplitsApplied:asBoolean(rules.personalSplitsApplied)},
  };
}
