"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {formatEuro} from "@/lib/format/es-es";
import type {ArchiveDuplicateConfidence,ArchiveDuplicateReason} from "@/lib/document/archive-duplicate-detection";

type DuplicateDocument={
  id:string;
  fileName:string;
  documentType:string;
  documentDate:string|null;
  amount:number|null;
  merchant:string|null;
  ocrStatus:string;
  lifecycleState:string;
  fileSize:number|null;
  contentHash:string|null;
  archivedAt:string|null;
  linkCount:number;
  hasOcrText:boolean;
  hasReconstruction:boolean;
};
type DuplicatePair={id:string;confidence:ArchiveDuplicateConfidence;score:number;reasons:ArchiveDuplicateReason[];left:DuplicateDocument;right:DuplicateDocument};

const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
const date=(value:string|null)=>value?dateFormat.format(new Date(`${value}T12:00:00`)):"Sin fecha";
const size=(value:number|null)=>value==null?"Tamaño desconocido":value>=1_000_000?`${(value/1_000_000).toFixed(2)} MB`:`${Math.round(value/1_000)} KB`;
const confidenceLabel=(value:ArchiveDuplicateConfidence)=>value==="exact"?"Exacto":value==="high"?"Muy probable":"Posible";
const reasonLabel=(value:ArchiveDuplicateReason)=>({same_hash:"mismo hash",same_date:"misma fecha",same_amount:"mismo importe",same_size:"mismo tamaño exacto",merchant_overlap:"comercio coincidente"}[value]);

function DocumentCard({document,pairConfidence,onDelete,busy}:{document:DuplicateDocument;pairConfidence:ArchiveDuplicateConfidence;onDelete:(document:DuplicateDocument)=>void;busy:string|null}){
  const protectedByLink=document.linkCount>0;
  return <article className="review-candidate">
    <div>
      <div className="candidate-heading"><strong>{document.merchant||"Emisor sin identificar"}</strong><span className={`confidence confidence-${protectedByLink?"high":"medium"}`}>{protectedByLink?"Protegido por vínculo":"Sin vínculos"}</span></div>
      <span>{document.fileName}</span>
      <small>{date(document.documentDate)} · {document.amount==null?"Importe sin confirmar":formatEuro(document.amount)} · {size(document.fileSize)}</small>
      <small>{document.documentType} · OCR {document.ocrStatus} · {document.archivedAt?"Archivado":"Activo"}{document.hasReconstruction?" · reconstrucción disponible":""}</small>
      <small>Huella {document.contentHash?`${document.contentHash.slice(0,12)}…`:"no disponible"}</small>
    </div>
    <div className="triage-header-actions">
      <a className="ghost button-link" href={`/api/archive/${document.id}?original=1`} target="_blank" rel="noreferrer">Abrir original</a>
      <button className="secondary-action" type="button" disabled={protectedByLink||busy!==null} onClick={()=>onDelete(document)}>{busy===document.id?"Eliminando…":protectedByLink?"Vinculado · no se puede borrar":pairConfidence==="exact"?"Eliminar copia":"Eliminar tras comparar"}</button>
    </div>
  </article>;
}

export function DuplicateReviewClient({pairs}:{pairs:DuplicatePair[]}){
  const router=useRouter();
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  async function remove(document:DuplicateDocument,pair:DuplicatePair){
    if(document.linkCount>0||busy)return;
    const warning=pair.confidence==="exact"
      ?`Se eliminará “${document.fileName}”. Existe otra copia con el mismo hash. ¿Continuar?`
      :`Los archivos no son idénticos byte a byte. Confirma solo si has abierto y comparado ambos originales y “${document.fileName}” es realmente una copia redundante. ¿Eliminarla?`;
    if(!window.confirm(warning))return;
    setBusy(document.id);setMessage(null);setError(null);
    try{
      const response=await fetch(`/api/archive/${document.id}`,{method:"DELETE"});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo eliminar la copia");
      setMessage("Copia eliminada. El original conservado permanece intacto y la lista de duplicados se ha recalculado.");
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo eliminar la copia");}
    finally{setBusy(null);}
  }

  if(!pairs.length)return <div className="empty-state"><strong>No hay duplicados documentales pendientes.</strong><span>No se han encontrado pares que cumplan las reglas de coincidencia segura.</span></div>;

  return <div className="triage-list">
    {message&&<div className="inline-alert success" role="status">{message}</div>}
    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {pairs.map((pair,index)=><section className="triage-item triage-review_match" key={pair.id}>
      <header><div><div className="triage-item-title"><span className="triage-priority">Caso {index+1}</span><span className="triage-action">{confidenceLabel(pair.confidence)} · {pair.score}%</span></div><h2>Posible documento duplicado</h2><p>{pair.reasons.map(reasonLabel).join(" · ")}</p></div></header>
      <div className="triage-detail">
        {pair.confidence!=="exact"&&<div className="ocr-warning" role="note"><strong>Compara los dos originales antes de borrar</strong><span>La coincidencia es documental, no binaria: dos fotos distintas pueden representar el mismo justificante, pero también pueden ser compras separadas con datos iguales.</span></div>}
        <div className="review-candidates">
          <DocumentCard document={pair.left} pairConfidence={pair.confidence} onDelete={document=>void remove(document,pair)} busy={busy}/>
          <DocumentCard document={pair.right} pairConfidence={pair.confidence} onDelete={document=>void remove(document,pair)} busy={busy}/>
        </div>
      </div>
    </section>)}
    <p className="triage-safety">Nunca se elimina un duplicado automáticamente. Los documentos vinculados a movimientos quedan bloqueados y los pares con hashes distintos requieren comparar ambos originales antes de decidir.</p>
  </div>;
}
