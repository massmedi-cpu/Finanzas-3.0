import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  const raw=Number(request.nextUrl.searchParams.get("year"));
  const year=Number.isInteger(raw)&&raw>=2000&&raw<=2100?raw:new Date().getFullYear();
  const {data,error}=await supabase.rpc("financial_app_analysis_overview",{p_year:year});
  if(error||!data)return apiFailure("analysis.overview",error,"analysis_unavailable");
  return apiJson(data);
}
