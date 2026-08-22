import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";

const validDate=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
const safeDays=(v:unknown)=>{const n=Number(v);return [30,60,90,180,365].includes(n)?n:90;};
const allowedFrequency=new Set(["once","weekly","monthly","yearly"]);

export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
  const supabase=await createClient();
  const {data:userData,error:userError}=await supabase.auth.getUser();
  const email=normalizeEmail(userData.user?.email);
  if(userError||!userData.user||!(await hasFinancialAppAccess(supabase,email)))return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let body:any;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}
  const date=validDate(body?.date);const start=validDate(body?.start);const amount=Number(body?.amount);const title=String(body?.title||"Escenario").trim().slice(0,120)||"Escenario";
  const frequency=String(body?.frequency||"once").toLowerCase();const interval=Math.max(1,Math.min(12,Number(body?.interval)||1));const occurrences=Math.max(1,Math.min(60,Number(body?.occurrences)||1));
  if(!date||!start||!Number.isFinite(amount)||amount===0||Math.abs(amount)>10000000||!allowedFrequency.has(frequency))return NextResponse.json({ok:false,error:"invalid_scenario"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_forecast_scenario",{p_start:start,p_days:safeDays(body?.days),p_title:title,p_amount:amount,p_scenario_date:date,p_frequency:frequency,p_interval:interval,p_occurrences:occurrences});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"scenario_unavailable"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
