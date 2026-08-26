import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { asNumber, asRecord, asString } from "@/lib/validation/json";

export const dynamic="force-dynamic";

function boundedInteger(value:string|null,fallback:number,min:number,max:number){
  const parsed=Number.parseInt(value??"",10);
  return Number.isFinite(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
}

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient(); if(!supabase) return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const search=request.nextUrl.searchParams.get("search");
  const limit=boundedInteger(request.nextUrl.searchParams.get("limit"),200,1,200);
  const offset=boundedInteger(request.nextUrl.searchParams.get("offset"),0,0,1_000_000);
  const includeArchived=request.nextUrl.searchParams.get("archived")!=="0";
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search||null,p_limit:limit,p_offset:offset,p_include_archived:includeArchived});
  if(error||!data) return NextResponse.json({ok:false,error:error?.message||"archive_unavailable"},{status:400});
  const payload=asRecord(data);
  const documents=Array.isArray(payload.documents)?payload.documents:[];
  return NextResponse.json({...payload,ok:true,hasMore:documents.length>=limit},{headers:{"Cache-Control":"private, no-store"}});
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
