import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";

async function authorizedClient(){
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getUser();
  const email=normalizeEmail(data.user?.email);
  if(error||!data.user||!(await hasFinancialAppAccess(supabase,email)))return null;
  return supabase;
}

async function updatedDocument(supabase:Awaited<ReturnType<typeof createClient>>,id:string){
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(detail.error||!detail.data)throw new Error(detail.error?.message||"document_unavailable");
  return detail.data;
}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;
  const body=await request.json().catch(()=>null);
  const sourceId=String(body?.sourceId||"");
  const {data,error}=await supabase.rpc("financial_app_archive_link",{p_document_id:id,p_source_id:sourceId});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"link_failed"},{status:400});
  try{return NextResponse.json({ok:true,document:await updatedDocument(supabase,id)},{headers:{"Cache-Control":"private, no-store"}})}
  catch(cause){return NextResponse.json({ok:false,error:cause instanceof Error?cause.message:"document_unavailable"},{status:500})}
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();
  if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;
  const sourceId=request.nextUrl.searchParams.get("sourceId")||"";
  const {data,error}=await supabase.rpc("financial_app_archive_unlink",{p_document_id:id,p_source_id:sourceId});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"unlink_failed"},{status:400});
  try{return NextResponse.json({ok:true,document:await updatedDocument(supabase,id)},{headers:{"Cache-Control":"private, no-store"}})}
  catch(cause){return NextResponse.json({ok:false,error:cause instanceof Error?cause.message:"document_unavailable"},{status:500})}
}
