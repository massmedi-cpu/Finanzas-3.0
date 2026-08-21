import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";

async function authorizedClient(){
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getUser();
  const email=normalizeEmail(data.user?.email);
  if(error||!data.user||!(await hasFinancialAppAccess(supabase,email))) return null;
  return supabase;
}
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await authorizedClient(); if(!supabase) return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const search=request.nextUrl.searchParams.get("search");
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search||null,p_limit:100,p_offset:0,p_include_archived:false});
  if(error||!data) return NextResponse.json({ok:false,error:error?.message||"archive_unavailable"},{status:400});
  return NextResponse.json({...data,ok:true},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:NextRequest){
  const supabase=await authorizedClient(); if(!supabase) return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let body:any; try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}
  const {data,error}=await supabase.rpc("financial_app_archive_create",{
    p_file_name:String(body?.fileName||""), p_mime_type:String(body?.mimeType||""), p_storage_path:String(body?.storagePath||""),
    p_file_size:Number(body?.fileSize||0), p_content_hash:String(body?.contentHash||"")
  });
  if(error||!data) return NextResponse.json({ok:false,error:error?.message||"archive_create_failed"},{status:400});
  return NextResponse.json({ok:true,id:data},{headers:{"Cache-Control":"private, no-store"}});
}
