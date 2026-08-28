import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray,asBoolean,asNumber,asRecord,asString } from "@/lib/validation/json";

export type MatchingPolicy={
  policyId:number;createdAt:string;source:string;minScore:number;minMargin:number;requireMerchantMatch:boolean;active?:boolean;
};
export type MatchingPolicyRecommendation={
  windowDays:number;sampleWithSuggestions:number;topChosen:number;autoEligibleCases:number;autoEligibleRejected:number;
  topChoiceRate:number;autoAcceptanceRate:number;recommendation:string;currentScore:number;currentMargin:number;
  proposedScore:number;proposedMargin:number;requireMerchantMatch:boolean;evidenceNote:string;
  minimumSuggestedDecisions:number;minimumAutoEligibleCases:number;neverRelaxesAutomatically:boolean;requiresExplicitApproval:boolean;
};
export type MatchingPolicyProposal={
  proposalId:number;createdAt:string;status:string;proposedScore:number;proposedMargin:number;recommendation:string;evidenceNote:string;
  sampleWithSuggestions:number;autoEligibleCases:number;autoEligibleRejected:number;topChoiceRate:number;autoAcceptanceRate:number;
};
export type MatchingPolicyDashboard={
  version:string;activePolicy:MatchingPolicy;recommendation:MatchingPolicyRecommendation;pendingProposal:MatchingPolicyProposal|null;
  policyHistory:MatchingPolicy[];rules:{manualApprovalRequired:boolean;rollbackAvailable:boolean;neverAutoApply:boolean;neverAutoRelax:boolean};
};

const parsePolicy=(value:unknown):MatchingPolicy=>{const x=asRecord(value);return{
  policyId:asNumber(x.policyId),createdAt:asString(x.createdAt),source:asString(x.source),minScore:asNumber(x.minScore,93),minMargin:asNumber(x.minMargin,8),
  requireMerchantMatch:asBoolean(x.requireMerchantMatch),active:typeof x.active==="boolean"?x.active:undefined,
}};
const parseRecommendation=(value:unknown):MatchingPolicyRecommendation=>{const x=asRecord(value);return{
  windowDays:asNumber(x.windowDays,90),sampleWithSuggestions:asNumber(x.sampleWithSuggestions),topChosen:asNumber(x.topChosen),
  autoEligibleCases:asNumber(x.autoEligibleCases),autoEligibleRejected:asNumber(x.autoEligibleRejected),topChoiceRate:asNumber(x.topChoiceRate),
  autoAcceptanceRate:asNumber(x.autoAcceptanceRate),recommendation:asString(x.recommendation,"insufficient_evidence"),
  currentScore:asNumber(x.currentScore,93),currentMargin:asNumber(x.currentMargin,8),proposedScore:asNumber(x.proposedScore,93),
  proposedMargin:asNumber(x.proposedMargin,8),requireMerchantMatch:asBoolean(x.requireMerchantMatch),evidenceNote:asString(x.evidenceNote),
  minimumSuggestedDecisions:asNumber(x.minimumSuggestedDecisions,20),minimumAutoEligibleCases:asNumber(x.minimumAutoEligibleCases,5),
  neverRelaxesAutomatically:asBoolean(x.neverRelaxesAutomatically),requiresExplicitApproval:asBoolean(x.requiresExplicitApproval),
}};
const parseProposal=(value:unknown):MatchingPolicyProposal|null=>{if(!value)return null;const x=asRecord(value);if(!Object.keys(x).length)return null;return{
  proposalId:asNumber(x.proposalId),createdAt:asString(x.createdAt),status:asString(x.status),proposedScore:asNumber(x.proposedScore),proposedMargin:asNumber(x.proposedMargin),
  recommendation:asString(x.recommendation),evidenceNote:asString(x.evidenceNote),sampleWithSuggestions:asNumber(x.sampleWithSuggestions),
  autoEligibleCases:asNumber(x.autoEligibleCases),autoEligibleRejected:asNumber(x.autoEligibleRejected),topChoiceRate:asNumber(x.topChoiceRate),
  autoAcceptanceRate:asNumber(x.autoAcceptanceRate),
}};

export async function getDocumentMatchingPolicyDashboard(days=90):Promise<MatchingPolicyDashboard>{
  const safeDays=Math.max(7,Math.min(365,Number.isFinite(days)?Math.trunc(days):90));
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_document_matching_policy_dashboard",{p_days:safeDays});
  if(error||!data)throw new Error(error?.message||"document_matching_policy_unavailable");
  const r=asRecord(data),rules=asRecord(r.rules);
  return{
    version:asString(r.version,APP_VERSION),activePolicy:parsePolicy(r.activePolicy),recommendation:parseRecommendation(r.recommendation),
    pendingProposal:parseProposal(r.pendingProposal),policyHistory:asArray(r.policyHistory).map(parsePolicy),
    rules:{manualApprovalRequired:asBoolean(rules.manualApprovalRequired),rollbackAvailable:asBoolean(rules.rollbackAvailable),neverAutoApply:asBoolean(rules.neverAutoApply),neverAutoRelax:asBoolean(rules.neverAutoRelax)},
  };
}
