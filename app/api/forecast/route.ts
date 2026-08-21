import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";

async function authorizedClient(){const supabase=await createClient();const {data,error}=await supabase.auth.getUser();const email=normalizeEmail(data.user?.email);if(error||!data.user||!(await hasFinancialAppAccess(supabase,email)))return null;return supabase;}
const validDate=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
const safeDays=(v:unknown)=>{const n=Number(v);return [30,60,90,180,365].includes(n)?n:90;};
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {data,error}=await supabase.rpc("financial_app_forecast_overview",{p_start:new Date().toISOString().slice(0,10),p_days:safeDays(request.nextUrl.searchParams.get("days"))});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"forecast_unavailable"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let body:any;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}
  const date=validDate(body?.date);const amount=Number(body?.amount);const title=String(body?.title||"").trim();
  if(!date||!title||!Number.isFinite(amount)||amount===0)return NextResponse.json({ok:false,error:"invalid_forecast"},{status:400});
  let recurrence:any=null;
  if(body?.recurrence){const frequency=String(body.recurrence.frequency||"");const interval=Math.max(1,Math.min(24,Number(body.recurrence.interval)||1));if(!["weekly","monthly","yearly"].includes(frequency))return NextResponse.json({ok:false,error:"invalid_recurrence"},{status:400});recurrence={frequency,interval};const until=validDate(body.recurrence.until);if(until)recurrence.until=until;}
  const {data,error}=await supabase.rpc("financial_app_upsert_forecast",{p_id:body.id||null,p_title:title,p_date:date,p_amount:amount,p_category:body.category?String(body.category):null,p_subcategory:body.subcategory?String(body.subcategory):null,p_counterparty:body.counterparty?String(body.counterparty):null,p_recurrence:recurrence,p_notes:body.notes?String(body.notes):null,p_confidence:Number.isFinite(Number(body.confidence))?Number(body.confidence):1,p_explanation:body.explanation&&typeof body.explanation==="object"?body.explanation:null});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"forecast_update_failed"},{status:400});
  return NextResponse.json({ok:true,id:data},{headers:{"Cache-Control":"private, no-store"}});
}

export async function DELETE(request:NextRequest){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const id=request.nextUrl.searchParams.get("id");if(!id)return NextResponse.json({ok:false,error:"missing_id"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_cancel_forecast",{p_id:id});if(error||!data)return NextResponse.json({ok:false,error:error?.message||"forecast_cancel_failed"},{status:400});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}
