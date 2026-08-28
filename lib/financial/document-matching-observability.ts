import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString } from "@/lib/validation/json";
import type { ArchiveMatchConfidence, ArchiveMatchMode, ArchiveMovementRef } from "@/lib/financial/archive";

export type DocumentMatchingPriority="auto_safe"|"ambiguous"|"high"|"review";
export type DocumentMatchingSummary={
  activeUnlinked:number;
  withCandidates:number;
  safeAuto:number;
  ambiguous:number;
  highConfidence:number;
  mediumConfidence:number;
  lowConfidence:number;
  noCandidates:number;
};
export type DocumentMatchingDocument={
  id:string;
  fileName:string;
  documentType:string;
  storageProvider:string|null;
  storageUrl:string|null;
  documentDate:string|null;
  amount:number|null;
  merchant:string|null;
  priority:DocumentMatchingPriority;
  suggestions:ArchiveMovementRef[];
};
export type DocumentMatchingObservability={
  version:string;
  generatedAt:string;
  summary:DocumentMatchingSummary;
  documents:DocumentMatchingDocument[];
  rules:{safeAutoMinimumScore:number;safeAutoMinimumMargin:number;requiresMerchantMatch:boolean;readOnlyObservability:boolean};
};

const confidence=(value:unknown):ArchiveMatchConfidence|undefined=>{
  const x=asString(value);
  return x==="exact"||x==="high"||x==="medium"||x==="low"?x:undefined;
};
const matchMode=(value:unknown):ArchiveMatchMode|undefined=>{
  const x=asString(value);
  return x==="installment"||x==="standard"?x:undefined;
};
const priority=(value:unknown):DocumentMatchingPriority=>{
  const x=asString(value);
  return x==="auto_safe"||x==="ambiguous"||x==="high"?x:"review";
};
const nullableNumber=(value:unknown):number|null=>value==null?null:asNumber(value);
const nullableString=(value:unknown):string|null=>value==null?null:asString(value)||null;
const booleanOr=(value:unknown,fallback:boolean):boolean=>typeof value==="boolean"?asBoolean(value):fallback;

const movement=(value:unknown):ArchiveMovementRef=>{
  const x=asRecord(value);
  return{
    sourceId:asString(x.sourceId),
    date:nullableString(x.date),
    amount:nullableNumber(x.amount),
    concept:nullableString(x.concept),
    counterparty:nullableString(x.counterparty),
    score:asNumber(x.score),
    confidenceTier:confidence(x.confidenceTier),
    matchMode:matchMode(x.matchMode),
    amountDiff:nullableNumber(x.amountDiff),
    daysDiff:nullableNumber(x.daysDiff),
    merchantMatch:typeof x.merchantMatch==="boolean"?x.merchantMatch:undefined,
    candidateRank:asNumber(x.candidateRank),
    candidateCount:asNumber(x.candidateCount),
    scoreMargin:nullableNumber(x.scoreMargin),
    autoEligible:asBoolean(x.autoEligible),
    reasons:asArray(x.reasons).map(item=>asString(item)).filter(Boolean),
  };
};

export function parseDocumentMatchingObservability(value:unknown):DocumentMatchingObservability{
  const r=asRecord(value),summary=asRecord(r.summary),rules=asRecord(r.rules);
  return{
    version:asString(r.version,APP_VERSION),
    generatedAt:asString(r.generatedAt),
    summary:{
      activeUnlinked:asNumber(summary.activeUnlinked),
      withCandidates:asNumber(summary.withCandidates),
      safeAuto:asNumber(summary.safeAuto),
      ambiguous:asNumber(summary.ambiguous),
      highConfidence:asNumber(summary.highConfidence),
      mediumConfidence:asNumber(summary.mediumConfidence),
      lowConfidence:asNumber(summary.lowConfidence),
      noCandidates:asNumber(summary.noCandidates),
    },
    documents:asArray(r.documents).map(item=>{const x=asRecord(item);return{
      id:asString(x.id),
      fileName:asString(x.fileName),
      documentType:asString(x.documentType,"documento"),
      storageProvider:nullableString(x.storageProvider),
      storageUrl:nullableString(x.storageUrl),
      documentDate:nullableString(x.documentDate),
      amount:nullableNumber(x.amount),
      merchant:nullableString(x.merchant),
      priority:priority(x.priority),
      suggestions:asArray(x.suggestions).map(movement),
    }}),
    rules:{
      safeAutoMinimumScore:asNumber(rules.safeAutoMinimumScore,93),
      safeAutoMinimumMargin:asNumber(rules.safeAutoMinimumMargin,8),
      requiresMerchantMatch:booleanOr(rules.requiresMerchantMatch,true),
      readOnlyObservability:booleanOr(rules.readOnlyObservability,true),
    },
  };
}

export async function getDocumentMatchingObservability(limit=8):Promise<DocumentMatchingObservability>{
  const safeLimit=Math.max(1,Math.min(20,Number.isFinite(limit)?Math.trunc(limit):8));
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_document_matching_observability",{p_limit:safeLimit});
  if(error||!data)throw new Error(error?.message||"document_matching_observability_unavailable");
  return parseDocumentMatchingObservability(data);
}
