import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { asNumber, asRecord, asString } from "@/lib/validation/json";

const validDate=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
const safeDays=(v:unknown)=>{const n=Number(v);return [30,60,90,180,365].includes(n)?n:90;};
const allowedFrequency=new Set(["once","weekly","monthly","yearly"]);
export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  let body:unknown;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}const input=asRecord(body);
  const date=validDate(input.date),start=validDate(input.start),amount=asNumber(input.amount,Number.NaN),title=asString(input.title,"Escenario").trim().slice(0,120)||"Escenario";
  const frequency=asString(input.frequency,"once").toLowerCase(),interval=Math.max(1,Math.min(12,asNumber(input.interval,1))),occurrences=Math.max(1,Math.min(60,asNumber(input.occurrences,1)));
  if(!date||!start||!Number.isFinite(amount)||amount===0||Math.abs(amount)>10000000||!allowedFrequency.has(frequency))return NextResponse.json({ok:false,error:"invalid_scenario"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_forecast_scenario",{p_start:start,p_days:safeDays(input.days),p_title:title,p_amount:amount,p_scenario_date:date,p_frequency:frequency,p_interval:interval,p_occurrences:occurrences});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"scenario_unavailable"},{status:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
