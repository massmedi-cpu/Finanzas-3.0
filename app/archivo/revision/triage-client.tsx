"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo,useState } from "react";
import type { ArchiveMovementRef } from "@/lib/financial/archive";
import type { DocumentTriageAction } from "@/lib/financial/document-triage";
import type { DocumentOperations } from "@/lib/financial/document-operations";
import { formatEuro } from "@/lib/format/es-es";

const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
const date=(value:string|null)=>value?dateFormat.format(new Date(`${value}T12:00:00`)):"—";
const money=(value:number|null|undefined)=>value==null?"—":formatEuro(value);
const actionLabel=(action:DocumentTriageAction)=>({review_ocr:"Revisar OCR",complete_metadata:"Completar datos",ready_to_link:"Asociación segura",review_match:"Revisar coincidencia",investigate_no_match:"Investigar sin coincidencia",archive_candidate:"Listo para archivar"}[action]);
const actionHint=(action:DocumentTriageAction)=>({review_ocr:"El documento no puede avanzar de forma fiable hasta revisar el reconocimiento.",complete_metadata:"Falta información necesaria para buscar y justificar movimientos.",ready_to_link:"Existe un candidato que cumple la política supervisada activa y puede revalidarse al confirmar.",review_match:"Hay evidencia útil, pero la decisión debe ser manual.",investigate_no_match:"No se encontró un movimiento candidato con la evidencia disponible.",archive_candidate:"Ya existe una asociación y el documento puede pasar al histórico si sigue resuelto."}[action]);

type AppliedOperation={ok:true;documentId:string;action:"link"|"archive";sourceId?:string;undo?:{action:"unlink"|"restore";sourceId?:string}};
type BatchResult={applied:number;rejected:number;results:Array<AppliedOperation|{ok:false;documentId?:string;action?:string;error?:string}>};

export function DocumentTriageClient({data}:{data:DocumentOperations}){
  const router=useRouter();
  const [busy,setBusy]=useState<string|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [lastApplied,setLastApplied]=useState<AppliedOperation[]>([]);
  const safeDocuments=useMemo(()=>data.documents.filter(document=>document.safeOperation),[data.documents]);
  const selectedDocuments=useMemo(()=>safeDocuments.filter(document=>selected.includes(document.id)),[safeDocuments,selected]);

  function toggle(documentId:string){setSelected(current=>current.includes(documentId)?current.filter(id=>id!==documentId):[...current,documentId]);}
  function selectSafe(){
    const limit=Math.max(1,Math.min(50,data.rules.maxBatchSize||50));
    setSelected(safeDocuments.slice(0,limit).map(document=>document.id));
    if(safeDocuments.length>limit)setMessage(`Se han seleccionado las primeras ${limit} acciones seguras. El resto queda para el siguiente lote.`);
  }

  async function link(documentId:string,suggestion:ArchiveMovementRef){
    if(!suggestion.sourceId)return;
    setBusy(documentId);setError(null);setMessage(null);setLastApplied([]);
    try{
      const response=await fetch(`/api/archive/${documentId}/links`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceId:suggestion.sourceId})});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo asociar el documento");
      setMessage("Documento asociado. El centro de operaciones se ha recalculado.");router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al asociar documento");}
    finally{setBusy(null);}
  }

  async function applySelected(){
    if(!selectedDocuments.length)return;
    const label=selectedDocuments.length===1?"esta acción segura":`estas ${selectedDocuments.length} acciones seguras`;
    if(!window.confirm(`¿Aplicar ${label}? El servidor volverá a validar cada documento antes de modificar nada.`))return;
    setBusy("batch");setError(null);setMessage(null);setLastApplied([]);
    try{
      const operations=selectedDocuments.map(document=>({documentId:document.id,action:document.safeOperation!.action,...(document.safeOperation!.sourceId?{sourceId:document.safeOperation!.sourceId}:{})}));
      const response=await fetch("/api/archive/operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operations})});
      const body=await response.json() as {ok?:boolean;error?:string;result?:BatchResult};
      if(!response.ok||!body.ok||!body.result)throw new Error(body.error||"No se pudieron aplicar las operaciones documentales");
      const applied=body.result.results.filter((item):item is AppliedOperation=>item.ok===true);
      setLastApplied(applied);setSelected([]);
      setMessage(`${body.result.applied} acción${body.result.applied===1?"":"es"} aplicada${body.result.applied===1?"":"s"}${body.result.rejected?`; ${body.result.rejected} rechazada${body.result.rejected===1?"":"s"} porque el estado ya no era seguro`:""}.`);
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al aplicar operaciones");}
    finally{setBusy(null);}
  }

  async function undoLast(){
    if(!lastApplied.length)return;
    setBusy("undo");setError(null);setMessage(null);
    let undone=0;const failures:string[]=[];
    for(const operation of [...lastApplied].reverse()){
      try{
        let response:Response;
        if(operation.action==="link"&&operation.sourceId){response=await fetch(`/api/archive/${operation.documentId}/links?sourceId=${encodeURIComponent(operation.sourceId)}`,{method:"DELETE"});}
        else{response=await fetch(`/api/archive/${operation.documentId}?action=restore`,{method:"POST"});}
        const body=await response.json() as {ok?:boolean;error?:string};
        if(!response.ok||!body.ok)throw new Error(body.error||"undo_failed");
        undone+=1;
      }catch(cause){failures.push(cause instanceof Error?cause.message:"undo_failed");}
    }
    setLastApplied([]);
    if(failures.length)setError(`${undone} acción${undone===1?"":"es"} deshecha${undone===1?"":"s"}; ${failures.length} no pudieron revertirse.`);
    else setMessage(`${undone} acción${undone===1?"":"es"} deshecha${undone===1?"":"s"}.`);
    setBusy(null);router.refresh();
  }

  return <div className="triage-queue">
    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}
    <div className="operations-summary" aria-label="Resumen de operaciones documentales">
      <div><span>Seguras ahora</span><strong>{data.operationSummary.safe}</strong></div><div><span>Asociar</span><strong>{data.operationSummary.link}</strong></div><div><span>Archivar</span><strong>{data.operationSummary.archive}</strong></div><div><span>Revisión manual</span><strong>{data.operationSummary.manual}</strong></div>
    </div>
    <div className="operations-toolbar" aria-label="Acciones seguras en lote">
      <div><strong>{selected.length} seleccionada{selected.length===1?"":"s"}</strong><span>Solo aparecen como seleccionables las acciones que el servidor considera seguras antes de confirmar.</span></div>
      <div className="operations-toolbar-actions"><button className="ghost" type="button" onClick={selectSafe} disabled={!safeDocuments.length||busy!==null}>Seleccionar seguras</button><button className="ghost" type="button" onClick={()=>setSelected([])} disabled={!selected.length||busy!==null}>Limpiar</button><button className="primary-action" type="button" onClick={applySelected} disabled={!selected.length||busy!==null}>{busy==="batch"?"Revalidando…":`Aplicar ${selected.length||""} seguras`}</button>{lastApplied.length>0&&<button className="secondary-action" type="button" onClick={undoLast} disabled={busy!==null}>{busy==="undo"?"Deshaciendo…":`Deshacer ${lastApplied.length}`}</button>}</div>
    </div>
    <div className="triage-summary" aria-label="Resumen de atención documental">
      <div><span>OCR</span><strong>{data.summary.reviewOcr}</strong></div><div><span>Datos</span><strong>{data.summary.completeMetadata}</strong></div><div><span>Asociación segura</span><strong>{data.summary.readyToLink}</strong></div><div><span>Matching</span><strong>{data.summary.reviewMatch}</strong></div><div><span>Sin candidato</span><strong>{data.summary.investigateNoMatch}</strong></div><div><span>Archivar</span><strong>{data.summary.archiveCandidate}</strong></div>
    </div>
    {!data.documents.length&&<div className="empty-state"><strong>No hay documentos que requieran atención.</strong><span>Todos los documentos activos están resueltos o no necesitan una acción adicional.</span></div>}
    {data.documents.map(document=>{
      const suggestions=[...document.suggestions].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
      const archiveQuery=`/archivo?view=new&q=${encodeURIComponent(document.fileName)}`;
      const canMatch=document.action==="ready_to_link"||document.action==="review_match";
      const selectedSafe=selected.includes(document.id);
      return <section className={`triage-item triage-${document.action}${document.safeOperation?" triage-safe":""}`} key={document.id}>
        <header><div className="triage-document-heading">{document.safeOperation&&<label className="operation-check"><input type="checkbox" checked={selectedSafe} onChange={()=>toggle(document.id)} disabled={busy!==null}/><span className="sr-only">Seleccionar operación segura para {document.fileName}</span></label>}<div><div className="triage-item-title"><span className="triage-priority">P{document.priorityScore}</span><span className="triage-action">{actionLabel(document.action)}</span>{document.safeOperation&&<span className="operation-safe-badge">Operación segura</span>}</div><h2>{document.fileName}</h2><p>{document.merchant||"Emisor sin identificar"} · {date(document.documentDate)} · {money(document.amount)}</p></div></div><div className="triage-header-actions">{document.storageUrl&&<a className="ghost button-link" href={document.storageUrl} target="_blank" rel="noreferrer">Original</a>}<Link className="ghost button-link" href={archiveQuery}>Abrir en Archivo</Link></div></header>
        <p className="triage-hint">{actionHint(document.action)}</p>
        {document.safeOperation&&<div className="operation-safe-note"><strong>{document.safeOperation.label}</strong><span>Se ejecutará únicamente si al confirmar sigue cumpliendo las mismas condiciones de seguridad.</span></div>}
        {!!document.reasons.length&&<ul className="triage-reasons">{document.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
        {canMatch&&suggestions.length>0&&<div className="review-candidates">{suggestions.map((candidate,index)=><article key={`${document.id}-${candidate.sourceId}`} className="review-candidate"><div><strong>{index===0?"Mejor coincidencia":"Alternativa"}</strong><span>{candidate.counterparty||candidate.concept||candidate.sourceId}</span><small>{date(candidate.date)} · {money(candidate.amount)} · score {Math.round(Number(candidate.score||0))}{candidate.scoreMargin!=null&&index===0?` · margen ${Math.round(candidate.scoreMargin)} pt`:""}</small>{candidate.reasons?.length?<small>{candidate.reasons.join(" · ")}</small>:null}</div><button className={index===0?"primary-action":"ghost"} type="button" disabled={busy!==null} onClick={()=>link(document.id,candidate)}>{busy===document.id?"Asociando…":"Asociar manualmente"}</button></article>)}</div>}
      </section>;
    })}
    <p className="triage-safety">Las operaciones seguras requieren selección y confirmación explícitas. El servidor vuelve a validar cada documento al ejecutar; los casos ambiguos nunca entran en el lote y siguen siendo manuales. Las asociaciones y el archivado seguro son reversibles.</p>
  </div>;
}
