import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString } from "@/lib/validation/json";

export type MatchingCalibrationScoreBand={band:string;decisions:number;topChosen:number;topChoiceRate:number};
export type MatchingCalibrationReversal={origin:string;count:number};
export type MatchingCalibration={
  version:string;
  windowDays:number;
  summary:{
    accepted:number;
    reverted:number;
    withSuggestions:number;
    topChosen:number;
    alternativeChosen:number;
    outsideSuggestions:number;
    autoEligibleCases:number;
    autoEligibleRejected:number;
    suggestionCoverageRate:number;
    topChoiceRate:number;
    autoEligibleAcceptanceRate:number;
  };
  scoreBands:MatchingCalibrationScoreBand[];
  reversalsByOrigin:MatchingCalibrationReversal[];
  rules:{noFinancialValuesStored:boolean;noEntityIdsStored:boolean;thresholdsAreObservedNotAutoAdjusted:boolean};
};

export async function getDocumentMatchingCalibration(days=90):Promise<MatchingCalibration>{
  const safeDays=Math.max(7,Math.min(365,Number.isFinite(days)?Math.trunc(days):90));
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_document_matching_calibration",{p_days:safeDays});
  if(error||!data)throw new Error(error?.message||"document_matching_calibration_unavailable");
  const r=asRecord(data),summary=asRecord(r.summary),rules=asRecord(r.rules);
  return{
    version:asString(r.version,APP_VERSION),
    windowDays:asNumber(r.windowDays,safeDays),
    summary:{
      accepted:asNumber(summary.accepted),
      reverted:asNumber(summary.reverted),
      withSuggestions:asNumber(summary.withSuggestions),
      topChosen:asNumber(summary.topChosen),
      alternativeChosen:asNumber(summary.alternativeChosen),
      outsideSuggestions:asNumber(summary.outsideSuggestions),
      autoEligibleCases:asNumber(summary.autoEligibleCases),
      autoEligibleRejected:asNumber(summary.autoEligibleRejected),
      suggestionCoverageRate:asNumber(summary.suggestionCoverageRate),
      topChoiceRate:asNumber(summary.topChoiceRate),
      autoEligibleAcceptanceRate:asNumber(summary.autoEligibleAcceptanceRate),
    },
    scoreBands:asArray(r.scoreBands).map(value=>{const x=asRecord(value);return{band:asString(x.band),decisions:asNumber(x.decisions),topChosen:asNumber(x.topChosen),topChoiceRate:asNumber(x.topChoiceRate)}}),
    reversalsByOrigin:asArray(r.reversalsByOrigin).map(value=>{const x=asRecord(value);return{origin:asString(x.origin),count:asNumber(x.count)}}),
    rules:{
      noFinancialValuesStored:asBoolean(rules.noFinancialValuesStored),
      noEntityIdsStored:asBoolean(rules.noEntityIdsStored),
      thresholdsAreObservedNotAutoAdjusted:asBoolean(rules.thresholdsAreObservedNotAutoAdjusted),
    },
  };
}
