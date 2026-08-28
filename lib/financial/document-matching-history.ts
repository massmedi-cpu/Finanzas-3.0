import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString } from "@/lib/validation/json";

export type DocumentMatchingQualityPoint={
  date:string;
  capturedAt:string;
  engineVersion:string;
  activeUnlinked:number;
  withCandidates:number;
  safeAuto:number;
  ambiguous:number;
  highConfidence:number;
  mediumConfidence:number;
  lowConfidence:number;
  noCandidates:number;
  candidateRate:number;
  safeAutoRate:number;
  ambiguityRate:number;
};

export type DocumentMatchingQualityHistory={
  version:string;
  snapshotDate:string;
  storedNoFinancialValues:boolean;
  history:DocumentMatchingQualityPoint[];
};

export async function getDocumentMatchingQualityHistory(days=90,capture=true):Promise<DocumentMatchingQualityHistory>{
  const safeDays=Math.max(7,Math.min(365,Number.isFinite(days)?Math.trunc(days):90));
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_document_matching_quality_history",{p_days:safeDays,p_capture:capture});
  if(error||!data)throw new Error(error?.message||"document_matching_quality_history_unavailable");
  const r=asRecord(data);
  return{
    version:asString(r.version,APP_VERSION),
    snapshotDate:asString(r.snapshotDate),
    storedNoFinancialValues:asBoolean(r.storedNoFinancialValues),
    history:asArray(r.history).map(value=>{
      const x=asRecord(value);
      return{
        date:asString(x.date),
        capturedAt:asString(x.capturedAt),
        engineVersion:asString(x.engineVersion),
        activeUnlinked:asNumber(x.activeUnlinked),
        withCandidates:asNumber(x.withCandidates),
        safeAuto:asNumber(x.safeAuto),
        ambiguous:asNumber(x.ambiguous),
        highConfidence:asNumber(x.highConfidence),
        mediumConfidence:asNumber(x.mediumConfidence),
        lowConfidence:asNumber(x.lowConfidence),
        noCandidates:asNumber(x.noCandidates),
        candidateRate:asNumber(x.candidateRate),
        safeAutoRate:asNumber(x.safeAutoRate),
        ambiguityRate:asNumber(x.ambiguityRate),
      };
    }),
  };
}
