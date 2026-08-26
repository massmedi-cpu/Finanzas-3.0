import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { madridToday } from "@/lib/time/madrid";

const validMonth=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}$/.test(value)?`${value}-01`:null;
const asRecord=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const month=validMonth(request.nextUrl.searchParams.get("month"))||madridToday();
  const {data,error}=await supabase.rpc("financial_app_budget_month",{p_month:month});
  if(error||!data)return apiFailure("budget.month",error,"budget_unavailable");
  return apiJson(data);
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  let parsed:unknown;try{parsed=await request.json();}catch{return apiError("invalid_json");}
  const body=asRecord(parsed);if(!body)return apiError("invalid_budget");
  const month=validMonth(body.month);const amount=Number(body.amount);const category=typeof body.category==="string"?body.category.trim():"";
  if(!month||!category||!Number.isFinite(amount)||amount<0)return apiError("invalid_budget");
  const {data,error}=await supabase.rpc("financial_app_upsert_budget",{p_budget_id:typeof body.id==="string"&&body.id?body.id:null,p_month:month,p_category:category,p_subcategory:typeof body.subcategory==="string"&&body.subcategory?body.subcategory:null,p_amount:amount,p_carryover:Boolean(body.carryover),p_notes:typeof body.notes==="string"&&body.notes?body.notes:null});
  if(error||!data)return apiFailure("budget.update",error,"budget_update_failed");
  return apiJson(data);
}

export async function DELETE(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const id=request.nextUrl.searchParams.get("id");if(!id)return apiError("missing_id");
  const {data,error}=await supabase.rpc("financial_app_deactivate_budget",{p_budget_id:id});
  if(error||!data)return apiFailure("budget.delete",error,"budget_delete_failed");
  return apiJson(data);
}
