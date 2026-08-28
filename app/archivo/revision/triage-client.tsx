"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ArchiveMovementRef } from "@/lib/financial/archive";
import type { DocumentTriage,DocumentTriageAction } from "@/lib/financial/document-triage";
import { formatEuro } from "@/lib/format/es-es";

const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
const date=(value:string|null)=>value?dateFormat.format(new Date(`${value}T12:00:00`)):"—";
const money=(value:number|null|undefined)=>value==null?"—":formatEuro(value);
const actionLabel=(action:DocumentTriageAction)=>({review_ocr:"Revisar OCR",complete_metadata:"Completar datos",ready_to_link:"Asociación segura",review_match:"Revisar coincidencia",investigate_no_match:"Investigar sin coincidencia",archive_candidate:"Listo para archivar"}[action]);
const actionHint=(action:DocumentTriageAction)=>({review_ocr:"El documento no puede avanzar de forma fiable hasta revisar el reconocimiento.",complete_metadata:"Falta información necesaria para buscar y justificar movimientos.",ready_to_link:"Existe un candidato que cumple la política supervisada activa.",review_match:"Hay evidencia útil, pero la decisión debe ser manual.",investigate_no_match:"No se encontró un movimiento candidato con la evidencia disponible.",archive_candidate:"Ya existe una asociación y el documento puede pasar al histórico si procede."}[action]);

export function DocumentTriageClient({data}:{data:DocumentTriage}){
  const router=useRouter();
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);

  async function link(documentId:string,suggestion:ArchiveMovementRef){
    if(!suggestion.sourceId)return;
    setBusy(documentId);setError(null);setMessage(null);
    try{
      const response=await fetch(`/api/archive/${documentId}/links`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceId:suggestion.sourceId})});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo asociar el documento");
      setMessage("Documento asociado. El triage se ha recalculado.");router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al asociar documento");}
    finally{setBusy(null);}
  }

  async function archive(documentId:string){
    setBusy(documentId);setError(null);setMessage(null);
    try{
      const response=await fetch(`/api/archive/${documentId}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"archive"})});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo archivar el documento");
      setMessage("Documento archivado. Puede recuperarse desde Archivadas.");router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al archivar documento");}
    finally{setBusy(null);}
  }

  return <div className="triage-queue">
    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}
    <div className="triage-summary" aria-label="Resumen de atención documental">
      <div><span>OCR</span><strong>{data.summary.reviewOcr}</strong></div><div><span>Datos</span><strong>{data.summary.completeMetadata}</strong></div><div><span>Asociación segura</span><strong>{data.summary.readyToLink}</strong></div><div><span>Matching</span><strong>{data.summary.reviewMatch}</strong></div><div><span>Sin candidato</span><strong>{data.summary.investigateNoMatch}</strong></div><div><span>Archivar</span><strong>{data.summary.archiveCandidate}</strong></div>
    </div>
    {!data.documents.length&&<div className="empty-state"><strong>No hay documentos que requieran atención.</strong><span>Todos los documentos activos están resueltos o no necesitan una acción adicional.</span></div>}
    {data.documents.map(document=>{
      const suggestions=[...document.suggestions].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
      const archiveQuery=`/archivo?view=new&q=${encodeURIComponent(document.fileName)}`;
      const canMatch=document.action==="ready_to_link"||document.action==="review_match";
      return <section className={`triage-item triage-${document.action}`} key={document.id}>
        <header><div><div className="triage-item-title"><span className="triage-priority">P{document.priorityScore}</span><span className="triage-action">{actionLabel(document.action)}</span></div><h2>{document.fileName}</h2><p>{document.merchant||"Emisor sin identificar"} · {date(document.documentDate)} · {money(document.amount)}</p></div><div className="triage-header-actions">{document.storageUrl&&<a className="ghost button-link" href={document.storageUrl} target="_blank" rel="noreferrer">Original</a>}<Link className="ghost button-link" href={archiveQuery}>Abrir en Archivo</Link></div></header>
        <p className="triage-hint">{actionHint(document.action)}</p>
        {!!document.reasons.length&&<ul className="triage-reasons">{document.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
        {canMatch&&suggestions.length>0&&<div className="review-candidates">{suggestions.map((candidate,index)=><article key={`${document.id}-${candidate.sourceId}`} className="review-candidate"><div><strong>{index===0?"Mejor coincidencia":"Alternativa"}</strong><span>{candidate.counterparty||candidate.concept||candidate.sourceId}</span><small>{date(candidate.date)} · {money(candidate.amount)} · score {Math.round(Number(candidate.score||0))}{candidate.scoreMargin!=null&&index===0?` · margen ${Math.round(candidate.scoreMargin)} pt`:""}</small>{candidate.reasons?.length?<small>{candidate.reasons.join(" · ")}</small>:null}</div><button className={index===0?"primary-action":"ghost"} type="button" disabled={busy===document.id} onClick={()=>link(document.id,candidate)}>{busy===document.id?"Asociando…":"Asociar"}</button></article>)}</div>}
        {document.action==="archive_candidate"&&<div className="triage-footer-action"><button className="secondary-action" type="button" disabled={busy===document.id} onClick={()=>archive(document.id)}>{busy===document.id?"Archivando…":"Archivar documento"}</button><span>Es reversible desde la pestaña Archivadas.</span></div>}
      </section>;
    })}
    <p className="triage-safety">El triage solo prioriza y explica. No ejecuta OCR, asociaciones, correcciones ni archivado sin una acción explícita.</p>
  </div>;
}
