import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const raw=Number(request.nextUrl.searchParams.get("days")||90);
  const days=Math.max(30,Math.min(180,Number.isFinite(raw)?Math.trunc(raw):90));
  const {data,error}=await supabase.rpc("financial_app_matching_observability",{p_recent_days:days});
  if(error||!data)return apiFailure("control.matching_quality",error,"matching_observability_unavailable");
  return apiJson(data);
}
