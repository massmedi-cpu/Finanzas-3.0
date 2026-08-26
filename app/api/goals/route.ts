import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { asNumber,asRecord,asString,nullableString } from "@/lib/validation/json";

const validDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
export const dynamic="force-dynamic";

export async function GET(){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {data,error}=await supabase.rpc("financial_app_goals");
  if(error||!data)return apiFailure("goals.list",error,"goals_unavailable");
  return apiJson(data);
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  let body:unknown;try{body=await request.json();}catch{return apiError("invalid_json");}const input=asRecord(body);
  const targetAmount=asNumber(input.targetAmount,Number.NaN),manualAmount=asNumber(input.manualAmount,0),name=asString(input.name).trim();
  if(!name||!Number.isFinite(targetAmount)||targetAmount<=0||!Number.isFinite(manualAmount)||manualAmount<0)return apiError("invalid_goal");
  const {data,error}=await supabase.rpc("financial_app_upsert_goal",{p_goal_id:nullableString(input.id),p_name:name,p_goal_type:asString(input.type,"savings"),p_target_amount:targetAmount,p_progress_mode:asString(input.progressMode,"manual"),p_manual_amount:manualAmount,p_account_id:nullableString(input.accountId),p_target_date:validDate(input.targetDate),p_priority:asString(input.priority,"medium"),p_notes:nullableString(input.notes)});
  if(error||!data)return apiFailure("goals.update",error,"goal_update_failed");
  return apiJson(data);
}

export async function DELETE(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const id=request.nextUrl.searchParams.get("id");if(!id)return apiError("missing_id");
  const {data,error}=await supabase.rpc("financial_app_deactivate_goal",{p_goal_id:id});
  if(error||!data)return apiFailure("goals.delete",error,"goal_delete_failed");
  return apiJson(data);
}
