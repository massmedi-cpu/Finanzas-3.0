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
type RecoveryOutcome={
  id:string;
  fileName:string;
  tone:"success"|"review"|"muted"|"error";
  title:string;
  detail:string;
};

function preservedLabel(fields:string[]|undefined){
  const labels:Record<string,string>={documentType:"tipo",documentDate:"fecha",amount:"importe",merchant:"comercio",ocrText:"texto OCR"};
  return (fields||[]).map(field=>labels[field]||field).join(", ");
}

function outcomeFor(candidate:Candidate,response:ReprocessResponse):RecoveryOutcome{
  const preserved=response.humanFieldsPreserved||[];
  if(response.skipped||!response.updated){
    return{id:candidate.id,fileName:candidate.fileName,tone:"muted",title:"Omitido de forma segura",detail:"El documento cambió durante la lectura o ya no necesitaba recuperación. No se ha sobrescrito nada."};
  }
  if(response.ocrStatus==="complete"){
    return{id:candidate.id,fileName:candidate.fileName,tone:"success",title:"OCR validado",detail:"La nueva lectura desde el original ha superado la validación automática."};
  }
  const correction=preserved.length?` Se han conservado tus correcciones en ${preservedLabel(preserved)}.`:"";
  return{id:candidate.id,fileName:candidate.fileName,tone:"review",title:"Sigue pendiente de revisión",detail:`La nueva lectura se ha guardado como evidencia provisional.${correction}`};
}

export function ArchiveBulkOcrRecovery({initialCount,shouldCheck}:{initialCount:number;shouldCheck:boolean}){
  const router=useRouter();
  const [plan,setPlan]=useState<PlanResponse|null>(null);
  const [loading,setLoading]=useState(shouldCheck);
  const [running,setRunning]=useState(false);
  const [done,setDone]=useState(0);
  const [current,setCurrent]=useState("");
  const [message,setMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [outcomes,setOutcomes]=useState<RecoveryOutcome[]>([]);

  const loadPlan=useCallback(async()=>{
    const response=await fetch("/api/archive/reprocess-ocr",{cache:"no-store"});
    const body=await response.json() as PlanResponse;
    if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo comprobar el OCR pendiente");
    setPlan(body);
    return body;
  },[]);

  useEffect(()=>{
    if(!shouldCheck){setLoading(false);return;}
    let active=true;
    setLoading(true);
    void loadPlan().catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"No se pudo comprobar el OCR pendiente")}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[shouldCheck,loadPlan]);

  async function runBulkRecovery(){
    if(running)return;
    setRunning(true);setDone(0);setCurrent("");setMessage(null);setError(null);setOutcomes([]);
    try{
      const fresh=await loadPlan();
      const selected=fresh.candidates;
      if(!selected.length){setMessage("No hay OCR pendientes de recuperación automática.");return;}
      let updated=0,complete=0,review=0,failed=0,skipped=0,preserved=0;
      const nextOutcomes:RecoveryOutcome[]=[];
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
          if(!response.ok||!body.ok){
            failed+=1;
            nextOutcomes.push({id:candidate.id,fileName:candidate.fileName,tone:"error",title:"No se pudo releer",detail:"La evidencia y los datos anteriores permanecen intactos."});
            continue;
          }
          const outcome=outcomeFor(candidate,body);
          nextOutcomes.push(outcome);
          if(body.skipped||!body.updated){skipped+=1;continue;}
          updated+=1;
          if(body.ocrStatus==="complete")complete+=1;else review+=1;
          if((body.humanFieldsPreserved?.length||0)>0)preserved+=1;
        }catch{
          failed+=1;
          nextOutcomes.push({id:candidate.id,fileName:candidate.fileName,tone:"error",title:"No se pudo releer",detail:"La evidencia y los datos anteriores permanecen intactos."});
          continue;
        }finally{
          setDone(index+1);
        }
      }
      setOutcomes(nextOutcomes);
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

  if(!shouldCheck&&!message&&!error&&!outcomes.length)return null;
  if(!loading&&plan&&plan.total===0&&!message&&!error&&!outcomes.length)return null;
  const batchSize=plan?.candidates.length||0;
  const visibleCount=plan?.total??initialCount;
  return <div className="archive-bulk-recovery">
    <div className="archive-library-note">
      <span><strong>Recuperación OCR</strong><br/>{loading&&!plan?"Comprobando documentos pendientes…":running?`Procesando ${Math.min(done+1,batchSize)}/${batchSize}${current?` · ${current}`:""}`:visibleCount?`${visibleCount} documento${visibleCount===1?"":"s"} puede${visibleCount===1?"":"n"} releerse desde el original privado.`:"No hay documentos pendientes de recuperación automática."}</span>
      {Boolean(visibleCount)&&<button className="secondary-action" type="button" onClick={runBulkRecovery} disabled={running||loading} aria-busy={running||undefined}>{running?"Actualizando OCR…":`Actualizar OCR pendientes · ${visibleCount}`}</button>}
    </div>
    {!running&&Boolean(visibleCount)&&<div className="ocr-warning" role="note"><strong>Los datos detectados todavía no están confirmados</strong><span>Mientras un documento indique «Revisar OCR», su fecha, comercio e importe deben tratarse como provisionales. La recuperación vuelve a leer el original, pero solo un OCR validado o una revisión manual confirma esos datos.</span></div>}
    {running&&<div className="ocr-progress" role="status"><div><span>{current||"Preparando lote OCR"}</span><b>{batchSize?Math.round(done/batchSize*100):0}%</b></div><progress max={Math.max(1,batchSize)} value={done}/><small>Originales procesados uno a uno. Una relectura fallida no sustituye la evidencia anterior ni una revisión manual.</small></div>}
    {!running&&plan&&plan.remaining>0&&<div className="archive-library-note"><span>Este lote está limitado a {plan.limit} originales para proteger rendimiento. Quedan {plan.remaining} para una siguiente pasada.</span></div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}
    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {outcomes.length>0&&<div className="archive-recovery-results" aria-label="Resultado de la recuperación OCR">
      <strong>Resultado por documento</strong>
      <div className="link-list">{outcomes.map(outcome=><div key={outcome.id} data-recovery-tone={outcome.tone}><span><strong>{outcome.fileName}</strong><small>{outcome.title} · {outcome.detail}</small></span></div>)}</div>
    </div>}
  </div>;
}
