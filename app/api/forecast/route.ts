import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { madridToday } from "@/lib/time/madrid";
import type { ForecastRecurrence } from "@/lib/financial/forecast";

const validDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
const safeMonths=(value:unknown)=>Math.max(1,Math.min(18,Number(value)||12));
const asRecord=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const{data,error}=await supabase.rpc("financial_app_forecast_calendar",{p_start:madridToday(),p_months:safeMonths(request.nextUrl.searchParams.get("months"))});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"forecast_calendar_unavailable"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let parsed:unknown;
  try{parsed=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}
  const body=asRecord(parsed);
  if(!body)return NextResponse.json({ok:false,error:"invalid_forecast"},{status:400});
  const date=validDate(body.date);const amount=Number(body.amount);const title=typeof body.title==="string"?body.title.trim():"";
  if(!date||!title||!Number.isFinite(amount)||amount===0)return NextResponse.json({ok:false,error:"invalid_forecast"},{status:400});
  let recurrence:ForecastRecurrence|null=null;
  const recurrenceBody=asRecord(body.recurrence);
  if(recurrenceBody){
    const frequency=String(recurrenceBody.frequency||"");
    const interval=Math.max(1,Math.min(24,Number(recurrenceBody.interval)||1));
    if(!["weekly","monthly","yearly"].includes(frequency))return NextResponse.json({ok:false,error:"invalid_recurrence"},{status:400});
    recurrence={frequency:frequency as ForecastRecurrence["frequency"],interval};
    const until=validDate(recurrenceBody.until);if(until)recurrence.until=until;
  }
  const explanation=asRecord(body.explanation);
  const{data,error}=await supabase.rpc("financial_app_upsert_forecast",{
    p_id:typeof body.id==="string"&&body.id?body.id:null,p_title:title,p_date:date,p_amount:amount,
    p_category:typeof body.category==="string"&&body.category?body.category:null,
    p_subcategory:typeof body.subcategory==="string"&&body.subcategory?body.subcategory:null,
    p_counterparty:typeof body.counterparty==="string"&&body.counterparty?body.counterparty:null,
    p_recurrence:recurrence,p_notes:typeof body.notes==="string"&&body.notes?body.notes:null,
    p_confidence:Number.isFinite(Number(body.confidence))?Number(body.confidence):1,p_explanation:explanation,
  });
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"forecast_update_failed"},{status:400});
  return NextResponse.json({ok:true,id:data},{headers:{"Cache-Control":"private, no-store"}});
}

export async function DELETE(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const id=request.nextUrl.searchParams.get("id");
  if(!id)return NextResponse.json({ok:false,error:"missing_id"},{status:400});
  const{data,error}=await supabase.rpc("financial_app_cancel_forecast",{p_id:id});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"forecast_cancel_failed"},{status:400});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}
