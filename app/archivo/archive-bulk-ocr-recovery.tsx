"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Candidate={id:string;fileName:string;ocrStatus:string};
type PlanResponse={ok:true;total:number;candidates:Candidate[];limit:number;remaining:number;truncated:boolean;error?:string};
type ReprocessResponse={
  ok:boolean;
  documentId?:string;
  updated?:boolean;
  skipped?:boolean;
  reason?:string;
  ocrStatus?:string;
  humanFieldsPreserved?:string[];
  error?:string;
};

export function ArchiveBulkOcrRecovery({refreshKey}:{refreshKey:string}){
  const router=useRouter();
  const [plan,setPlan]=useState<PlanResponse|null>(null);
  const [loading,setLoading]=useState(true);
  const [running,setRunning]=useState(false);
  const [done,setDone]=useState(0);
  const [current,setCurrent]=useState("");
  const [message,setMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  const loadPlan=useCallback(async()=>{
    const response=await fetch("/api/archive/reprocess-ocr",{cache:"no-store"});
    const body=await response.json() as PlanResponse;
    if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo comprobar el OCR pendiente");
    setPlan(body);
    return body;
  },[]);

  useEffect(()=>{
    let active=true;
    setLoading(true);
    void loadPlan().catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"No se pudo comprobar el OCR pendiente")}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[loadPlan,refreshKey]);

  async function runBulkRecovery(){
    if(running)return;
    setRunning(true);setDone(0);setCurrent("");setMessage(null);setError(null);
    try{
      const fresh=await loadPlan();
      const selected=fresh.candidates;
      if(!selected.length){setMessage("No hay OCR pendientes de recuperación automática.");return;}
      let updated=0,complete=0,review=0,failed=0,skipped=0,preserved=0;
      for(let index=0;index<selected.length;index++){
        const candidate=selected[index];
        setCurrent(candidate.fileName);setDone(index);
        try{
          const response=await fetch("/api/archive/reprocess-ocr",{
            method:"POST",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({documentId:candidate.id}),
          });
          const body=await response.json().catch(()=>({ok:false,error:"ocr_reprocess_failed"})) as ReprocessResponse;
          if(!response.ok||!body.ok){failed+=1;continue;}
          if(body.skipped||!body.updated){skipped+=1;continue;}
          updated+=1;
          if(body.ocrStatus==="complete")complete+=1;else review+=1;
          if((body.humanFieldsPreserved?.length||0)>0)preserved+=1;
        }catch{
          failed+=1;
          continue;
        }finally{
          setDone(index+1);
        }
      }
      const parts=[`${updated} actualizado${updated===1?"":"s"}`,`${complete} validado${complete===1?"":"s"}`,`${review} en revisión`];
      if(preserved)parts.push(`${preserved} con correcciones humanas preservadas`);
      if(skipped)parts.push(`${skipped} omitido${skipped===1?"":"s"} por cambio de estado`);
      if(failed)parts.push(`${failed} fallo${failed===1?"":"s"} sin sustituir la evidencia anterior`);
      setMessage(`Recuperación OCR terminada · ${parts.join(" · ")}.`);
      if(failed)setError("Algún original no pudo releerse. Los resultados anteriores de esos documentos se han conservado intactos.");
      await loadPlan();
      router.refresh();
    }catch(cause){
      setError(cause instanceof Error?cause.message:"No se pudo ejecutar la recuperación OCR");
    }finally{
      setRunning(false);setCurrent("");
    }
  }

  if(!loading&&!plan?.total&&!message&&!error)return null;
  const batchSize=plan?.candidates.length||0;
  return <div className="archive-bulk-recovery">
    <div className="archive-library-note">
      <span><strong>Recuperación OCR</strong><br/>{loading&&!plan?"Comprobando documentos pendientes…":running?`Procesando ${Math.min(done+1,batchSize)}/${batchSize}${current?` · ${current}`:""}`:plan?.total?`${plan.total} documento${plan.total===1?"":"s"} puede${plan.total===1?"":"n"} releerse desde el original privado.`:"No hay documentos pendientes de recuperación automática."}</span>
      {Boolean(plan?.total)&&<button className="secondary-action" type="button" onClick={runBulkRecovery} disabled={running||loading} aria-busy={running||undefined}>{running?"Actualizando OCR…":`Actualizar OCR pendientes · ${plan?.total||0}`}</button>}
    </div>
    {running&&<div className="ocr-progress" role="status"><div><span>{current||"Preparando lote OCR"}</span><b>{batchSize?Math.round(done/batchSize*100):0}%</b></div><progress max={Math.max(1,batchSize)} value={done}/><small>Originales procesados uno a uno. Una relectura fallida no sustituye la evidencia anterior ni una revisión manual.</small></div>}
    {!running&&plan&&plan.remaining>0&&<div className="archive-library-note"><span>Este lote está limitado a {plan.limit} originales para proteger rendimiento. Quedan {plan.remaining} para una siguiente pasada.</span></div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}
    {error&&<div className="inline-alert error" role="alert">{error}</div>}
  </div>;
}
