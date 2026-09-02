import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiRedirect, apiUnauthorized } from "@/lib/api/response";
import { processDocumentStorageCleanup } from "@/lib/document/storage-cleanup";
import { manualReviewMissingFields } from "@/lib/document/ocr-review-completeness";
import { resolveOcrReviewStatus } from "@/lib/document/ocr-review-transition";
import { asRecord } from "@/lib/validation/json";
import { validateReceiptFinancials } from "@/lib/document/receipt-financial-validator";
import type { ReceiptLayout } from "@/lib/document/receipt-layout";
export const dynamic="force-dynamic";

function receiptLayoutFromReconstruction(value:unknown){
  if(!value||typeof value!=="object")return null;
  const layout=(value as Record<string,unknown>).receiptLayout;
  if(!layout||typeof layout!=="object")return null;
  const candidate=layout as Partial<ReceiptLayout>;
  if(!Array.isArray(candidate.header)||!Array.isArray(candidate.items)||!Array.isArray(candidate.summary)||!Array.isArray(candidate.footer))return null;
  return candidate as ReceiptLayout;
}

function comparableReviewValue(value:unknown){return value==null||value===""?"":String(value).trim();}
function nextOrExisting(next:Record<string,unknown>,existing:Record<string,unknown>,key:string){return Object.prototype.hasOwnProperty.call(next,key)?next[key]:existing[key];}

function guardedOcrInput(input:Record<string,unknown>,existing:Record<string,unknown>){
  const next={...input};
  const manualReviewConfirmed=next.manualReviewConfirmed===true;
  delete next.manualReviewConfirmed;
  const incomingData=next.ocrData&&typeof next.ocrData==="object"?{...(next.ocrData as Record<string,unknown>)}:null;
  const existingData=existing.ocrData&&typeof existing.ocrData==="object"?existing.ocrData as Record<string,unknown>:null;
  const data=incomingData||existingData;
  const method=String(data?.method||"");
  const machineReceipt=method.startsWith("image_ocr_receipt_");
  if(!machineReceipt)return{input:next,manualReviewMissing:[] as string[]};
  const rawText=String(data?.rawText||next.ocrText||existing.ocrText||"");
  if(incomingData&&!incomingData.rawText&&rawText)incomingData.rawText=rawText;
  const reconstruction=Object.prototype.hasOwnProperty.call(next,"digitalReconstruction")?next.digitalReconstruction:existing.digitalReconstruction;
  const layout=receiptLayoutFromReconstruction(reconstruction);
  const validation=validateReceiptFinancials(layout,rawText?[rawText]:[]);
  if(incomingData){incomingData.validation=validation;next.ocrData=incomingData;}
  const reviewSensitiveChanged=["documentType","documentDate","amount","merchant","ocrText"].some(key=>
    Object.prototype.hasOwnProperty.call(next,key)&&comparableReviewValue(next[key])!==comparableReviewValue(existing[key])
  );
  const manualReviewMissing=manualReviewConfirmed?manualReviewMissingFields(
    nextOrExisting(next,existing,"documentType"),
    nextOrExisting(next,existing,"documentDate"),
    nextOrExisting(next,existing,"amount"),
  ):[];
  const resolvedStatus=resolveOcrReviewStatus({
    existingStatus:existing.ocrStatus,
    incomingStatus:next.ocrStatus,
    manualReviewConfirmed:manualReviewConfirmed&&manualReviewMissing.length===0,
    newMachineEvidence:Boolean(incomingData),
    reviewSensitiveChanged,
    validationStatus:validation.status,
    rawText,
  });
  if(resolvedStatus)next.ocrStatus=resolvedStatus;else delete next.ocrStatus;
  return{input:next,manualReviewMissing};
}

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {id}=await params;const {data,error}=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(error||!data)return apiFailure("archive.document.read",error,"document_unavailable",404);
  let signedUrl:string|null=data.storageProvider==="google_drive"?(data.storageUrl||null):null;
  if(data.storageProvider==="supabase_storage"&&data.storagePath){const signed=await supabase.storage.from("financial-app-documents").createSignedUrl(data.storagePath,300);signedUrl=signed.data?.signedUrl||null;}
  if(request.nextUrl.searchParams.get("original")==="1"){
    if(!signedUrl)return apiError("original_unavailable",404);
    return apiRedirect(signedUrl);
  }
  return apiJson({ok:true,document:data,signedUrl});
}

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {id}=await params;let body:unknown;try{body=await request.json();}catch{return apiError("invalid_json");}const rawInput=asRecord(body);
  const current=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(current.error||!current.data)return apiFailure("archive.document.patch.read",current.error,"document_unavailable",404);
  if(!Object.keys(rawInput).length)return apiJson({ok:true,document:current.data});
  const existing=current.data as Record<string,unknown>;
  const guarded=guardedOcrInput(rawInput,existing);
  if(guarded.manualReviewMissing.length)return apiError("manual_review_incomplete",422,{missingFields:guarded.manualReviewMissing});
  const input=guarded.input;
  const has=(key:string)=>Object.prototype.hasOwnProperty.call(input,key);
  const {error}=await supabase.rpc("financial_app_archive_update",{
    p_id:id,
    p_document_type:has("documentType")?input.documentType:existing.documentType,
    p_document_date:has("documentDate")?input.documentDate:existing.documentDate,
    p_amount:has("amount")?input.amount:existing.amount,
    p_merchant:has("merchant")?input.merchant:existing.merchant,
    p_notes:has("notes")?input.notes:existing.notes,
    p_ocr_text:has("ocrText")?input.ocrText:existing.ocrText,
    p_ocr_data:has("ocrData")?input.ocrData:existing.ocrData,
    p_digital_reconstruction:has("digitalReconstruction")?input.digitalReconstruction:existing.digitalReconstruction,
    p_ocr_status:has("ocrStatus")?input.ocrStatus:existing.ocrStatus
  });
  if(error)return apiFailure("archive.document.patch",error,"document_update_failed");
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(detail.error||!detail.data)return apiFailure("archive.document.patch.reload",detail.error,"document_unavailable",404);
  return apiJson({ok:true,document:detail.data});
}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {id}=await params;const action=request.nextUrl.searchParams.get("action");
  if(action==="archive"){
    const {data,error}=await supabase.rpc("financial_app_archive_archive",{p_id:id});
    if(error||!data)return apiFailure("archive.document.archive",error,"archive_failed");
    return apiJson({ok:true,action:"archive"});
  }
  if(action==="restore"){
    const {data,error}=await supabase.rpc("financial_app_archive_restore",{p_id:id});
    if(error||!data)return apiFailure("archive.document.restore",error,"restore_failed");
    return apiJson({ok:true,action:"restore"});
  }
  return apiError("unsupported_action");
}

export async function DELETE(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const {id}=await params;
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(detail.error||!detail.data)return apiFailure("archive.document.delete.read",detail.error,"document_unavailable",404);
  const deleted=await supabase.rpc("financial_app_archive_delete",{p_id:id});
  if(deleted.error||!deleted.data)return apiFailure("archive.document.delete",deleted.error,"delete_failed");
  const cleanup=await processDocumentStorageCleanup(supabase,25);
  return apiJson({
    ok:true,
    storageCleanupPending:cleanup.remaining==null||cleanup.remaining>0||cleanup.failed>0,
    externalOriginalPreserved:detail.data.storageProvider==="google_drive",
  });
}
