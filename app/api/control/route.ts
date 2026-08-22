import { NextRequest,NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess,normalizeEmail } from "@/lib/auth/access";

async function authorizedClient(){
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getUser();
  const email=normalizeEmail(data.user?.email);
  if(error||!data.user||!(await hasFinancialAppAccess(supabase,email)))return null;
  return supabase;
}
const monthDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}$/.test(value)?`${value}-01`:null;
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const month=monthDate(request.nextUrl.searchParams.get("month"));
  const {data,error}=await supabase.rpc("financial_app_control_center",{p_month:month});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"control_center_unavailable"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let body:any;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}
  if(body?.kind==="alert"){
    const key=typeof body.key==="string"?body.key.trim():"";const action=typeof body.action==="string"?body.action:"";
    if(!key||!["open","resolved","dismissed","snoozed"].includes(action))return NextResponse.json({ok:false,error:"invalid_alert_action"},{status:400});
    const days=Number.isFinite(Number(body.days))?Number(body.days):7;
    const {data,error}=await supabase.rpc("financial_app_set_control_alert_state",{p_alert_key:key,p_action:action,p_days:days,p_note:body.note?String(body.note):null});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"alert_update_failed"},{status:400});
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }
  if(body?.kind==="close"){
    const month=monthDate(body.month);if(!month)return NextResponse.json({ok:false,error:"invalid_month"},{status:400});
    const {data,error}=await supabase.rpc("financial_app_close_month",{p_month:month,p_notes:body.notes?String(body.notes):null});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"month_close_failed"},{status:400});
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }
  if(body?.kind==="reopen"){
    const month=monthDate(body.month);if(!month)return NextResponse.json({ok:false,error:"invalid_month"},{status:400});
    const {data,error}=await supabase.rpc("financial_app_reopen_month",{p_month:month});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"month_reopen_failed"},{status:400});
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }
  return NextResponse.json({ok:false,error:"unsupported_action"},{status:400});
}
