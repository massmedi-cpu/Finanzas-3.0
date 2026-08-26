import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

type AuthorizedClient=NonNullable<Awaited<ReturnType<typeof getAuthorizedClient>>>;

async function updatedDocument(supabase:AuthorizedClient,id:string){
  return supabase.rpc("financial_app_archive_document",{p_id:id});
}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {id}=await params;
  const body=await request.json().catch(()=>null) as {sourceId?:unknown}|null;
  const sourceId=String(body?.sourceId||"");
  const {data,error}=await supabase.rpc("financial_app_archive_link",{p_document_id:id,p_source_id:sourceId});
  if(error||!data)return apiFailure("archive.link",error,"link_failed");
  const detail=await updatedDocument(supabase,id);
  if(detail.error||!detail.data)return apiFailure("archive.link.reload",detail.error,"document_unavailable",500);
  return apiJson({ok:true,document:detail.data});
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {id}=await params;
  const sourceId=request.nextUrl.searchParams.get("sourceId")||"";
  const {data,error}=await supabase.rpc("financial_app_archive_unlink",{p_document_id:id,p_source_id:sourceId});
  if(error||!data)return apiFailure("archive.unlink",error,"unlink_failed");
  const detail=await updatedDocument(supabase,id);
  if(detail.error||!detail.data)return apiFailure("archive.unlink.reload",detail.error,"document_unavailable",500);
  return apiJson({ok:true,document:detail.data});
}
