import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY,SUPABASE_URL } from "@/lib/supabase/config";
import { asArray,asNumber,asRecord,asString,nullableString } from "@/lib/validation/json";
import { inferDocumentMetadata,type DocumentMetadata } from "./ticket-ocr";
import { extractServerPdfText,ServerPdfTextError } from "./server-pdf-text";
import { SERVER_RECEIPT_OCR_ENGINE,SERVER_RECEIPT_OCR_MODEL,SERVER_RECEIPT_OCR_RUNTIME } from "./receipt-ocr-provenance";
import { recognizeServerReceiptImage,ServerReceiptOcrError } from "./server-receipt-ocr";

const MAX_BATCH=2;
const MAX_SOURCE_BYTES=12*1024*1024;
const BUDGET_MS=32_000;

type Claim={
  documentId:string;fileName:string;mimeType:string;fileSize:number|null;sourceModifiedAt:string;attempt:number;
  documentType:string;documentDate:string|null;amount:number|null;merchant:string|null;
};
export type DriveContentHydrationSummary={
  prepared:number;pending:number;claimed:number;completed:number;review:number;failed:number;linked:number;budgetStopped:boolean;
};

function claimFrom(value:unknown):Claim|null{
  const x=asRecord(value);const documentId=asString(x.documentId),sourceModifiedAt=asString(x.sourceModifiedAt),mimeType=asString(x.mimeType);if(!documentId||!sourceModifiedAt||!mimeType)return null;
  return{documentId,fileName:asString(x.fileName),mimeType,fileSize:x.fileSize==null?null:asNumber(x.fileSize),sourceModifiedAt,attempt:asNumber(x.attempt),documentType:asString(x.documentType)||"other",documentDate:nullableString(x.documentDate),amount:x.amount==null?null:asNumber(x.amount),merchant:nullableString(x.merchant)};
}
function norm(value:string|null|undefined){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();}
function merchantAgrees(left:string,right:string){const a=norm(left),b=norm(right);return Boolean(a&&b&&(a===b||a.includes(b)||b.includes(a)));}
function mergedMetadata(claim:Claim,inferred:DocumentMetadata):DocumentMetadata{
  return{documentType:inferred.documentType!=="other"?inferred.documentType:claim.documentType||"other",documentDate:inferred.documentDate||claim.documentDate,amount:inferred.amount??claim.amount,merchant:inferred.merchant||claim.merchant,lines:inferred.lines};
}
function completeMetadata(meta:DocumentMetadata){return meta.documentType!=="other"&&Boolean(meta.documentDate)&&meta.amount!=null&&Number.isFinite(meta.amount)&&Boolean(meta.merchant?.trim());}
function imageAgreement(claim:Claim,inferred:DocumentMetadata){
  let compared=0,agreed=0;
  if(claim.documentDate&&inferred.documentDate){compared++;if(claim.documentDate===inferred.documentDate)agreed++;}
  if(claim.amount!=null&&inferred.amount!=null){compared++;if(Math.abs(Math.abs(claim.amount)-Math.abs(inferred.amount))<=0.02)agreed++;}
  if(claim.merchant&&inferred.merchant){compared++;if(merchantAgrees(claim.merchant,inferred.merchant))agreed++;}
  if(claim.documentType&&claim.documentType!=="other"&&inferred.documentType!=="other"){compared++;if(claim.documentType===inferred.documentType)agreed++;}
  return{compared,agreed};
}
async function markFailure(supabase:SupabaseClient,claim:Claim,errorCode:string,retryable:boolean){
  await supabase.rpc("financial_app_drive_document_hydration_fail",{p_document_id:claim.documentId,p_source_modified_at:claim.sourceModifiedAt,p_error_code:errorCode,p_retryable:retryable});
}
async function complete(supabase:SupabaseClient,claim:Claim,meta:DocumentMetadata,text:string,ocrData:Record<string,unknown>,ocrStatus:"complete"|"needs_review"){
  const{error}=await supabase.rpc("financial_app_complete_drive_document_hydration",{p_document_id:claim.documentId,p_source_modified_at:claim.sourceModifiedAt,p_document_type:meta.documentType,p_document_date:meta.documentDate,p_amount:meta.amount,p_merchant:meta.merchant,p_ocr_text:text,p_ocr_data:ocrData,p_ocr_status:ocrStatus});
  if(error)throw new Error(`hydration_complete_${error.code||"failed"}`);
}
async function sourceBytes(accessToken:string,claim:Claim){
  const response=await fetch(`${SUPABASE_URL}/functions/v1/financial-app-drive-document-source`,{method:"POST",headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${accessToken}`,"content-type":"application/json"},body:JSON.stringify({documentId:claim.documentId}),cache:"no-store"});
  if(!response.ok){const retryable=response.status>=500;throw new ServerReceiptOcrError(`drive_source_${response.status}`,response.status,retryable);}
  const modified=response.headers.get("x-drive-source-modified-at")||"";if(modified&&modified!==claim.sourceModifiedAt)throw new ServerReceiptOcrError("drive_source_stale",409,false);
  const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.byteLength||bytes.byteLength>MAX_SOURCE_BYTES)throw new ServerReceiptOcrError(bytes.byteLength?"drive_source_too_large":"drive_source_empty",bytes.byteLength?413:422,false);
  return bytes;
}
async function processClaim(supabase:SupabaseClient,accessToken:string,claim:Claim){
  const bytes=await sourceBytes(accessToken,claim);
  if(claim.mimeType==="application/pdf"){
    const pdf=await extractServerPdfText(bytes);
    if(!pdf.useful){
      const meta:DocumentMetadata={documentType:claim.documentType,documentDate:claim.documentDate,amount:claim.amount,merchant:claim.merchant,lines:[]};
      await complete(supabase,claim,meta,"",{method:"drive_auto_pdf_scan_pending_v1",automaticOnSync:true,sourceModifiedAt:claim.sourceModifiedAt,pagesRead:pdf.pagesRead,totalPages:pdf.totalPages,truncated:pdf.truncated,reason:"scanned_pdf_requires_visual_ocr"},"needs_review");
      return"review" as const;
    }
    const inferred=inferDocumentMetadata(pdf.text,claim.documentType==="receipt"?"receipt":null);const meta=mergedMetadata(claim,inferred);const status=completeMetadata(meta)?"complete":"needs_review";
    await complete(supabase,claim,meta,pdf.text,{method:"drive_auto_pdf_text_v1",automaticOnSync:true,sourceModifiedAt:claim.sourceModifiedAt,pagesRead:pdf.pagesRead,totalPages:pdf.totalPages,truncated:pdf.truncated,textCharacters:pdf.text.length},status);
    return status==="complete"?"completed" as const:"review" as const;
  }
  if(claim.mimeType.startsWith("image/")){
    const recognized=await recognizeServerReceiptImage(bytes,{maxBytes:MAX_SOURCE_BYTES,timeoutMs:25_000,queueTimeoutMs:3_000});const inferred=inferDocumentMetadata(recognized.rawText,claim.documentType==="receipt"?"receipt":null);const meta=mergedMetadata(claim,inferred);const agreement=imageAgreement(claim,inferred);const highConfidence=(recognized.confidence??0)>=85;const status=completeMetadata(meta)&&highConfidence&&agreement.compared>=2&&agreement.agreed===agreement.compared?"complete":"needs_review";
    await complete(supabase,claim,meta,recognized.rawText,{engine:SERVER_RECEIPT_OCR_ENGINE,model:SERVER_RECEIPT_OCR_MODEL,runtime:recognized.runtime||SERVER_RECEIPT_OCR_RUNTIME,method:"drive_auto_image_tesseract_v1",automaticOnSync:true,sourceModifiedAt:claim.sourceModifiedAt,confidence:recognized.confidence,recognizedCount:recognized.metrics.recognizedCount,image:recognized.image,agreement},status);
    return status==="complete"?"completed" as const:"review" as const;
  }
  throw new ServerReceiptOcrError("drive_source_unsupported",415,false);
}
function errorInfo(error:unknown){
  if(error instanceof ServerReceiptOcrError)return{code:error.code,retryable:error.retryable};
  if(error instanceof ServerPdfTextError)return{code:error.code,retryable:error.retryable};
  return{code:error instanceof Error?error.message:"drive_hydration_failed",retryable:true};
}

export async function processDriveDocumentHydration(supabase:SupabaseClient,accessToken:string):Promise<DriveContentHydrationSummary>{
  const summary:DriveContentHydrationSummary={prepared:0,pending:0,claimed:0,completed:0,review:0,failed:0,linked:0,budgetStopped:false};const started=Date.now();
  const prepared=await supabase.rpc("financial_app_prepare_drive_document_hydration",{p_limit:100});if(prepared.error)throw new Error(`hydration_prepare_${prepared.error.code||"failed"}`);const prep=asRecord(prepared.data);summary.prepared=asNumber(prep.queued);summary.pending=asNumber(prep.pending);

  for(let index=0;index<MAX_BATCH;index++){
    if(Date.now()-started>=BUDGET_MS){summary.budgetStopped=true;break;}
    const pending=await supabase.rpc("financial_app_drive_document_hydration_pending",{p_limit:1});if(pending.error)throw new Error(`hydration_claim_${pending.error.code||"failed"}`);const payload=asRecord(pending.data);const claim=claimFrom(asArray(payload.items)[0]);if(!claim)break;summary.claimed++;
    try{const outcome=await processClaim(supabase,accessToken,claim);if(outcome==="completed")summary.completed++;else summary.review++;}
    catch(error){const info=errorInfo(error);summary.failed++;await markFailure(supabase,claim,info.code,info.retryable).catch(()=>undefined);console.error("financial_app_drive_content_hydration_failed",{documentId:claim.documentId,code:info.code,retryable:info.retryable});}
  }

  if(summary.completed>0){const finalized=await supabase.rpc("financial_app_finalize_document_links_after_hydration");if(!finalized.error)summary.linked=asNumber(asRecord(finalized.data).linked);}
  return summary;
}
