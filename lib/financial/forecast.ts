import { APP_VERSION } from "@/lib/app-version";
import { madridToday } from "@/lib/time/madrid";
import { createClient } from "@/lib/supabase/server";

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
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
export async function getForecastOverview(days=90):Promise<ForecastOverview>{
  const supabase=await createClient();
  const safeDays=Math.max(30,Math.min(365,Number.isFinite(days)?days:90));
  const {data,error}=await supabase.rpc("financial_app_forecast_overview",{p_start:madridToday(),p_days:safeDays});
  if(error||!data) throw new Error(error?.message||"forecast_unavailable");
  const r=data as any;
  return {
    version:String(r.version||APP_VERSION),startDate:String(r.startDate),endDate:String(r.endDate),days:n(r.days),currentBalance:n(r.currentBalance),savingsBalance:n(r.savingsBalance),projectedBalance:n(r.projectedBalance),projectedIncome:n(r.projectedIncome),projectedExpenses:n(r.projectedExpenses),projectedNet:n(r.projectedNet),lowestBalance:n(r.lowestBalance),
    suggestions:Array.isArray(r.suggestions)?r.suggestions.map((x:any)=>({...x,amount:n(x.amount),confidence:n(x.confidence)})):[],
    events:Array.isArray(r.events)?r.events.map((x:any)=>({...x,amount:n(x.amount),confidence:n(x.confidence)})):[],
    balanceSeries:Array.isArray(r.balanceSeries)?r.balanceSeries.map((x:any)=>({...x,balance:n(x.balance)})):[],
    monthly:Array.isArray(r.monthly)?r.monthly.map((x:any)=>({...x,income:n(x.income),expenses:n(x.expenses),net:n(x.net)})):[],
    savedForecasts:Array.isArray(r.savedForecasts)?r.savedForecasts.map((x:any)=>({...x,amount:n(x.amount),confidence:n(x.confidence)})):[],
    consolidatedCount:n(r.consolidatedCount),rules:r.rules||{automaticSuggestionsAreReadOnly:true,suggestionsAffectProjection:false,historyWindowDays:270,amountTolerancePercent:12,dateToleranceDays:5,stalePatternsExcluded:true},
  };
}
