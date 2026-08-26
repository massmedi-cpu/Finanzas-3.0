"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ArchiveReviewQueue, ArchiveMovementRef } from "@/lib/financial/archive";
import { formatEuro } from "@/lib/format/es-es";

const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
function date(value:string|null){return value?dateFormat.format(new Date(`${value}T12:00:00`)):"—"}
function money(value:number|null|undefined){return value==null?"—":formatEuro(value)}

export function ArchiveReviewClient({data}:{data:ArchiveReviewQueue}){
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
      setMessage("Documento asociado. Se ha retirado de la cola de revisión.");
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al asociar documento");}
    finally{setBusy(null);}
  }

  return <div className="review-queue">
    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}
    {!data.documents.length&&<div className="empty-state"><strong>No hay documentos pendientes de revisar.</strong><span>Las asociaciones inequívocas ya están resueltas automáticamente.</span></div>}
    {data.documents.map(document=>{
      const suggestions=[...document.suggestions].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
      return <section className="review-queue-item" key={document.id}>
        <header><div><p className="eyebrow">{document.documentType.toUpperCase()} · {date(document.documentDate)}</p><h2>{document.fileName}</h2><p>{document.merchant||"Comercio sin identificar"} · {money(document.amount)}</p></div>{document.storageUrl&&<a className="ghost button-link" href={document.storageUrl} target="_blank" rel="noreferrer">Abrir original</a>}</header>
        <div className="review-candidates">
          {suggestions.map((candidate,index)=><article key={`${document.id}-${candidate.sourceId}`} className="review-candidate">
            <div><strong>{index===0?"Mejor coincidencia":"Alternativa"}</strong><span>{candidate.counterparty||candidate.concept||candidate.sourceId}</span><small>{date(candidate.date)} · {money(candidate.amount)} · confianza {Math.round(Number(candidate.score||0))}%</small></div>
            <button className={index===0?"primary-action":"ghost"} type="button" disabled={busy===document.id} onClick={()=>link(document.id,candidate)}>{busy===document.id?"Asociando…":"Asociar"}</button>
          </article>)}
        </div>
      </section>;
    })}
  </div>;
}
