import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { madridToday } from "@/lib/time/madrid";
import type { ForecastRecurrence } from "@/lib/financial/forecast";

const validDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
const safeMonths=(value:unknown)=>Math.max(1,Math.min(18,Number(value)||12));
const asRecord=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const{data,error}=await supabase.rpc("financial_app_forecast_calendar",{p_start:madridToday(),p_months:safeMonths(request.nextUrl.searchParams.get("months"))});
  if(error||!data)return apiFailure("forecast.calendar",error,"forecast_calendar_unavailable");
  return apiJson(data);
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  let parsed:unknown;try{parsed=await request.json();}catch{return apiError("invalid_json");}
  const body=asRecord(parsed);if(!body)return apiError("invalid_forecast");
  const date=validDate(body.date);const amount=Number(body.amount);const title=typeof body.title==="string"?body.title.trim():"";
  if(!date||!title||!Number.isFinite(amount)||amount===0)return apiError("invalid_forecast");
  let recurrence:ForecastRecurrence|null=null;
  const recurrenceBody=asRecord(body.recurrence);
  if(recurrenceBody){
    const frequency=String(recurrenceBody.frequency||"");const interval=Math.max(1,Math.min(24,Number(recurrenceBody.interval)||1));
    if(!["weekly","monthly","yearly"].includes(frequency))return apiError("invalid_recurrence");
    recurrence={frequency:frequency as ForecastRecurrence["frequency"],interval};const until=validDate(recurrenceBody.until);if(until)recurrence.until=until;
  }
  const explanation=asRecord(body.explanation);
  const{data,error}=await supabase.rpc("financial_app_upsert_forecast",{p_id:typeof body.id==="string"&&body.id?body.id:null,p_title:title,p_date:date,p_amount:amount,p_category:typeof body.category==="string"&&body.category?body.category:null,p_subcategory:typeof body.subcategory==="string"&&body.subcategory?body.subcategory:null,p_counterparty:typeof body.counterparty==="string"&&body.counterparty?body.counterparty:null,p_recurrence:recurrence,p_notes:typeof body.notes==="string"&&body.notes?body.notes:null,p_confidence:Number.isFinite(Number(body.confidence))?Number(body.confidence):1,p_explanation:explanation});
  if(error||!data)return apiFailure("forecast.update",error,"forecast_update_failed");
  return apiJson({ok:true,id:data});
}

export async function PATCH(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  let parsed:unknown;try{parsed=await request.json();}catch{return apiError("invalid_json");}
  const body=asRecord(parsed);if(!body)return apiError("invalid_forecast_action");
  if(body.action!=="restore")return apiError("unsupported_action");
  const eventId=typeof body.eventId==="string"?body.eventId.trim():"";if(!eventId)return apiError("missing_event_id");
  const{data,error}=await supabase.rpc("financial_app_restore_forecast_event",{p_event_id:eventId});
  if(error)return apiFailure("forecast.restore",error,"forecast_restore_failed");
  return apiJson({ok:true,restored:Boolean(data)});
}

export async function DELETE(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const eventId=request.nextUrl.searchParams.get("eventId")?.trim()||"";
  if(eventId){
    const estimatedDate=validDate(request.nextUrl.searchParams.get("date"));if(!estimatedDate)return apiError("invalid_event_date");
    const patternId=request.nextUrl.searchParams.get("patternId")?.trim()||null;const title=request.nextUrl.searchParams.get("title")?.trim()||null;
    const{data,error}=await supabase.rpc("financial_app_dismiss_forecast_event",{p_event_id:eventId,p_pattern_id:patternId,p_estimated_date:estimatedDate,p_title:title});
    if(error||!data)return apiFailure("forecast.dismiss",error,"forecast_dismiss_failed");
    return apiJson({ok:true,dismissed:true});
  }
  const id=request.nextUrl.searchParams.get("id");if(!id)return apiError("missing_id");
  const{data,error}=await supabase.rpc("financial_app_cancel_forecast",{p_id:id});
  if(error||!data)return apiFailure("forecast.cancel",error,"forecast_cancel_failed");
  return apiJson({ok:true});
}
