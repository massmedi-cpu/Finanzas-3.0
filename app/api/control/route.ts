import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { asNumber,asRecord,asString,nullableString } from "@/lib/validation/json";

const monthDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}$/.test(value)?`${value}-01`:null;
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const month=monthDate(request.nextUrl.searchParams.get("month"));
  const {data,error}=await supabase.rpc("financial_app_control_center",{p_month:month});
  if(error||!data)return apiFailure("control.center",error,"control_center_unavailable");
  return apiJson(data);
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  let body:unknown;try{body=await request.json();}catch{return apiError("invalid_json");}const input=asRecord(body);const kind=asString(input.kind);
  if(kind==="alert"){
    const key=asString(input.key).trim();const action=asString(input.action);
    if(!key||!["open","resolved","dismissed","snoozed"].includes(action))return apiError("invalid_alert_action");
    const {data,error}=await supabase.rpc("financial_app_set_control_alert_state",{p_alert_key:key,p_action:action,p_days:asNumber(input.days,7),p_note:nullableString(input.note)});
    if(error||!data)return apiFailure("control.alert",error,"alert_update_failed");
    return apiJson(data);
  }
  if(kind==="close"){
    const month=monthDate(input.month);if(!month)return apiError("invalid_month");
    const {data,error}=await supabase.rpc("financial_app_close_month",{p_month:month,p_notes:nullableString(input.notes)});
    if(error||!data)return apiFailure("control.close_month",error,"month_close_failed");
    return apiJson(data);
  }
  if(kind==="reopen"){
    const month=monthDate(input.month);if(!month)return apiError("invalid_month");
    const {data,error}=await supabase.rpc("financial_app_reopen_month",{p_month:month});
    if(error||!data)return apiFailure("control.reopen_month",error,"month_reopen_failed");
    return apiJson(data);
  }
  return apiError("unsupported_action");
}
