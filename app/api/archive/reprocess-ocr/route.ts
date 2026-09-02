import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { BULK_OCR_REPROCESS_LIMIT, isBulkOcrReprocessCandidate } from "@/lib/document/ocr-bulk-reprocess-policy";
import { buildStoredReceiptPersistence, reprocessStoredReceiptBytes } from "@/lib/document/server-archive-ocr-reprocess";
import { asRecord } from "@/lib/validation/json";
import type { ArchiveDetail, ArchiveDocument } from "@/lib/financial/archive";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const DISCOVERY_PAGE_SIZE=80;
const UNRESOLVED_OCR=new Set(["needs_review","failed","error"]);

type AuthorizedClient=NonNullable<Awaited<ReturnType<typeof getAuthorizedClient>>>;

async function documentDetail(supabase:AuthorizedClient,id:string){
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});
  return detail.error||!detail.data?null:detail.data as ArchiveDetail;
}

async function discoverCandidates(supabase:AuthorizedClient){
  const candidates:Array<{id:string;fileName:string;ocrStatus:string}>=[];
  let total=0;
  let offset=0;
  let pendingTotal=Number.POSITIVE_INFINITY;

  // Recorremos únicamente el ciclo Pending, por páginas, sin cargar la biblioteca
  // activa completa en memoria ni consultar imágenes ya resueltas/archivadas.
  while(offset<pendingTotal){
    const overview=await supabase.rpc("financial_app_archive_lifecycle_overview",{
      p_state:"pending",
      p_search:null,
      p_limit:DISCOVERY_PAGE_SIZE,
      p_offset:offset,
    });
    if(overview.error||!overview.data)return{error:overview.error,data:null};
    const payload=overview.data as {total:number;documents:ArchiveDocument[]};
    pendingTotal=payload.total;
    if(!payload.documents.length)break;

    for(const document of payload.documents){
      if(!UNRESOLVED_OCR.has(document.ocrStatus))continue;
      if(!document.mimeType?.startsWith("image/")||document.storageProvider!=="supabase_storage"||document.links.length>0)continue;
      // Solo los documentos ya marcados como no resueltos requieren detalle.
      // Así excluimos un OCR actual ya reprocesado sin N+1 sobre imágenes complete.
      const detail=await documentDetail(supabase,document.id);
      if(!detail||!isBulkOcrReprocessCandidate(detail))continue;
      total+=1;
      if(candidates.length<BULK_OCR_REPROCESS_LIMIT)candidates.push({id:document.id,fileName:document.fileName,ocrStatus:document.ocrStatus});
    }
    offset+=payload.documents.length;
  }

  return{error:null,data:{
    total,
    candidates,
    limit:BULK_OCR_REPROCESS_LIMIT,
    remaining:Math.max(0,total-candidates.length),
    truncated:false,
  }};
}

export async function GET(){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  const discovered=await discoverCandidates(supabase);
  if(discovered.error||!discovered.data)return apiFailure("archive.ocr.reprocess.discover",discovered.error,"ocr_reprocess_discovery_failed");
  return apiJson({ok:true,...discovered.data});
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  let raw:unknown;
  try{raw=await request.json();}catch{return apiError("invalid_json");}
  const documentId=String(asRecord(raw).documentId||"").trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId))return apiError("invalid_document_id");

  const initial=await documentDetail(supabase,documentId);
  if(!initial)return apiError("document_unavailable",404);
  if(!isBulkOcrReprocessCandidate(initial))return apiJson({ok:true,documentId,updated:false,skipped:true,reason:"no_longer_candidate"});
  if(initial.storageProvider!=="supabase_storage"||!initial.storagePath)return apiJson({ok:true,documentId,updated:false,skipped:true,reason:"private_original_unavailable"});

  const stored=await supabase.storage.from("financial-app-documents").download(initial.storagePath);
  if(stored.error||!stored.data)return apiFailure("archive.ocr.reprocess.original",stored.error,"ocr_original_unavailable",404);

  let result:Awaited<ReturnType<typeof reprocessStoredReceiptBytes>>["result"];
  try{
    const processed=await reprocessStoredReceiptBytes(Buffer.from(await stored.data.arrayBuffer()),initial,initial.mimeType||"image/jpeg");
    result=processed.result;
  }catch(failure){
    console.error("financial_app_archive_ocr_reprocess_failed",{documentId,name:failure instanceof Error?failure.name:"unknown"});
    return apiError("ocr_reprocess_failed",503);
  }

  // Releer justo antes de escribir evita pisar una confirmación manual, un vínculo
  // o una corrección guardada mientras el OCR estaba trabajando.
  const latest=await documentDetail(supabase,documentId);
  if(!latest)return apiError("document_unavailable",404);
  if(!isBulkOcrReprocessCandidate(latest))return apiJson({ok:true,documentId,updated:false,skipped:true,reason:"changed_during_reprocess"});
  const persistence=buildStoredReceiptPersistence(latest,result);

  const updated=await supabase.rpc("financial_app_archive_update",{
    p_id:documentId,
    p_document_type:persistence.documentType,
    p_document_date:persistence.documentDate,
    p_amount:persistence.amount,
    p_merchant:persistence.merchant,
    p_notes:latest.notes,
    p_ocr_text:persistence.ocrText,
    p_ocr_data:persistence.ocrData,
    p_digital_reconstruction:persistence.digitalReconstruction,
    p_ocr_status:persistence.ocrStatus,
  });
  if(updated.error)return apiFailure("archive.ocr.reprocess.update",updated.error,"ocr_reprocess_update_failed");

  return apiJson({
    ok:true,
    documentId,
    updated:true,
    skipped:false,
    ocrStatus:persistence.ocrStatus,
    method:persistence.method,
    validationStatus:persistence.validationStatus,
    humanFieldsPreserved:persistence.humanFieldsPreserved,
  });
}
