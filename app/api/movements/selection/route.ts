import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { movementRpcFilterParams } from "@/lib/financial/movement-api-params";

export const dynamic="force-dynamic";

type MovementSelectionResponse={
  ok:boolean;
  ids:string[];
  total:number;
  limit:number;
  truncated:boolean;
  error?:string;
};

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  const q=request.nextUrl.searchParams;
  const requestedLimit=Number(q.get("limit")||200);
  const p_limit=Math.min(200,Math.max(1,Number.isFinite(requestedLimit)?Math.trunc(requestedLimit):200));
  const{data,error}=await supabase.rpc("financial_app_movements_selection",{
    p_limit,
    ...movementRpcFilterParams(q),
  });
  if(error||!data)return apiFailure("movements.selection",error,"movement_selection_unavailable");
  const result=data as MovementSelectionResponse;
  return apiJson({
    ok:true,
    ids:Array.isArray(result.ids)?result.ids.filter(id=>typeof id==="string").slice(0,p_limit):[],
    total:Number(result.total||0),
    limit:p_limit,
    truncated:Boolean(result.truncated),
  });
}
