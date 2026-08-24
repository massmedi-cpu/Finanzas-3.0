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
  const {error}=await supabase.rpc("financial_app_archive_update",{
    p_id:id,p_document_type:input.documentType??null,p_document_date:input.documentDate??null,p_amount:input.amount??null,p_merchant:input.merchant??null,
    p_notes:input.notes??null,p_ocr_text:input.ocrText??null,p_ocr_data:input.ocrData??null,p_digital_reconstruction:input.digitalReconstruction??null,p_ocr_status:input.ocrStatus??null
  });
  if(error)return NextResponse.json({ok:false,error:error.message},{status:400});
  const autoLink=await supabase.rpc("financial_app_auto_link_documents");
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});
  return NextResponse.json({ok:true,document:detail.data,autoLink:autoLink.error?null:autoLink.data},{headers:{"Cache-Control":"private, no-store"}});
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
