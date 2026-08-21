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

export async function DELETE(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const {data,error}=await supabase.rpc("financial_app_archive_archive",{p_id:id});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"archive_failed"},{status:400});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}
