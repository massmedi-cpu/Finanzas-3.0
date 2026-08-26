import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

const asRecord=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
export const dynamic="force-dynamic";

export async function GET(){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {data,error}=await supabase.rpc("financial_app_rules_overview");
  if(error||!data)return apiFailure("rules.overview",error,"rules_unavailable");
  return apiJson(data);
}

export async function POST(request:Request){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  let parsed:unknown;try{parsed=await request.json();}catch{return apiError("invalid_json");}
  const body=asRecord(parsed);if(!body)return apiError("invalid_payload");
  const kind=typeof body.kind==="string"?body.kind:"";const id=typeof body.id==="string"&&body.id.trim()?body.id.trim():null;const rule=asRecord(body.rule);
  if(kind==="preview"){
    if(!rule)return apiError("invalid_rule");
    const {data,error}=await supabase.rpc("financial_app_preview_rule",{p_rule:rule});if(error||!data)return apiFailure("rules.preview",error,"rule_preview_failed");return apiJson(data);
  }
  if(kind==="save"){
    if(!rule)return apiError("invalid_rule");
    const {data,error}=await supabase.rpc("financial_app_upsert_rule",{p_rule_id:id,p_rule:rule});if(error||!data)return apiFailure("rules.save",error,"rule_save_failed");return apiJson(data);
  }
  if(!id)return apiError("invalid_rule_id");
  if(kind==="apply"){
    const {data,error}=await supabase.rpc("financial_app_apply_rule",{p_rule_id:id});if(error||!data)return apiFailure("rules.apply",error,"rule_apply_failed");return apiJson(data);
  }
  if(kind==="deactivate"){
    const {data,error}=await supabase.rpc("financial_app_deactivate_rule",{p_rule_id:id});if(error||!data)return apiFailure("rules.deactivate",error,"rule_deactivate_failed");return apiJson(data);
  }
  if(kind==="revert"){
    const {data,error}=await supabase.rpc("financial_app_revert_rule",{p_rule_id:id});if(error||!data)return apiFailure("rules.revert",error,"rule_revert_failed");return apiJson(data);
  }
  return apiError("unsupported_action");
}
