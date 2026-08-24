import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { asNumber, asRecord, asString } from "@/lib/validation/json";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient(); if(!supabase) return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const search=request.nextUrl.searchParams.get("search");
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search||null,p_limit:100,p_offset:0,p_include_archived:true});
  if(error||!data) return NextResponse.json({ok:false,error:error?.message||"archive_unavailable"},{status:400});
  return NextResponse.json({...asRecord(data),ok:true},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient(); if(!supabase) return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let body:unknown; try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}
  const input=asRecord(body);
  const {data,error}=await supabase.rpc("financial_app_archive_create",{
    p_file_name:asString(input.fileName),p_mime_type:asString(input.mimeType),p_storage_path:asString(input.storagePath),
    p_file_size:asNumber(input.fileSize),p_content_hash:asString(input.contentHash)
  });
  if(error||!data) return NextResponse.json({ok:false,error:error?.message||"archive_create_failed"},{status:400});
  return NextResponse.json({ok:true,id:data},{headers:{"Cache-Control":"private, no-store"}});
}
