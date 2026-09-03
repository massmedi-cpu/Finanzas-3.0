import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { BULK_OCR_REPROCESS_LIMIT, isBulkOcrReprocessCandidate, isLegacyReceiptOcrDocument } from "@/lib/document/ocr-bulk-reprocess-policy";
import { manualReviewMissingFields } from "@/lib/document/ocr-review-completeness";
import {
  buildStoredReceiptPersistence,
  reparseStoredReceiptMetadata,
  reprocessStoredReceiptBytes,
  storedReceiptFieldChanges,
  type StoredArchiveOcrPersistence,
} from "@/lib/document/server-archive-ocr-reprocess";
import { asRecord } from "@/lib/validation/json";
import type { ArchiveDetail, ArchiveDocument, ArchiveLifecycleState } from "@/lib/financial/archive";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const DISCOVERY_PAGE_SIZE=80;
const UNRESOLVED_OCR=new Set(["needs_review","failed","error"]);
const DISCOVERY_STATES:ArchiveLifecycleState[]=["pending","new","archived"];

type AuthorizedClient=NonNullable<Awaited<ReturnType<typeof getAuthorizedClient>>>;
type RecoveryMode="metadata_reparse"|"full_ocr";
type Candidate={id:string;fileName:string;ocrStatus:string;scope:"unresolved"|"legacy";lifecycleState:ArchiveLifecycleState;recoveryMode:RecoveryMode};

async function documentDetail(supabase:AuthorizedClient,id:string){
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});
  return detail.error||!detail.data?null:detail.data as ArchiveDetail;
}

function cheapDiscoveryCandidate(document:ArchiveDocument,state:ArchiveLifecycleState){
  if(!document.mimeType?.startsWith("image/")||document.storageProvider!=="supabase_storage")return false;
  // Pending puede filtrarse por estado sin abrir cada detalle. En New/Archived
  // necesitamos leer el método almacenado porque un OCR complete puede seguir
  // perteneciendo a un motor legacy.
  if(state==="pending")return UNRESOLVED_OCR.has(document.ocrStatus)||document.ocrStatus==="complete";
  return true;
}

function recoveryMode(document:ArchiveDetail):RecoveryMode{
  const reparsed=reparseStoredReceiptMetadata(document,"preview");
  return reparsed?.fieldChanges.length?"metadata_reparse":"full_ocr";
}

async function discoverCandidates(supabase:AuthorizedClient){
  const candidates:Candidate[]=[];
  const seen=new Set<string>();
  let total=0;

  for(const state of DISCOVERY_STATES){
    let offset=0;
    let stateTotal=Number.POSITIVE_INFINITY;
    while(offset<stateTotal){
      const overview=await supabase.rpc("financial_app_archive_lifecycle_overview",{
        p_state:state,
        p_search:null,
        p_limit:DISCOVERY_PAGE_SIZE,
        p_offset:offset,
      });
      if(overview.error||!overview.data)return{error:overview.error,data:null};
      const payload=overview.data as {total:number;documents:ArchiveDocument[]};
      stateTotal=payload.total;
      if(!payload.documents.length)break;

      for(const document of payload.documents){
        if(seen.has(document.id)||!cheapDiscoveryCandidate(document,state))continue;
        const detail=await documentDetail(supabase,document.id);
        if(!detail||!isBulkOcrReprocessCandidate(detail))continue;
        seen.add(document.id);
        total+=1;
        if(candidates.length<BULK_OCR_REPROCESS_LIMIT){
          candidates.push({
            id:document.id,
            fileName:document.fileName,
            ocrStatus:document.ocrStatus,
            scope:isLegacyReceiptOcrDocument(detail)?"legacy":"unresolved",
            lifecycleState:state,
            recoveryMode:recoveryMode(detail),
          });
        }
      }
      offset+=payload.documents.length;
    }
  }

  return{error:null,data:{
    total,
    candidates,
    limit:BULK_OCR_REPROCESS_LIMIT,
    remaining:Math.max(0,total-candidates.length),
    truncated:false,
  }};
}

async function persistRecovery(supabase:AuthorizedClient,documentId:string,latest:ArchiveDetail,persistence:StoredArchiveOcrPersistence){
  return supabase.rpc("financial_app_archive_update",{
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
}

function recoveryResponse(documentId:string,persistence:StoredArchiveOcrPersistence,fieldChanges:ReturnType<typeof storedReceiptFieldChanges>,mode:RecoveryMode){
  return apiJson({
    ok:true,
    documentId,
    updated:true,
    skipped:false,
    mode,
    ocrStatus:persistence.ocrStatus,
    method:persistence.method,
    validationStatus:persistence.validationStatus,
    humanFieldsPreserved:persistence.humanFieldsPreserved,
    fieldChanges,
    missingFields:manualReviewMissingFields(persistence.documentType,persistence.documentDate,persistence.amount),
  });
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

  // Primero se intenta la recuperación barata: si la evidencia visual vigente ya
  // contiene los datos, solo se ejecuta el parser actual sobre el texto guardado.
  // Se relee antes de escribir para no pisar una edición o confirmación concurrente.
  const previewReparse=reparseStoredReceiptMetadata(initial,"preview");
  if(previewReparse?.fieldChanges.length){
    const latest=await documentDetail(supabase,documentId);
    if(!latest)return apiError("document_unavailable",404);
    if(!isBulkOcrReprocessCandidate(latest))return apiJson({ok:true,documentId,updated:false,skipped:true,reason:"changed_during_reparse"});
    const reparsed=reparseStoredReceiptMetadata(latest);
    if(reparsed?.fieldChanges.length){
      const updated=await persistRecovery(supabase,documentId,latest,reparsed.persistence);
      if(updated.error)return apiFailure("archive.ocr.reprocess.metadata",updated.error,"ocr_metadata_reparse_update_failed");
      return recoveryResponse(documentId,reparsed.persistence,reparsed.fieldChanges,"metadata_reparse");
    }
  }

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

  // Releer justo antes de escribir evita pisar una confirmación manual o una
  // corrección guardada mientras el OCR estaba trabajando. Los vínculos no se
  // modifican por financial_app_archive_update y los legacy pueden conservarlos.
  const latest=await documentDetail(supabase,documentId);
  if(!latest)return apiError("document_unavailable",404);
  if(!isBulkOcrReprocessCandidate(latest))return apiJson({ok:true,documentId,updated:false,skipped:true,reason:"changed_during_reprocess"});
  const persistence=buildStoredReceiptPersistence(latest,result);
  const fieldChanges=storedReceiptFieldChanges(latest,persistence);
  const updated=await persistRecovery(supabase,documentId,latest,persistence);
  if(updated.error)return apiFailure("archive.ocr.reprocess.update",updated.error,"ocr_reprocess_update_failed");

  return recoveryResponse(documentId,persistence,fieldChanges,"full_ocr");
}
