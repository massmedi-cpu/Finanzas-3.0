"use client";

import { FormEvent, useState } from "react";
import { formatEuro } from "@/lib/format/es-es";
import type { MovementDocument, MovementDocumentMatches, TransactionDetail, TransactionDetailResponse } from "@/lib/financial/movements";

type ArchiveCandidate={id:string;fileName:string;documentType:string|null;documentDate:string|null;amount:number|null;merchant:string|null;storageProvider?:string|null;storageUrl?:string|null};
type ArchiveOverviewPayload={ok?:boolean;documents?:ArchiveCandidate[];error?:string};

const emptyMatches:MovementDocumentMatches={status:"none",linked:[],suggestions:[]};
const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});

function formatDate(value:string|null){return value?dateFormat.format(new Date(`${value}T12:00:00`)):"—";}
function formatMoney(value:number|null){return value==null?"—":formatEuro(value);}
function isDriveDocument(document:MovementDocument){return document.storageProvider==="google_drive"&&Boolean(document.storageUrl);}
function confidenceLabel(document:MovementDocument){
  if(document.associationOrigin==="drive_exact")return "Google Drive · coincidencia exacta";
  if(document.associationOrigin==="manual")return isDriveDocument(document)?"Google Drive · vinculación manual":"Vinculación manual";
  if(document.confidence!=null)return `${isDriveDocument(document)?"Google Drive · ":""}Automático · ${Math.round(Number(document.confidence)*100)}%`;
  return isDriveDocument(document)?"Google Drive · vinculado":"Vinculado";
}

export function MovementDocuments({transaction,onChanged}:{transaction:TransactionDetail;onChanged?:()=>void|Promise<void>}){
  const [matches,setMatches]=useState<MovementDocumentMatches>(transaction.documentMatches??emptyMatches);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [pickerOpen,setPickerOpen]=useState(false);
  const [pickerLoading,setPickerLoading]=useState(false);
  const [pickerSearch,setPickerSearch]=useState("");
  const [candidates,setCandidates]=useState<ArchiveCandidate[]>([]);

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

  async function linkById(documentId:string){
    setBusy(`link-${documentId}`);setError(null);
    try{
      const response=await fetch(`/api/archive/${documentId}/links`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceId:transaction.sourceId})});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo vincular la factura o ticket");
      await refresh();
      setPickerOpen(false);
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo vincular la factura o ticket");}
    finally{setBusy(null);}
  }

  async function linkDocument(document:MovementDocument){await linkById(document.id);}

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

  async function loadCandidates(query=pickerSearch){
    setPickerLoading(true);setError(null);
    try{
      const params=new URLSearchParams({archived:"1"});
      if(query.trim())params.set("search",query.trim());
      const response=await fetch(`/api/archive?${params.toString()}`,{cache:"no-store"});
      const body=await response.json() as ArchiveOverviewPayload;
      if(!response.ok)throw new Error(body.error||"No se pudo cargar Archivo");
      const linkedIds=new Set(matches.linked.map(document=>document.id));
      setCandidates((body.documents||[]).filter(document=>!linkedIds.has(document.id)).slice(0,40));
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo cargar Archivo");}
    finally{setPickerLoading(false);}
  }

  async function openPicker(){
    const next=!pickerOpen;setPickerOpen(next);
    if(next&&!candidates.length)await loadCandidates("");
  }
  async function submitPickerSearch(event:FormEvent){event.preventDefault();await loadCandidates();}

  function openAction(document:MovementDocument){
    if(isDriveDocument(document))return <a className="ghost" href={document.storageUrl!} target="_blank" rel="noopener noreferrer">Ver en Google Drive</a>;
    return <button className="ghost" type="button" onClick={()=>openDocument(document)} disabled={busy!==null}>{busy===`open-${document.id}`?"Abriendo…":"Ver ticket / factura"}</button>;
  }

  const title=matches.linked.length
    ?`${matches.linked.length} relacionado${matches.linked.length===1?"":"s"}`
    :matches.suggestions.length?"posible coincidencia":"sin documento vinculado";

  return <details className="trace-panel movement-documents" open>
    <summary>Factura / ticket relacionado · {title}</summary>
    <div className="document-link-panel">
      {error&&<div className="inline-alert error" role="alert">{error}</div>}
      <div className="manual-link-actions"><button className="primary-action" type="button" onClick={openPicker} disabled={busy!==null}>{pickerOpen?"Cerrar selector":"Vincular factura o ticket"}</button></div>

      {pickerOpen&&<section className="manual-link-picker" aria-label="Elegir factura o ticket de Archivo">
        <form className="link-picker-toolbar" onSubmit={submitPickerSearch}><input value={pickerSearch} onChange={event=>setPickerSearch(event.target.value)} placeholder="Buscar por archivo, comercio, importe u OCR"/><button className="ghost" type="submit" disabled={pickerLoading}>{pickerLoading?"Buscando…":"Buscar"}</button></form>
        <p className="muted-copy">Elige cualquier documento ya subido a Archivo. La vinculación es manual y reversible.</p>
        <div className="link-picker-list">{candidates.map(document=><div key={document.id}><span><strong>{document.fileName}</strong><small>{document.merchant||document.documentType||"Documento"} · {formatDate(document.documentDate)} · {formatMoney(document.amount)}</small></span><button className="primary-action" type="button" onClick={()=>linkById(document.id)} disabled={busy!==null}>{busy===`link-${document.id}`?"Vinculando…":"Vincular"}</button></div>)}{!pickerLoading&&!candidates.length&&<p className="muted-copy">No hay documentos disponibles con esa búsqueda.</p>}</div>
      </section>}

      {matches.linked.length>0&&<div className="document-group">
        <strong className="document-group-title">Relacionado con este movimiento</strong>
        <ul className="document-link-list">
          {matches.linked.map(document=><li key={document.id}>
            <div className="document-link-copy">
              <strong>{document.fileName}</strong>
              <span>{document.merchant||"Documento"} · {formatDate(document.documentDate)} · {formatMoney(document.amount)}</span>
              <small>{confidenceLabel(document)}</small>
            </div>
            <div className="document-link-actions">
              {openAction(document)}
              <button className="ghost" type="button" onClick={()=>unlinkDocument(document)} disabled={busy!==null}>{busy===`unlink-${document.id}`?"Quitando…":"Desvincular"}</button>
            </div>
          </li>)}
        </ul>
      </div>}

      {matches.suggestions.length>0&&<div className="document-group">
        <strong className="document-group-title">Coincidencias para revisar</strong>
        <p className="muted-copy">Financial App compara importe, fecha real de compra y comercio. Las coincidencias inequívocas de Google Drive se vinculan automáticamente.</p>
        <ul className="document-link-list">
          {matches.suggestions.map(document=><li key={document.id}>
            <div className="document-link-copy">
              <strong>{document.fileName}</strong>
              <span>{document.merchant||"Documento"} · {formatDate(document.documentDate)} · {formatMoney(document.amount)}</span>
              <small>{isDriveDocument(document)?"Google Drive · ":""}Coincidencia {Math.round(Number(document.score??0))}%{document.merchantMatch?" · comercio coincide":""}{document.daysDiff!=null?` · ${document.daysDiff} día${document.daysDiff===1?"":"s"} de diferencia`:""}{document.installmentMatch?" · pago fraccionado":""}</small>
            </div>
            <div className="document-link-actions">
              {openAction(document)}
              <button className="primary-action" type="button" onClick={()=>linkDocument(document)} disabled={busy!==null}>{busy===`link-${document.id}`?"Vinculando…":"Vincular"}</button>
            </div>
          </li>)}
        </ul>
      </div>}

      {!matches.linked.length&&!matches.suggestions.length&&!pickerOpen&&<p className="muted-copy">No hay factura o ticket relacionado todavía. Puedes vincular manualmente cualquier documento de Archivo. Si haces una foto o subes un ticket, el OCR intentará vincularlo automáticamente usando la fecha real de compra, el importe y el comercio.</p>}
    </div>
  </details>;
}
