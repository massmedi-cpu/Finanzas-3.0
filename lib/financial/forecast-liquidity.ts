import { APP_VERSION } from "@/lib/app-version";
import { madridToday } from "@/lib/time/madrid";
import { createClient } from "@/lib/supabase/server";
import { asArray,asBoolean,asNumber,asRecord,asString,nullableString } from "@/lib/validation/json";

export type ForecastLiquidityDay={date:string;income:number;expenses:number;net:number;eventCount:number;uncertainEvents:number;projectedBalance:number};
export type ForecastLiquidityCommitment={
  id:string;title:string;estimatedDate:string;effectiveDate:string;estimatedAmount:number;category:string|null;counterparty:string|null;
  source:"automatic"|"manual"|"document";frequency:string;status:string;confidence:number;confidenceLevel:"high"|"medium"|"low";toleranceDays:number;
  explanation:Record<string,unknown>;projectedDayBalance:number;
};
export type ForecastLiquidityOverview={
  version:string;startDate:string;endDate:string;days:number;
  summary:{openingBalance:number;projectedEndBalance:number;minimumProjectedBalance:number;minimumBalanceDate:string|null;daysBelowZero:number;pendingIncome:number;pendingExpenses:number;pendingNet:number;pendingEvents:number;overdueEvents:number};
  horizons:{days30:number|null;days60:number|null;days90:number|null};
  confidence:{high:number;medium:number;low:number};
  daily:ForecastLiquidityDay[];commitments:ForecastLiquidityCommitment[];
  rules:{usesCanonicalForecast:boolean;operatingAccountsOnly:boolean;cashFlowEnabledAccountsOnly:boolean;receivedEventsNotDoubleCounted:boolean;overdueAppliedAtStart:boolean;sourceBalancesReadOnly:boolean;pendingInvoiceCommitments:boolean;maximumDays:number};
};

const nullableNumeric=(value:unknown)=>value==null?null:asNumber(value);
const confidenceLevel=(value:unknown):ForecastLiquidityCommitment["confidenceLevel"]=>value==="high"?"high":value==="medium"?"medium":"low";
const source=(value:unknown):ForecastLiquidityCommitment["source"]=>value==="manual"?"manual":value==="document"?"document":"automatic";
const day=(value:unknown):ForecastLiquidityDay=>{const x=asRecord(value);return{date:asString(x.date),income:asNumber(x.income),expenses:asNumber(x.expenses),net:asNumber(x.net),eventCount:asNumber(x.eventCount),uncertainEvents:asNumber(x.uncertainEvents),projectedBalance:asNumber(x.projectedBalance)}};
const commitment=(value:unknown):ForecastLiquidityCommitment=>{const x=asRecord(value);return{
  id:asString(x.id),title:asString(x.title),estimatedDate:asString(x.estimatedDate),effectiveDate:asString(x.effectiveDate),estimatedAmount:asNumber(x.estimatedAmount),
  category:nullableString(x.category),counterparty:nullableString(x.counterparty),source:source(x.source),frequency:asString(x.frequency),status:asString(x.status),
  confidence:asNumber(x.confidence),confidenceLevel:confidenceLevel(x.confidenceLevel),toleranceDays:asNumber(x.toleranceDays),explanation:asRecord(x.explanation),projectedDayBalance:asNumber(x.projectedDayBalance),
}};

export async function getForecastLiquidity(days=90):Promise<ForecastLiquidityOverview>{
  const safeDays=Math.max(7,Math.min(180,Number.isFinite(days)?days:90));
  const supabase=await createClient();
  const{data,error}=await supabase.rpc("financial_app_forecast_liquidity",{p_start:madridToday(),p_days:safeDays});
  if(error||!data)throw new Error(error?.message||"forecast_liquidity_unavailable");
  const r=asRecord(data),summary=asRecord(r.summary),horizons=asRecord(r.horizons),confidence=asRecord(r.confidence),rules=asRecord(r.rules);
  return{
    version:asString(r.version,APP_VERSION),startDate:asString(r.startDate),endDate:asString(r.endDate),days:asNumber(r.days,safeDays),
    summary:{
      openingBalance:asNumber(summary.openingBalance),projectedEndBalance:asNumber(summary.projectedEndBalance),minimumProjectedBalance:asNumber(summary.minimumProjectedBalance),minimumBalanceDate:nullableString(summary.minimumBalanceDate),
      daysBelowZero:asNumber(summary.daysBelowZero),pendingIncome:asNumber(summary.pendingIncome),pendingExpenses:asNumber(summary.pendingExpenses),pendingNet:asNumber(summary.pendingNet),pendingEvents:asNumber(summary.pendingEvents),overdueEvents:asNumber(summary.overdueEvents),
    },
    horizons:{days30:nullableNumeric(horizons["30"]),days60:nullableNumeric(horizons["60"]),days90:nullableNumeric(horizons["90"])},
    confidence:{high:asNumber(confidence.high),medium:asNumber(confidence.medium),low:asNumber(confidence.low)},
    daily:asArray(r.daily).map(day),commitments:asArray(r.commitments).map(commitment),
    rules:{
      usesCanonicalForecast:asBoolean(rules.usesCanonicalForecast),operatingAccountsOnly:asBoolean(rules.operatingAccountsOnly),cashFlowEnabledAccountsOnly:asBoolean(rules.cashFlowEnabledAccountsOnly),
      receivedEventsNotDoubleCounted:asBoolean(rules.receivedEventsNotDoubleCounted),overdueAppliedAtStart:asBoolean(rules.overdueAppliedAtStart),sourceBalancesReadOnly:asBoolean(rules.sourceBalancesReadOnly),
      pendingInvoiceCommitments:asBoolean(rules.pendingInvoiceCommitments),maximumDays:asNumber(rules.maximumDays,180),
    },
  };
}