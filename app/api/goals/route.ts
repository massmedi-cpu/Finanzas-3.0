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
const validDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
export const dynamic="force-dynamic";

export async function GET(){
  const supabase=await authorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {data,error}=await supabase.rpc("financial_app_goals");
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"goals_unavailable"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const supabase=await authorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let body:any;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}
  const targetAmount=Number(body?.targetAmount);const manualAmount=Number(body?.manualAmount??0);
  if(!body?.name||!Number.isFinite(targetAmount)||targetAmount<=0||!Number.isFinite(manualAmount)||manualAmount<0)return NextResponse.json({ok:false,error:"invalid_goal"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_upsert_goal",{
    p_goal_id:body.id||null,p_name:String(body.name),p_goal_type:String(body.type||"savings"),p_target_amount:targetAmount,
    p_progress_mode:String(body.progressMode||"manual"),p_manual_amount:manualAmount,p_account_id:body.accountId||null,
    p_target_date:body.targetDate?validDate(body.targetDate):null,p_priority:String(body.priority||"medium"),p_notes:body.notes?String(body.notes):null,
  });
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"goal_update_failed"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}

export async function DELETE(request:NextRequest){
  const supabase=await authorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const id=request.nextUrl.searchParams.get("id");if(!id)return NextResponse.json({ok:false,error:"missing_id"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_deactivate_goal",{p_goal_id:id});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"goal_delete_failed"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
