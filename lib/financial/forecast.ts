import { APP_VERSION } from "@/lib/app-version";
import { madridToday } from "@/lib/time/madrid";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString, nullableString } from "@/lib/validation/json";

export type ForecastRecurrence = { frequency: "weekly" | "monthly" | "yearly"; interval: number; until?: string | null };
export type ForecastSuggestion = { id:string; title:string; nextDate:string; amount:number; category:string|null; subcategory:string|null; counterparty:string|null; confidence:number; recurrence:ForecastRecurrence; explanation:Record<string,unknown> };
export type ForecastEvent = { id:string; date:string; amount:number; title:string; category:string|null; subcategory:string|null; counterparty:string|null; source:"saved"|"suggested"; confidence:number };
export type ForecastSaved = { id:string; title:string; date:string; amount:number; category:string|null; subcategory:string|null; counterparty:string|null; recurrence:ForecastRecurrence|null; confidence:number; notes:string|null; status:string };
export type ForecastPoint = { date:string; balance:number; title:string; source:string };
export type ForecastMonth = { month:string; income:number; expenses:number; net:number };
export type ForecastOverview = {
  version:string; startDate:string; endDate:string; days:number; currentBalance:number; savingsBalance:number; projectedBalance:number; projectedIncome:number; projectedExpenses:number; projectedNet:number; lowestBalance:number;
  suggestions:ForecastSuggestion[]; events:ForecastEvent[]; balanceSeries:ForecastPoint[]; monthly:ForecastMonth[]; savedForecasts:ForecastSaved[]; consolidatedCount:number;
  rules:{ automaticSuggestionsAreReadOnly:boolean; suggestionsAffectProjection?:boolean; historyWindowDays:number; amountTolerancePercent:number; dateToleranceDays:number; stalePatternsExcluded:boolean };
};
export type ForecastScenarioFrequency="once"|"weekly"|"monthly"|"yearly";
export type ForecastScenarioEvent={id:string;date:string;amount:number;title:string;source:"saved"|"scenario"};
export type ForecastScenarioLine={date:string;balance:number;title:string;source:"current"|"saved"|"scenario"};
export type ForecastScenarioResult={
  version:string;startDate:string;endDate:string;days:number;currentBalance:number;savingsBalance:number;
  baseline:{projectedBalance:number;net:number;lowestBalance:number;events:ForecastScenarioEvent[];balanceSeries:ForecastScenarioLine[]};
  scenario:{title:string;amount:number;date:string;frequency:ForecastScenarioFrequency;interval:number;requestedOccurrences:number;events:ForecastScenarioEvent[];delta:number;projectedBalance:number;lowestBalance:number;firstNegativeDate:string|null;balanceSeries:ForecastScenarioLine[]};
  rules:{readOnly:boolean;savingsUsed:boolean;suggestionsIncluded:boolean;officialForecastsModified:boolean};
};

const recurrence=(value:unknown):ForecastRecurrence=>{const r=asRecord(value);const frequency=asString(r.frequency);return{frequency:frequency==="weekly"||frequency==="yearly"?frequency:"monthly",interval:Math.max(1,asNumber(r.interval,1)),until:nullableString(r.until)}};
const suggestion=(value:unknown):ForecastSuggestion=>{const x=asRecord(value);return{id:asString(x.id),title:asString(x.title),nextDate:asString(x.nextDate),amount:asNumber(x.amount),category:nullableString(x.category),subcategory:nullableString(x.subcategory),counterparty:nullableString(x.counterparty),confidence:asNumber(x.confidence),recurrence:recurrence(x.recurrence),explanation:asRecord(x.explanation)}};
const event=(value:unknown):ForecastEvent=>{const x=asRecord(value);return{id:asString(x.id),date:asString(x.date),amount:asNumber(x.amount),title:asString(x.title),category:nullableString(x.category),subcategory:nullableString(x.subcategory),counterparty:nullableString(x.counterparty),source:asString(x.source)==="suggested"?"suggested":"saved",confidence:asNumber(x.confidence)}};
const point=(value:unknown):ForecastPoint=>{const x=asRecord(value);return{date:asString(x.date),balance:asNumber(x.balance),title:asString(x.title),source:asString(x.source)}};
const month=(value:unknown):ForecastMonth=>{const x=asRecord(value);return{month:asString(x.month),income:asNumber(x.income),expenses:asNumber(x.expenses),net:asNumber(x.net)}};
const saved=(value:unknown):ForecastSaved=>{const x=asRecord(value);return{id:asString(x.id),title:asString(x.title),date:asString(x.date),amount:asNumber(x.amount),category:nullableString(x.category),subcategory:nullableString(x.subcategory),counterparty:nullableString(x.counterparty),recurrence:x.recurrence?recurrence(x.recurrence):null,confidence:asNumber(x.confidence),notes:nullableString(x.notes),status:asString(x.status)}};

export async function getForecastOverview(days=90):Promise<ForecastOverview>{
  const supabase=await createClient();
  const safeDays=Math.max(30,Math.min(365,Number.isFinite(days)?days:90));
  const {data,error}=await supabase.rpc("financial_app_forecast_overview",{p_start:madridToday(),p_days:safeDays});
  if(error||!data) throw new Error(error?.message||"forecast_unavailable");
  const r=asRecord(data);const rules=asRecord(r.rules);
  return {
    version:asString(r.version,APP_VERSION),startDate:asString(r.startDate),endDate:asString(r.endDate),days:asNumber(r.days),currentBalance:asNumber(r.currentBalance),savingsBalance:asNumber(r.savingsBalance),projectedBalance:asNumber(r.projectedBalance),projectedIncome:asNumber(r.projectedIncome),projectedExpenses:asNumber(r.projectedExpenses),projectedNet:asNumber(r.projectedNet),lowestBalance:asNumber(r.lowestBalance),
    suggestions:asArray(r.suggestions).map(suggestion),events:asArray(r.events).map(event),balanceSeries:asArray(r.balanceSeries).map(point),monthly:asArray(r.monthly).map(month),savedForecasts:asArray(r.savedForecasts).map(saved),consolidatedCount:asNumber(r.consolidatedCount),
    rules:{automaticSuggestionsAreReadOnly:r.rules?asBoolean(rules.automaticSuggestionsAreReadOnly):true,suggestionsAffectProjection:r.rules?asBoolean(rules.suggestionsAffectProjection):false,historyWindowDays:r.rules?asNumber(rules.historyWindowDays):270,amountTolerancePercent:r.rules?asNumber(rules.amountTolerancePercent):12,dateToleranceDays:r.rules?asNumber(rules.dateToleranceDays):5,stalePatternsExcluded:r.rules?asBoolean(rules.stalePatternsExcluded):true},
  };
}
