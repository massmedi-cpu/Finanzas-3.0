import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError,apiFailure,apiJson,apiUnauthorized } from "@/lib/api/response";
import { madridToday } from "@/lib/time/madrid";
import { normalizeForecastScenario,type ScenarioEventInput,type ScenarioKind } from "@/lib/financial/forecast-scenario";

export const dynamic="force-dynamic";

const validDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
const asRecord=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
const safeDays=(value:unknown)=>Math.max(7,Math.min(180,Number(value)||90));
const kind=(value:unknown):ScenarioKind|null=>value==="once"||value==="monthly"||value==="installments"?value:null;
function horizonEnd(start:string,days:number){const date=new Date(`${start}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days-1);return date.toISOString().slice(0,10);}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  let parsed:unknown;try{parsed=await request.json();}catch{return apiError("invalid_json");}
  const body=asRecord(parsed);if(!body||!Array.isArray(body.events))return apiError("invalid_scenario");
  const days=safeDays(body.days);const start=madridToday();const end=horizonEnd(start,days);
  if(body.events.length>24)return apiError("scenario_too_many_definitions");
  const events:ScenarioEventInput[]=[];
  for(let index=0;index<body.events.length;index++){
    const raw=asRecord(body.events[index]);if(!raw)return apiError("invalid_scenario");
    const title=typeof raw.title==="string"?raw.title.trim():"";const date=validDate(raw.date);const scenarioKind=kind(raw.kind);const amount=Number(raw.amount);
    const count=scenarioKind==="once"?1:Math.max(1,Math.min(24,Number(raw.count)||1));const intervalMonths=Math.max(1,Math.min(12,Number(raw.intervalMonths)||1));
    if(!title||title.length>100||!date||date<start||date>end||!scenarioKind||!Number.isFinite(amount)||amount===0||Math.abs(amount)>100000000)return apiError("invalid_scenario");
    events.push({id:typeof raw.id==="string"&&raw.id.trim()?raw.id.trim():`scenario-${index+1}`,title,date,amount,kind:scenarioKind,count,intervalMonths});
  }
  const{data,error}=await supabase.rpc("financial_app_forecast_scenario",{p_start:start,p_days:days,p_events:events});
  if(error||!data)return apiFailure("scenario.simulate",error,"scenario_unavailable");
  return apiJson(normalizeForecastScenario(data));
}
