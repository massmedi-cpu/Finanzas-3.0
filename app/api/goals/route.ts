import { NextRequest,NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { asNumber,asRecord,asString,nullableString } from "@/lib/validation/json";

const validDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
export const dynamic="force-dynamic";

export async function GET(){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {data,error}=await supabase.rpc("financial_app_goals");if(error||!data)return NextResponse.json({ok:false,error:error?.message||"goals_unavailable"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let body:unknown;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}const input=asRecord(body);
  const targetAmount=asNumber(input.targetAmount,Number.NaN),manualAmount=asNumber(input.manualAmount,0),name=asString(input.name).trim();
  if(!name||!Number.isFinite(targetAmount)||targetAmount<=0||!Number.isFinite(manualAmount)||manualAmount<0)return NextResponse.json({ok:false,error:"invalid_goal"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_upsert_goal",{p_goal_id:nullableString(input.id),p_name:name,p_goal_type:asString(input.type,"savings"),p_target_amount:targetAmount,p_progress_mode:asString(input.progressMode,"manual"),p_manual_amount:manualAmount,p_account_id:nullableString(input.accountId),p_target_date:validDate(input.targetDate),p_priority:asString(input.priority,"medium"),p_notes:nullableString(input.notes)});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"goal_update_failed"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}

export async function DELETE(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const id=request.nextUrl.searchParams.get("id");if(!id)return NextResponse.json({ok:false,error:"missing_id"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_deactivate_goal",{p_goal_id:id});if(error||!data)return NextResponse.json({ok:false,error:error?.message||"goal_delete_failed"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
