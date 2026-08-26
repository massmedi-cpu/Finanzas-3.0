import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { asRecord } from "@/lib/validation/json";
export const dynamic="force-dynamic";

export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const {data,error}=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"document_unavailable"},{status:404});
  let signedUrl:string|null=data.storageProvider==="google_drive"?(data.storageUrl||null):null;
  if(data.storageProvider==="supabase_storage"&&data.storagePath){const signed=await supabase.storage.from("financial-app-documents").createSignedUrl(data.storagePath,300);signedUrl=signed.data?.signedUrl||null;}
  return NextResponse.json({ok:true,document:data,signedUrl},{headers:{"Cache-Control":"private, no-store"}});
}

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;let body:unknown;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}const input=asRecord(body);
  const current=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(current.error||!current.data)return NextResponse.json({ok:false,error:current.error?.message||"document_unavailable"},{status:404});
  if(!Object.keys(input).length)return NextResponse.json({ok:true,document:current.data},{headers:{"Cache-Control":"private, no-store"}});
  const has=(key:string)=>Object.prototype.hasOwnProperty.call(input,key);
  const existing=current.data as Record<string,unknown>;
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
  if(error)return NextResponse.json({ok:false,error:error.message},{status:400});
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(detail.error||!detail.data)return NextResponse.json({ok:false,error:detail.error?.message||"document_unavailable"},{status:404});
  return NextResponse.json({ok:true,document:detail.data},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const action=request.nextUrl.searchParams.get("action");
  if(action!=="restore")return NextResponse.json({ok:false,error:"unsupported_action"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_archive_restore",{p_id:id});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"restore_failed"},{status:400});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}

export async function DELETE(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(detail.error||!detail.data)return NextResponse.json({ok:false,error:detail.error?.message||"document_unavailable"},{status:404});
  const deleted=await supabase.rpc("financial_app_archive_delete",{p_id:id});
  if(deleted.error||!deleted.data)return NextResponse.json({ok:false,error:deleted.error?.message||"delete_failed"},{status:400});
  let storageCleanupPending=false;
  if(detail.data.storageProvider==="supabase_storage"&&detail.data.storagePath){const removed=await supabase.storage.from("financial-app-documents").remove([detail.data.storagePath]);storageCleanupPending=Boolean(removed.error);}
  return NextResponse.json({ok:true,storageCleanupPending,externalOriginalPreserved:detail.data.storageProvider==="google_drive"},{headers:{"Cache-Control":"private, no-store"}});
}
