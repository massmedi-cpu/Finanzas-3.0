import { NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";

const noStore={"Cache-Control":"private, no-store"};
const asRecord=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
export const dynamic="force-dynamic";

export async function GET(){
  const supabase=await getAuthorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401,headers:noStore});
  const {data,error}=await supabase.rpc("financial_app_rules_overview");
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"rules_unavailable"},{status:400,headers:noStore});
  return NextResponse.json(data,{headers:noStore});
}

export async function POST(request:Request){
  const supabase=await getAuthorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401,headers:noStore});
  let parsed:unknown;
  try{parsed=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400,headers:noStore});}
  const body=asRecord(parsed);
  if(!body)return NextResponse.json({ok:false,error:"invalid_payload"},{status:400,headers:noStore});
  const kind=typeof body.kind==="string"?body.kind:"";
  const id=typeof body.id==="string"&&body.id.trim()?body.id.trim():null;
  const rule=asRecord(body.rule);

  if(kind==="preview"){
    if(!rule)return NextResponse.json({ok:false,error:"invalid_rule"},{status:400,headers:noStore});
    const {data,error}=await supabase.rpc("financial_app_preview_rule",{p_rule:rule});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"rule_preview_failed"},{status:400,headers:noStore});
    return NextResponse.json(data,{headers:noStore});
  }
  if(kind==="save"){
    if(!rule)return NextResponse.json({ok:false,error:"invalid_rule"},{status:400,headers:noStore});
    const {data,error}=await supabase.rpc("financial_app_upsert_rule",{p_rule_id:id,p_rule:rule});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"rule_save_failed"},{status:400,headers:noStore});
    return NextResponse.json(data,{headers:noStore});
  }
  if(!id)return NextResponse.json({ok:false,error:"invalid_rule_id"},{status:400,headers:noStore});
  if(kind==="apply"){
    const {data,error}=await supabase.rpc("financial_app_apply_rule",{p_rule_id:id});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"rule_apply_failed"},{status:400,headers:noStore});
    return NextResponse.json(data,{headers:noStore});
  }
  if(kind==="deactivate"){
    const {data,error}=await supabase.rpc("financial_app_deactivate_rule",{p_rule_id:id});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"rule_deactivate_failed"},{status:400,headers:noStore});
    return NextResponse.json(data,{headers:noStore});
  }
  if(kind==="revert"){
    const {data,error}=await supabase.rpc("financial_app_revert_rule",{p_rule_id:id});
    if(error||!data)return NextResponse.json({ok:false,error:error?.message||"rule_revert_failed"},{status:400,headers:noStore});
    return NextResponse.json(data,{headers:noStore});
  }
  return NextResponse.json({ok:false,error:"unsupported_action"},{status:400,headers:noStore});
}
