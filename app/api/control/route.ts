import { NextRequest,NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { asNumber,asRecord,asString,nullableString } from "@/lib/validation/json";

const monthDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}$/.test(value)?`${value}-01`:null;
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const month=monthDate(request.nextUrl.searchParams.get("month"));
  const {data,error}=await supabase.rpc("financial_app_control_center",{p_month:month});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"control_center_unavailable"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let body:unknown;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}const input=asRecord(body);const kind=asString(input.kind);
  if(kind==="alert"){
    const key=asString(input.key).trim();const action=asString(input.action);
    if(!key||!["open","resolved","dismissed","snoozed"].includes(action))return NextResponse.json({ok:false,error:"invalid_alert_action"},{status:400});
    const {data,error}=await supabase.rpc("financial_app_set_control_alert_state",{p_alert_key:key,p_action:action,p_days:asNumber(input.days,7),p_note:nullableString(input.note)});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"alert_update_failed"},{status:400});
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }
  if(kind==="close"){
    const month=monthDate(input.month);if(!month)return NextResponse.json({ok:false,error:"invalid_month"},{status:400});
    const {data,error}=await supabase.rpc("financial_app_close_month",{p_month:month,p_notes:nullableString(input.notes)});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"month_close_failed"},{status:400});
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }
  if(kind==="reopen"){
    const month=monthDate(input.month);if(!month)return NextResponse.json({ok:false,error:"invalid_month"},{status:400});
    const {data,error}=await supabase.rpc("financial_app_reopen_month",{p_month:month});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"month_reopen_failed"},{status:400});
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }
  return NextResponse.json({ok:false,error:"unsupported_action"},{status:400});
}
