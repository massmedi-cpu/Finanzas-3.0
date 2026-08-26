import { APP_VERSION } from "@/lib/app-version";
import { madridToday } from "@/lib/time/madrid";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString, nullableString } from "@/lib/validation/json";

export type ForecastCalendarStatus="expected"|"received"|"late";
export type ForecastCalendarSource="automatic"|"manual";
export type ForecastCalendarFrequency="once"|"weekly"|"monthly"|"bimonthly"|"quarterly"|"yearly";
export type ForecastCalendarActual={transactionId:string;date:string;amount:number;title:string;category:string|null};
export type ForecastCalendarEvent={
  id:string;patternId:string;forecastId:string|null;title:string;estimatedDate:string;estimatedAmount:number;
  category:string|null;subcategory:string|null;counterparty:string|null;source:ForecastCalendarSource;
  frequency:ForecastCalendarFrequency;confidence:number;status:ForecastCalendarStatus;toleranceDays:number;
  explanation:Record<string,unknown>;actual:ForecastCalendarActual|null;
};
export type ForecastActualMonth={month:string;income:number;expenses:number;cashFlow:number;movements:number};
export type ForecastCalendarOverview={
  version:string;startDate:string;endDate:string;months:number;events:ForecastCalendarEvent[];actualMonths:ForecastActualMonth[];
  counts:{total:number;expected:number;received:number;late:number};
  rules:{calendarOnly:boolean;estimatedDates:boolean;actualMovementConfirms:boolean;annualInsuranceAndTaxPatterns:boolean;dismissibleOccurrences:boolean;dismissedEventsExcludedFromMetrics:boolean;normalizedCategoryFallbackMatching:boolean;actualExpensesIncludedInProjection:boolean;confirmedEventsNotDoubleCounted:boolean;historyWindowDays:number;maximumMonths:number};
};

const status=(value:unknown):ForecastCalendarStatus=>value==="received"?"received":value==="late"?"late":"expected";
const source=(value:unknown):ForecastCalendarSource=>value==="manual"?"manual":"automatic";
const frequency=(value:unknown):ForecastCalendarFrequency=>{
  const v=asString(value);
  return v==="once"||v==="weekly"||v==="bimonthly"||v==="quarterly"||v==="yearly"?v:"monthly";
};
const bool=(value:unknown,fallback:boolean)=>value==null?fallback:asBoolean(value);
const actual=(value:unknown):ForecastCalendarActual|null=>{
  if(!value)return null;
  const x=asRecord(value);
  const transactionId=asString(x.transactionId);
  const date=asString(x.date);
  if(!transactionId||!date)return null;
  return{transactionId,date,amount:asNumber(x.amount),title:asString(x.title),category:nullableString(x.category)};
};
const event=(value:unknown):ForecastCalendarEvent=>{
  const x=asRecord(value);
  return{
    id:asString(x.id),patternId:asString(x.patternId),forecastId:nullableString(x.forecastId),title:asString(x.title),
    estimatedDate:asString(x.estimatedDate),estimatedAmount:asNumber(x.estimatedAmount),category:nullableString(x.category),
    subcategory:nullableString(x.subcategory),counterparty:nullableString(x.counterparty),source:source(x.source),
    frequency:frequency(x.frequency),confidence:asNumber(x.confidence),status:status(x.status),
    toleranceDays:Math.max(0,asNumber(x.toleranceDays)),explanation:asRecord(x.explanation),actual:actual(x.actual),
  };
};
const actualMonth=(value:unknown):ForecastActualMonth=>{
  const x=asRecord(value);
  return{month:asString(x.month),income:asNumber(x.income),expenses:asNumber(x.expenses),cashFlow:asNumber(x.cashFlow),movements:asNumber(x.movements)};
};

export async function getForecastCalendar(months=12):Promise<ForecastCalendarOverview>{
  const supabase=await createClient();
  const safeMonths=Math.max(1,Math.min(18,Number.isFinite(months)?months:12));
  const{data,error}=await supabase.rpc("financial_app_forecast_calendar",{p_start:madridToday(),p_months:safeMonths});
  if(error||!data)throw new Error(error?.message||"forecast_calendar_unavailable");
  const r=asRecord(data);const counts=asRecord(r.counts);const rules=asRecord(r.rules);
  return{
    version:APP_VERSION,startDate:asString(r.startDate),endDate:asString(r.endDate),months:asNumber(r.months,safeMonths),
    events:asArray(r.events).map(event),actualMonths:asArray(r.actualMonths).map(actualMonth),
    counts:{total:asNumber(counts.total),expected:asNumber(counts.expected),received:asNumber(counts.received),late:asNumber(counts.late)},
    rules:{
      calendarOnly:bool(rules.calendarOnly,true),estimatedDates:bool(rules.estimatedDates,true),
      actualMovementConfirms:bool(rules.actualMovementConfirms,true),annualInsuranceAndTaxPatterns:bool(rules.annualInsuranceAndTaxPatterns,true),
      dismissibleOccurrences:bool(rules.dismissibleOccurrences,true),dismissedEventsExcludedFromMetrics:bool(rules.dismissedEventsExcludedFromMetrics,true),
      normalizedCategoryFallbackMatching:bool(rules.normalizedCategoryFallbackMatching,true),actualExpensesIncludedInProjection:bool(rules.actualExpensesIncludedInProjection,true),
      confirmedEventsNotDoubleCounted:bool(rules.confirmedEventsNotDoubleCounted,true),
      historyWindowDays:asNumber(rules.historyWindowDays,1460),maximumMonths:asNumber(rules.maximumMonths,18),
    },
  };
}
