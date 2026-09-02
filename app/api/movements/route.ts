import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import type { MovementsResponse } from "@/lib/financial/movements";
import { movementRpcFilterParams } from "@/lib/financial/movement-api-params";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const q=request.nextUrl.searchParams;
  const{data,error}=await supabase.rpc("financial_app_movements_advanced",{
    p_page:Math.max(1,Number(q.get("page")||1)),
    p_page_size:Math.min(200,Math.max(1,Number(q.get("pageSize")||50))),
    ...movementRpcFilterParams(q),
  });
  if(error||!data)return apiFailure("movements.list",error,"movements_unavailable");
  const result=data as MovementsResponse;
  if(q.get("facets")==="0"){const page={...result} as Partial<MovementsResponse>;delete page.facets;return apiJson(page)}
  return apiJson(result);
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const body=await request.json().catch(()=>null);
  if(body?.kind!=="seen"||!Array.isArray(body.ids))return apiError("invalid_action");
  const ids=[...new Set(body.ids.filter((id:unknown)=>typeof id==="string"&&/^[0-9a-f-]{36}$/i.test(id)).slice(0,200))];
  if(!ids.length)return apiJson({ok:true,updated:0});
  const{data,error}=await supabase.rpc("financial_app_mark_new_seen",{p_ids:ids});
  if(error)return apiFailure("movements.mark_seen",error,"mark_seen_failed");
  return apiJson({ok:true,updated:Number(data||0)});
}
