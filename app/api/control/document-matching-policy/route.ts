import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError,apiFailure,apiJson,apiUnauthorized } from "@/lib/api/response";
import { asNumber,asRecord,asString } from "@/lib/validation/json";

export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  let body:unknown;try{body=await request.json();}catch{return apiError("invalid_json");}
  const input=asRecord(body);const action=asString(input.action);const days=Math.max(7,Math.min(365,Math.trunc(asNumber(input.days,90))));
  if(action==="generate"){
    const {data,error}=await supabase.rpc("financial_app_document_matching_policy_generate",{p_days:days});
    if(error||!data)return apiFailure("matching.policy.generate",error,"policy_generate_failed");
    return apiJson(data);
  }
  if(action==="apply"||action==="reject"){
    const proposalId=Math.trunc(asNumber(input.proposalId));if(proposalId<=0)return apiError("invalid_proposal_id");
    const rpc=action==="apply"?"financial_app_document_matching_policy_apply":"financial_app_document_matching_policy_reject";
    const {data,error}=await supabase.rpc(rpc,{p_proposal_id:proposalId});
    if(error||!data)return apiFailure(`matching.policy.${action}`,error,`policy_${action}_failed`);
    return apiJson(data);
  }
  if(action==="rollback"){
    const {data,error}=await supabase.rpc("financial_app_document_matching_policy_rollback");
    if(error||!data)return apiFailure("matching.policy.rollback",error,"policy_rollback_failed");
    return apiJson(data);
  }
  return apiError("unsupported_action");
}
