import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";
async function authorizedClient(){const supabase=await createClient();const {data,error}=await supabase.auth.getUser();const email=normalizeEmail(data.user?.email);if(error||!data.user||!(await hasFinancialAppAccess(supabase,email)))return null;return supabase;}
export const dynamic="force-dynamic";

export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const {data,error}=await supabase.rpc("financial_app_archive_document",{p_id:id});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"document_unavailable"},{status:404});
  let signedUrl:string|null=null;
  if(data.storagePath){const signed=await supabase.storage.from("financial-app-documents").createSignedUrl(data.storagePath,300);signedUrl=signed.data?.signedUrl||null;}
  return NextResponse.json({ok:true,document:data,signedUrl},{headers:{"Cache-Control":"private, no-store"}});
}

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;let body:any;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}
  const {error}=await supabase.rpc("financial_app_archive_update",{
    p_id:id,p_document_type:body.documentType??null,p_document_date:body.documentDate??null,p_amount:body.amount??null,p_merchant:body.merchant??null,
    p_notes:body.notes??null,p_ocr_text:body.ocrText??null,p_ocr_data:body.ocrData??null,p_digital_reconstruction:body.digitalReconstruction??null,p_ocr_status:body.ocrStatus??null
  });
  if(error)return NextResponse.json({ok:false,error:error.message},{status:400});
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});
  return NextResponse.json({ok:true,document:detail.data},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const action=request.nextUrl.searchParams.get("action");
  if(action!=="restore")return NextResponse.json({ok:false,error:"unsupported_action"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_archive_restore",{p_id:id});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"restore_failed"},{status:400});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const permanent=request.nextUrl.searchParams.get("permanent")==="1";
  if(!permanent){const {data,error}=await supabase.rpc("financial_app_archive_archive",{p_id:id});if(error||!data)return NextResponse.json({ok:false,error:error?.message||"archive_failed"},{status:400});return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});}
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});if(detail.error||!detail.data)return NextResponse.json({ok:false,error:detail.error?.message||"document_unavailable"},{status:404});
  if(detail.data.storagePath){const removed=await supabase.storage.from("financial-app-documents").remove([detail.data.storagePath]);if(removed.error)return NextResponse.json({ok:false,error:`storage_delete_failed: ${removed.error.message}`},{status:400});}
  const deleted=await supabase.rpc("financial_app_archive_delete",{p_id:id});if(deleted.error||!deleted.data)return NextResponse.json({ok:false,error:deleted.error?.message||"delete_failed"},{status:400});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}
