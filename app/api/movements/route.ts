import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import type { MovementsResponse } from "@/lib/financial/movements";

function numberParam(value:string|null){if(!value)return null;const number=Number(value.replace(",","."));return Number.isFinite(number)?number:null}
function booleanParam(value:string|null):boolean|null{if(value==null||value==="")return null;const normalized=value.toLowerCase();if(["1","true","yes","si","sí"].includes(normalized))return true;if(["0","false","no"].includes(normalized))return false;return null}
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const q=request.nextUrl.searchParams;
  const{data,error}=await supabase.rpc("financial_app_movements_advanced",{p_page:Math.max(1,Number(q.get("page")||1)),p_page_size:Math.min(200,Math.max(1,Number(q.get("pageSize")||50))),p_search:q.get("search")||null,p_account_id:q.get("account")||null,p_type:q.get("type")||null,p_category:q.get("category")||null,p_subcategory:q.get("subcategory")||null,p_channel:q.get("channel")||null,p_tag:q.get("tag")||null,p_review_only:q.get("review")==="1",p_recurring:booleanParam(q.get("recurring")),p_internal_transfer:booleanParam(q.get("internalTransfer")),p_reconciled:booleanParam(q.get("reconciled")),p_has_documents:booleanParam(q.get("documents")),p_has_splits:booleanParam(q.get("splits")),p_date_from:q.get("from")||null,p_date_to:q.get("to")||null,p_min_amount:numberParam(q.get("min")),p_max_amount:numberParam(q.get("max")),p_sort:q.get("sort")||"date_desc",p_merchant:q.get("merchant")||null,p_cash_flow_only:booleanParam(q.get("cashFlow"))===true,p_duplicate:booleanParam(q.get("duplicate"))});
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
