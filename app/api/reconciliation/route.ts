import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

export const dynamic = "force-dynamic";

function statusParam(value:string|null){
  return value==="pending"||value==="not_reconciled"?value:null;
}
function boundedInt(value:string|null,fallback:number,min:number,max:number){
  const parsed=Number(value);
  return Number.isInteger(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
}

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  const status=statusParam(request.nextUrl.searchParams.get("status"));
  const limit=boundedInt(request.nextUrl.searchParams.get("limit"),25,1,100);
  const offset=boundedInt(request.nextUrl.searchParams.get("offset"),0,0,1000000);
  const {data,error}=await supabase.rpc("financial_app_reconciliation_queue",{p_status:status,p_limit:limit,p_offset:offset});
  if(error||!data)return apiFailure("reconciliation.queue",error,"reconciliation_queue_unavailable");
  return apiJson(data);
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  let body:unknown;
  try{body=await request.json();}catch{return apiError("invalid_json");}
  if(!body||typeof body!=="object"||Array.isArray(body))return apiError("invalid_request");
  const input=body as Record<string,unknown>;
  const action=String(input.action||"");

  if(action==="set_status"){
    const id=String(input.id||"");
    const status=String(input.status||"");
    const reason=input.reason==null?null:String(input.reason);
    const expectedUpdatedAt=input.expectedUpdatedAt==null?null:String(input.expectedUpdatedAt);
    if(!id||!["reconciled","not_reconciled","source"].includes(status))return apiError("invalid_reconciliation_decision");
    const {data,error}=await supabase.rpc("financial_app_set_reconciliation_status",{
      p_transaction_id:id,p_status:status,p_reason:reason,p_expected_updated_at:expectedUpdatedAt,
    });
    if(error||!data)return apiFailure("reconciliation.set_status",error,"reconciliation_update_failed");
    return apiJson(data);
  }

  if(action==="pair"){
    const id=String(input.id||"");
    const candidateId=String(input.candidateId||"");
    const expectedUpdatedAt=String(input.expectedUpdatedAt||"");
    const candidateExpectedUpdatedAt=String(input.candidateExpectedUpdatedAt||"");
    const reason=String(input.reason||"");
    if(!id||!candidateId)return apiError("invalid_request");
    const {data,error}=await supabase.rpc("financial_app_reconcile_pair_safe",{
      p_a:id,p_b:candidateId,p_expected_a_updated_at:expectedUpdatedAt||null,
      p_expected_b_updated_at:candidateExpectedUpdatedAt||null,p_reason:reason,
    });
    if(error||!data)return apiFailure("reconciliation.pair",error,"reconciliation_pair_failed");
    return apiJson(data);
  }

  return apiError("invalid_action");
}
