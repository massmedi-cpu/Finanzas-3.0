"use client";
import { useEffect } from "react";
export function AcknowledgeNewMovements({ids}:{ids:string[]}){useEffect(()=>{if(!ids.length)return;void fetch("/api/movements",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"seen",ids}),keepalive:true}).catch(()=>undefined)},[ids]);return null}
