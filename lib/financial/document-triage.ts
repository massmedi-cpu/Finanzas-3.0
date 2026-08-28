import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray,asBoolean,asNumber,asRecord,asString } from "@/lib/validation/json";
import type { ArchiveMatchConfidence,ArchiveMatchMode,ArchiveMovementRef } from "@/lib/financial/archive";

export type DocumentTriageAction="review_ocr"|"complete_metadata"|"ready_to_link"|"review_match"|"investigate_no_match"|"archive_candidate";
export type DocumentTriageSummary={active:number;reviewOcr:number;completeMetadata:number;readyToLink:number;reviewMatch:number;investigateNoMatch:number;archiveCandidate:number};
export type DocumentTriageDocument={
  id:string;fileName:string;documentType:string;storageProvider:string|null;storageUrl:string|null;
  documentDate:string|null;amount:number|null;merchant:string|null;ocrStatus:string|null;linkCount:number;
  action:DocumentTriageAction;priorityScore:number;reasons:string[];suggestions:ArchiveMovementRef[];
};
export type DocumentTriage={
  version:string;generatedAt:string;summary:DocumentTriageSummary;documents:DocumentTriageDocument[];
  rules:{readOnly:boolean;noAutomaticActions:boolean;usesCanonicalMatchingPolicy:boolean;priorityOrder:DocumentTriageAction[]};
};

const nullableString=(value:unknown):string|null=>value==null?null:asString(value)||null;
const nullableNumber=(value:unknown):number|null=>value==null?null:asNumber(value);
const confidence=(value:unknown):ArchiveMatchConfidence|undefined=>{const x=asString(value);return x==="exact"||x==="high"||x==="medium"||x==="low"?x:undefined};
const matchMode=(value:unknown):ArchiveMatchMode|undefined=>{const x=asString(value);return x==="installment"||x==="standard"?x:undefined};
const action=(value:unknown):DocumentTriageAction=>{
  const x=asString(value);
  return x==="review_ocr"||x==="complete_metadata"||x==="ready_to_link"||x==="review_match"||x==="investigate_no_match"||x==="archive_candidate"?x:"investigate_no_match";
};
const movement=(value:unknown):ArchiveMovementRef=>{const x=asRecord(value);return{
  sourceId:asString(x.sourceId),date:nullableString(x.date),amount:nullableNumber(x.amount),concept:nullableString(x.concept),counterparty:nullableString(x.counterparty),
  score:asNumber(x.score),confidenceTier:confidence(x.confidenceTier),matchMode:matchMode(x.matchMode),amountDiff:nullableNumber(x.amountDiff),daysDiff:nullableNumber(x.daysDiff),
  merchantMatch:typeof x.merchantMatch==="boolean"?x.merchantMatch:undefined,candidateRank:asNumber(x.candidateRank),candidateCount:asNumber(x.candidateCount),scoreMargin:nullableNumber(x.scoreMargin),
  autoEligible:asBoolean(x.autoEligible),reasons:asArray(x.reasons).map(item=>asString(item)).filter(Boolean),
}};

export function parseDocumentTriage(value:unknown):DocumentTriage{
  const r=asRecord(value),summary=asRecord(r.summary),rules=asRecord(r.rules);
  return{
    version:asString(r.version,APP_VERSION),generatedAt:asString(r.generatedAt),
    summary:{active:asNumber(summary.active),reviewOcr:asNumber(summary.reviewOcr),completeMetadata:asNumber(summary.completeMetadata),readyToLink:asNumber(summary.readyToLink),reviewMatch:asNumber(summary.reviewMatch),investigateNoMatch:asNumber(summary.investigateNoMatch),archiveCandidate:asNumber(summary.archiveCandidate)},
    documents:asArray(r.documents).map(item=>{const x=asRecord(item);return{
      id:asString(x.id),fileName:asString(x.fileName),documentType:asString(x.documentType,"documento"),storageProvider:nullableString(x.storageProvider),storageUrl:nullableString(x.storageUrl),
      documentDate:nullableString(x.documentDate),amount:nullableNumber(x.amount),merchant:nullableString(x.merchant),ocrStatus:nullableString(x.ocrStatus),linkCount:asNumber(x.linkCount),
      action:action(x.action),priorityScore:asNumber(x.priorityScore),reasons:asArray(x.reasons).map(reason=>asString(reason)).filter(Boolean),suggestions:asArray(x.suggestions).map(movement),
    }}),
    rules:{readOnly:asBoolean(rules.readOnly),noAutomaticActions:asBoolean(rules.noAutomaticActions),usesCanonicalMatchingPolicy:asBoolean(rules.usesCanonicalMatchingPolicy),priorityOrder:asArray(rules.priorityOrder).map(action)},
  };
}

export async function getDocumentTriage(limit=30):Promise<DocumentTriage>{
  const safeLimit=Math.max(1,Math.min(100,Number.isFinite(limit)?Math.trunc(limit):30));
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_document_triage",{p_limit:safeLimit});
  if(error||!data)throw new Error(error?.message||"document_triage_unavailable");
  return parseDocumentTriage(data);
}
