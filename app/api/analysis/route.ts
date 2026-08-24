import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase) return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const raw=Number(request.nextUrl.searchParams.get("year"));
  const year=Number.isInteger(raw)&&raw>=2000&&raw<=2100?raw:new Date().getFullYear();
  const {data,error}=await supabase.rpc("financial_app_analysis_overview",{p_year:year});
  if(error||!data) return NextResponse.json({ok:false,error:error?.message||"analysis_unavailable"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
