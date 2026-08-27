import { APP_VERSION } from "@/lib/app-version";
import { movementState, movementUrl } from "@/lib/financial/movement-query";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString } from "@/lib/validation/json";

export type ActionableSeverity="high"|"medium"|"low";
export type ActionableState="open"|"snoozed"|"resolved"|"dismissed";
type BaseSignal={key:string;kind:"anomaly"|"recurring"|"rising"|"opportunity";severity:ActionableSeverity;title:string;state:ActionableState;snoozedUntil:string|null;href:string};
export type AnomalySignal=BaseSignal&{kind:"anomaly";merchant:string;category:string;transactionId:string;sourceId:string;date:string;amount:number;baselineMedian:number;difference:number;ratio:number;historyCount:number};
export type RecurringSignal=BaseSignal&{kind:"recurring";merchant:string;category:string;subcategory:string;classification:"subscription_candidate"|"fixed_commitment"|"recurring_charge";monthsObserved:number;transactions:number;firstDate:string;lastDate:string;monthlyAmount:number;annualizedAmount:number;stability:number;latestAmount:number;baselineMedian:number;latestChangeRatio:number};
export type RisingSignal=BaseSignal&{kind:"rising";category:string;recentSpend:number;previousSpend:number;difference:number;changeRatio:number;recentTransactions:number;previousTransactions:number};
export type OpportunitySignal=BaseSignal&{kind:"opportunity";category:string;monthsObserved:number;monthlyAverage:number;scenarioPercent:number;monthlyScenarioSavings:number;annualScenarioSavings:number};
export type ActionableIntelligence={
  ok:true;version:string;generatedAt:string;historyDays:number;
  summary:{anomalies:number;recurring:number;rising:number;opportunities:number;hidden:number;monthlySavingsScenario:number;annualSavingsScenario:number};
  anomalies:AnomalySignal[];recurring:RecurringSignal[];rising:RisingSignal[];opportunities:OpportunitySignal[];
  rules:{anomalyHistoryMinimum:number;anomalyRatioThreshold:number;anomalyAbsoluteDifference:number;anomalyRecentDays:number;recurringMinimumMonths:number;recurringCvMaximum:number;recurringIntervalMinDays:number;recurringIntervalMaxDays:number;risingComparisonMonths:number;risingThresholdPercent:number;savingsScenarioPercent:number;usesCompleteMonthsForTrends:boolean;sourceReadOnly:boolean;reusesControlAlertStates:boolean;financialValuesPersisted:boolean};
};

const state=(value:unknown):ActionableState=>value==="snoozed"?"snoozed":value==="resolved"?"resolved":value==="dismissed"?"dismissed":"open";
const severity=(value:unknown):ActionableSeverity=>value==="high"?"high":value==="medium"?"medium":"low";
const nullable=(value:unknown)=>{const x=asString(value);return x||null};
const base=(x:Record<string,unknown>,kind:BaseSignal["kind"],href:string):BaseSignal=>({key:asString(x.key),kind,severity:severity(x.severity),title:asString(x.title),state:state(x.state),snoozedUntil:nullable(x.snoozedUntil),href});

export function parseActionableIntelligence(value:unknown):ActionableIntelligence{
  const r=asRecord(value),summary=asRecord(r.summary),rules=asRecord(r.rules);
  const anomalies=asArray(r.anomalies).map(value=>{const x=asRecord(value),merchant=asString(x.merchant),date=asString(x.date);return{...base(x,"anomaly",movementUrl(movementState({merchant,from:date,to:date}))),kind:"anomaly" as const,merchant,category:asString(x.category),transactionId:asString(x.transactionId),sourceId:asString(x.sourceId),date,amount:asNumber(x.amount),baselineMedian:asNumber(x.baselineMedian),difference:asNumber(x.difference),ratio:asNumber(x.ratio),historyCount:asNumber(x.historyCount)}});
  const recurring=asArray(r.recurring).map(value=>{const x=asRecord(value),merchant=asString(x.merchant),raw=asString(x.classification);const classification:RecurringSignal["classification"]=raw==="subscription_candidate"?"subscription_candidate":raw==="fixed_commitment"?"fixed_commitment":"recurring_charge";return{...base(x,"recurring",movementUrl(movementState({merchant}))),kind:"recurring" as const,merchant,category:asString(x.category),subcategory:asString(x.subcategory),classification,monthsObserved:asNumber(x.monthsObserved),transactions:asNumber(x.transactions),firstDate:asString(x.firstDate),lastDate:asString(x.lastDate),monthlyAmount:asNumber(x.monthlyAmount),annualizedAmount:asNumber(x.annualizedAmount),stability:asNumber(x.stability),latestAmount:asNumber(x.latestAmount),baselineMedian:asNumber(x.baselineMedian),latestChangeRatio:asNumber(x.latestChangeRatio)}});
  const rising=asArray(r.rising).map(value=>{const x=asRecord(value),category=asString(x.category);return{...base(x,"rising",movementUrl(movementState({category}))),kind:"rising" as const,category,recentSpend:asNumber(x.recentSpend),previousSpend:asNumber(x.previousSpend),difference:asNumber(x.difference),changeRatio:asNumber(x.changeRatio),recentTransactions:asNumber(x.recentTransactions),previousTransactions:asNumber(x.previousTransactions)}});
  const opportunities=asArray(r.opportunities).map(value=>{const x=asRecord(value),category=asString(x.category);return{...base(x,"opportunity",movementUrl(movementState({category}))),kind:"opportunity" as const,category,monthsObserved:asNumber(x.monthsObserved),monthlyAverage:asNumber(x.monthlyAverage),scenarioPercent:asNumber(x.scenarioPercent,10),monthlyScenarioSavings:asNumber(x.monthlyScenarioSavings),annualScenarioSavings:asNumber(x.annualScenarioSavings)}});
  return{ok:true,version:asString(r.version,APP_VERSION),generatedAt:asString(r.generatedAt),historyDays:asNumber(r.historyDays,400),summary:{anomalies:asNumber(summary.anomalies),recurring:asNumber(summary.recurring),rising:asNumber(summary.rising),opportunities:asNumber(summary.opportunities),hidden:asNumber(summary.hidden),monthlySavingsScenario:asNumber(summary.monthlySavingsScenario),annualSavingsScenario:asNumber(summary.annualSavingsScenario)},anomalies,recurring,rising,opportunities,rules:{anomalyHistoryMinimum:asNumber(rules.anomalyHistoryMinimum,3),anomalyRatioThreshold:asNumber(rules.anomalyRatioThreshold,1.75),anomalyAbsoluteDifference:asNumber(rules.anomalyAbsoluteDifference,15),anomalyRecentDays:asNumber(rules.anomalyRecentDays,45),recurringMinimumMonths:asNumber(rules.recurringMinimumMonths,4),recurringCvMaximum:asNumber(rules.recurringCvMaximum,.15),recurringIntervalMinDays:asNumber(rules.recurringIntervalMinDays,20),recurringIntervalMaxDays:asNumber(rules.recurringIntervalMaxDays,45),risingComparisonMonths:asNumber(rules.risingComparisonMonths,2),risingThresholdPercent:asNumber(rules.risingThresholdPercent,25),savingsScenarioPercent:asNumber(rules.savingsScenarioPercent,10),usesCompleteMonthsForTrends:asBoolean(rules.usesCompleteMonthsForTrends),sourceReadOnly:asBoolean(rules.sourceReadOnly),reusesControlAlertStates:asBoolean(rules.reusesControlAlertStates),financialValuesPersisted:asBoolean(rules.financialValuesPersisted)}};
}

export async function getActionableIntelligence(historyDays=400):Promise<ActionableIntelligence>{
  const safeDays=Math.max(180,Math.min(730,Number.isFinite(historyDays)?Math.trunc(historyDays):400));
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_actionable_intelligence",{p_history_days:safeDays});
  if(error||!data)throw new Error(error?.message||"actionable_intelligence_unavailable");
  return parseActionableIntelligence(data);
}
