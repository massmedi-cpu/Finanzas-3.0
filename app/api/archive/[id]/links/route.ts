import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

type AuthorizedClient=NonNullable<Awaited<ReturnType<typeof getAuthorizedClient>>>;
type LinkRequest={sourceId?:unknown;acknowledgeUnreviewed?:unknown;restoreArchived?:unknown};
type ArchiveDocumentSnapshot={ocrStatus?:unknown;archivedAt?:unknown};

const UNREVIEWED_OCR_STATUSES=new Set(["pending","processing","needs_review","failed","error"]);

function normalizedOcrStatus(value:unknown){return String(value||"").trim().toLowerCase();}
function hasUnreviewedOcr(value:unknown){return UNREVIEWED_OCR_STATUSES.has(normalizedOcrStatus(value));}

async function updatedDocument(supabase:AuthorizedClient,id:string){
  return supabase.rpc("financial_app_archive_document",{p_id:id});
}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {id}=await params;
  const body=await request.json().catch(()=>null) as LinkRequest|null;
  const sourceId=String(body?.sourceId||"").trim();
  if(!sourceId)return apiError("invalid_source_id");

  const current=await updatedDocument(supabase,id);
  if(current.error||!current.data)return apiFailure("archive.link.read",current.error,"document_unavailable",404);
  const document=current.data as ArchiveDocumentSnapshot;
  const archived=Boolean(document.archivedAt);
  const unreviewed=hasUnreviewedOcr(document.ocrStatus);
  const acknowledgeUnreviewed=body?.acknowledgeUnreviewed===true;
  const restoreArchived=body?.restoreArchived===true;

  if(archived&&!restoreArchived){
    return apiError("archived_document_requires_restore",409,{archived:true});
  }
  if(unreviewed&&!acknowledgeUnreviewed){
    return apiError("document_ocr_unreviewed",409,{ocrStatus:normalizedOcrStatus(document.ocrStatus)});
  }

  const rpc=archived?"financial_app_archive_restore_and_link_calibrated":"financial_app_archive_link_calibrated";
  const {data,error}=await supabase.rpc(rpc,{p_document_id:id,p_source_id:sourceId});
  if(error||!data)return apiFailure("archive.link",error,"link_failed");
  const detail=await updatedDocument(supabase,id);
  if(detail.error||!detail.data)return apiFailure("archive.link.reload",detail.error,"document_unavailable",500);
  return apiJson({ok:true,document:detail.data,restored:archived,linkedWithUnreviewedOcr:unreviewed});
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {id}=await params;
  const sourceId=request.nextUrl.searchParams.get("sourceId")||"";
  const {data,error}=await supabase.rpc("financial_app_archive_unlink_calibrated",{p_document_id:id,p_source_id:sourceId});
  if(error||!data)return apiFailure("archive.unlink",error,"unlink_failed");
  const detail=await updatedDocument(supabase,id);
  if(detail.error||!detail.data)return apiFailure("archive.unlink.reload",detail.error,"document_unavailable",500);
  return apiJson({ok:true,document:detail.data});
}
