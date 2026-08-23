"use client";

import { useState } from "react";
import { formatEuro } from "@/lib/format/es-es";
import type { MovementDocument, MovementDocumentMatches, TransactionDetail, TransactionDetailResponse } from "@/lib/financial/movements";

const emptyMatches:MovementDocumentMatches={status:"none",linked:[],suggestions:[]};
const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});

function formatDate(value:string|null){return value?dateFormat.format(new Date(`${value}T12:00:00`)):"—";}
function formatMoney(value:number|null){return value==null?"—":formatEuro(value);}
function confidenceLabel(document:MovementDocument){
  if(document.associationOrigin==="manual")return "Vinculación manual";
  if(document.confidence!=null)return `Automático · ${Math.round(Number(document.confidence)*100)}%`;
  return "Vinculado";
}

export function MovementDocuments({transaction,onChanged}:{transaction:TransactionDetail;onChanged?:()=>void|Promise<void>}){
  const [matches,setMatches]=useState<MovementDocumentMatches>(transaction.documentMatches??emptyMatches);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  async function refresh(){
    const response=await fetch(`/api/movements/${transaction.id}`,{cache:"no-store"});
    const body=await response.json() as TransactionDetailResponse & {error?:string};
    if(!response.ok||!body.ok)throw new Error(body.error||"No se pudieron actualizar los documentos");
    setMatches(body.transaction.documentMatches??emptyMatches);
    await onChanged?.();
  }

  async function openDocument(document:MovementDocument){
    setBusy(`open-${document.id}`);setError(null);
    try{
      const response=await fetch(`/api/archive/${document.id}`,{cache:"no-store"});
      const body=await response.json() as {ok?:boolean;signedUrl?:string|null;document?:{storageUrl?:string|null};error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo abrir el documento");
      const url=body.signedUrl||body.document?.storageUrl||document.storageUrl;
      if(!url)throw new Error("El documento no tiene una ubicación disponible");
      window.open(url,"_blank","noopener,noreferrer");
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo abrir el documento");}
    finally{setBusy(null);}
  }

  async function linkDocument(document:MovementDocument){
    setBusy(`link-${document.id}`);setError(null);
    try{
      const response=await fetch(`/api/archive/${document.id}/links`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceId:transaction.sourceId})});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo vincular la factura");
      await refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo vincular la factura");}
    finally{setBusy(null);}
  }

  async function unlinkDocument(document:MovementDocument){
    setBusy(`unlink-${document.id}`);setError(null);
    try{
      const response=await fetch(`/api/archive/${document.id}/links?sourceId=${encodeURIComponent(transaction.sourceId)}`,{method:"DELETE"});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo desvincular la factura");
      await refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo desvincular la factura");}
    finally{setBusy(null);}
  }

  const title=matches.linked.length
    ?`${matches.linked.length} documento${matches.linked.length===1?" vinculado":"s vinculados"}`
    :matches.suggestions.length?"Posible factura encontrada":"Sin factura vinculada";

  return <details className="trace-panel movement-documents" open>
    <summary>Documentos · {title}</summary>
    <div className="document-link-panel">
      {error&&<div className="inline-alert error" role="alert">{error}</div>}

      {matches.linked.length>0&&<div className="document-group">
        <strong className="document-group-title">Vinculados</strong>
        <ul className="document-link-list">
          {matches.linked.map(document=><li key={document.id}>
            <div className="document-link-copy">
              <strong>{document.fileName}</strong>
              <span>{document.merchant||"Documento"} · {formatDate(document.documentDate)} · {formatMoney(document.amount)}</span>
              <small>{confidenceLabel(document)}</small>
            </div>
            <div className="document-link-actions">
              <button className="ghost" type="button" onClick={()=>openDocument(document)} disabled={busy!==null}>{busy===`open-${document.id}`?"Abriendo…":"Abrir"}</button>
              <button className="ghost" type="button" onClick={()=>unlinkDocument(document)} disabled={busy!==null}>{busy===`unlink-${document.id}`?"Quitando…":"Desvincular"}</button>
            </div>
          </li>)}
        </ul>
      </div>}

      {matches.suggestions.length>0&&<div className="document-group">
        <strong className="document-group-title">Coincidencias para revisar</strong>
        <p className="muted-copy">Financial App compara importe, fecha y comercio. Solo las coincidencias inequívocas se vinculan automáticamente.</p>
        <ul className="document-link-list">
          {matches.suggestions.map(document=><li key={document.id}>
            <div className="document-link-copy">
              <strong>{document.fileName}</strong>
              <span>{document.merchant||"Documento"} · {formatDate(document.documentDate)} · {formatMoney(document.amount)}</span>
              <small>Coincidencia {Math.round(Number(document.score??0))}%{document.merchantMatch?" · comercio coincide":""}{document.daysDiff!=null?` · ${document.daysDiff} día${document.daysDiff===1?"":"s"} de diferencia`:""}{document.installmentMatch?" · pago fraccionado":""}</small>
            </div>
            <div className="document-link-actions">
              <button className="ghost" type="button" onClick={()=>openDocument(document)} disabled={busy!==null}>Abrir</button>
              <button className="primary-action" type="button" onClick={()=>linkDocument(document)} disabled={busy!==null}>{busy===`link-${document.id}`?"Vinculando…":"Vincular"}</button>
            </div>
          </li>)}
        </ul>
      </div>}

      {!matches.linked.length&&!matches.suggestions.length&&<p className="muted-copy">No se ha encontrado una factura o ticket compatible con este movimiento. Cuando exista un documento con fecha, importe o comercio compatibles aparecerá aquí.</p>}
    </div>
  </details>;
}
