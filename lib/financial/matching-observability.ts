import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString } from "@/lib/validation/json";

export type MatchingQualityStatus="healthy"|"watch"|"degraded"|"insufficient";
export type ForecastQualityStats={matured:number;received:number;late:number;matchRate:number;dismissed:number;medianDateErrorDays:number;medianAmountErrorRatio:number;weakIdentityRate:number};
export type ReconciliationQualityStats={decisions:number;distinctTransactions:number;repeatDecisionRate:number;pairsCreated:number;pairsCancelled:number;cancelRate:number;averageConfidence:number;lowConfidenceRate:number;manualPairs:number};
export type MatchingQualityAlert={scope:"forecast"|"reconciliation";severity:"medium"|"high";code:string;message:string};
export type MatchingObservability={
  version:string;generatedAt:string;windowDays:number;status:MatchingQualityStatus;
  releaseGate:{pass:boolean;status:MatchingQualityStatus;sampleAware:boolean};
  forecast:{status:MatchingQualityStatus;sampleSufficient:boolean;recent:ForecastQualityStats;previous:ForecastQualityStats;trend:{matchRateDelta:number;dateErrorDeltaDays:number;amountErrorRatioDelta:number}};
  reconciliation:{status:MatchingQualityStatus;sampleSufficient:boolean;recent:ReconciliationQualityStats;previous:ReconciliationQualityStats;trend:{cancelRateDelta:number;repeatDecisionRateDelta:number;confidenceDelta:number}};
  alerts:MatchingQualityAlert[];
  rules:{forecastMinimumSample:number;reconciliationMinimumPairs:number;reconciliationMinimumDecisions:number;comparisonWindowDays:number;noFinancialValuesStored:boolean;derivedFromCanonicalHistory:boolean};
};

const status=(value:unknown):MatchingQualityStatus=>value==="degraded"?"degraded":value==="watch"?"watch":value==="healthy"?"healthy":"insufficient";
const forecastStats=(value:unknown):ForecastQualityStats=>{const x=asRecord(value);return{matured:asNumber(x.matured),received:asNumber(x.received),late:asNumber(x.late),matchRate:asNumber(x.matchRate),dismissed:asNumber(x.dismissed),medianDateErrorDays:asNumber(x.medianDateErrorDays),medianAmountErrorRatio:asNumber(x.medianAmountErrorRatio),weakIdentityRate:asNumber(x.weakIdentityRate)}};
const reconciliationStats=(value:unknown):ReconciliationQualityStats=>{const x=asRecord(value);return{decisions:asNumber(x.decisions),distinctTransactions:asNumber(x.distinctTransactions),repeatDecisionRate:asNumber(x.repeatDecisionRate),pairsCreated:asNumber(x.pairsCreated),pairsCancelled:asNumber(x.pairsCancelled),cancelRate:asNumber(x.cancelRate),averageConfidence:asNumber(x.averageConfidence),lowConfidenceRate:asNumber(x.lowConfidenceRate),manualPairs:asNumber(x.manualPairs)}};

export async function getMatchingObservability(windowDays=90):Promise<MatchingObservability>{
  const safeDays=Math.max(30,Math.min(180,Number.isFinite(windowDays)?Math.trunc(windowDays):90));
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_matching_observability",{p_recent_days:safeDays});
  if(error||!data)throw new Error(error?.message||"matching_observability_unavailable");
  const r=asRecord(data),gate=asRecord(r.releaseGate),forecast=asRecord(r.forecast),reconciliation=asRecord(r.reconciliation),forecastTrend=asRecord(forecast.trend),reconciliationTrend=asRecord(reconciliation.trend),rules=asRecord(r.rules);
  return{
    version:asString(r.version,APP_VERSION),generatedAt:asString(r.generatedAt),windowDays:asNumber(r.windowDays,safeDays),status:status(r.status),
    releaseGate:{pass:asBoolean(gate.pass),status:status(gate.status),sampleAware:asBoolean(gate.sampleAware)},
    forecast:{status:status(forecast.status),sampleSufficient:asBoolean(forecast.sampleSufficient),recent:forecastStats(forecast.recent),previous:forecastStats(forecast.previous),trend:{matchRateDelta:asNumber(forecastTrend.matchRateDelta),dateErrorDeltaDays:asNumber(forecastTrend.dateErrorDeltaDays),amountErrorRatioDelta:asNumber(forecastTrend.amountErrorRatioDelta)}},
    reconciliation:{status:status(reconciliation.status),sampleSufficient:asBoolean(reconciliation.sampleSufficient),recent:reconciliationStats(reconciliation.recent),previous:reconciliationStats(reconciliation.previous),trend:{cancelRateDelta:asNumber(reconciliationTrend.cancelRateDelta),repeatDecisionRateDelta:asNumber(reconciliationTrend.repeatDecisionRateDelta),confidenceDelta:asNumber(reconciliationTrend.confidenceDelta)}},
    alerts:asArray(r.alerts).map(value=>{const x=asRecord(value);return{scope:asString(x.scope)==="reconciliation"?"reconciliation":"forecast",severity:asString(x.severity)==="high"?"high":"medium",code:asString(x.code),message:asString(x.message)}}),
    rules:{forecastMinimumSample:asNumber(rules.forecastMinimumSample,8),reconciliationMinimumPairs:asNumber(rules.reconciliationMinimumPairs,10),reconciliationMinimumDecisions:asNumber(rules.reconciliationMinimumDecisions,5),comparisonWindowDays:asNumber(rules.comparisonWindowDays,safeDays),noFinancialValuesStored:asBoolean(rules.noFinancialValuesStored),derivedFromCanonicalHistory:asBoolean(rules.derivedFromCanonicalHistory)},
  };
}
