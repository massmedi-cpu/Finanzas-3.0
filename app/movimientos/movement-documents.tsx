"use client";

import { FormEvent, useState } from "react";
import { formatEuro } from "@/lib/format/es-es";
import type { MovementDocument, MovementDocumentMatches, TransactionDetail, TransactionDetailResponse } from "@/lib/financial/movements";

type ArchiveCandidate={id:string;fileName:string;documentType:string|null;documentDate:string|null;amount:number|null;merchant:string|null;ocrStatus?:string|null;pendingReasons?:string[];lifecycleState?:string|null;archivedAt?:string|null;storageProvider?:string|null;storageUrl?:string|null};
type ArchiveOverviewPayload={ok?:boolean;documents?:ArchiveCandidate[];error?:string};
type LinkableDocument={id:string;ocrStatus?:string|null;archivedAt?:string|null};

const emptyMatches:MovementDocumentMatches={status:"none",linked:[],suggestions:[]};
const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
const trustedOcrStatuses=new Set(["complete","manual","not_required"]);
const unreviewedOcrStatuses=new Set(["pending","processing","needs_review","failed","error"]);

function formatDate(value:string|null){return value?dateFormat.format(new Date(`${value}T12:00:00`)):"—";}
function formatMoney(value:number|null){return value==null?"—":formatEuro(value);}
function normalizedOcrStatus(value:unknown){return String(value||"").trim().toLowerCase();}
function ocrMetadataTrusted(value:unknown){return trustedOcrStatuses.has(normalizedOcrStatus(value));}
function ocrAcknowledgementRequired(value:unknown){return unreviewedOcrStatuses.has(normalizedOcrStatus(value));}
function isDriveDocument(document:MovementDocument){return document.storageProvider==="google_drive"&&Boolean(document.storageUrl);}
function confidenceLabel(document:MovementDocument){
  let label="Vinculado";
  if(document.associationOrigin==="drive_exact")label="Google Drive · coincidencia exacta";
  else if(document.associationOrigin==="manual")label=isDriveDocument(document)?"Google Drive · relación manual confirmada":"Relación manual confirmada";
  else if(document.confidence!=null)label=`${isDriveDocument(document)?"Google Drive · ":""}Automático · ${Math.round(Number(document.confidence)*100)}%`;
  else if(isDriveDocument(document))label="Google Drive · vinculado";
  return ocrMetadataTrusted(document.ocrStatus)?label:`${label} · OCR pendiente de confirmar`;
}
function metadataText(document:{merchant:string|null;documentType:string|null;documentDate:string|null;amount:number|null;ocrStatus?:string|null}){
  const identity=document.merchant||document.documentType||"Documento";
  if(ocrMetadataTrusted(document.ocrStatus))return `${identity} · ${formatDate(document.documentDate)} · ${formatMoney(document.amount)}`;
  return `${identity} · datos OCR provisionales · fecha detectada ${formatDate(document.documentDate)} · importe detectado ${formatMoney(document.amount)}`;
}
function linkButtonLabel(document:LinkableDocument,busy:boolean){
  if(busy)return document.archivedAt?"Restaurando…":"Vinculando…";
  if(document.archivedAt)return ocrAcknowledgementRequired(document.ocrStatus)?"Restaurar y vincular · OCR pendiente":"Restaurar y vincular";
  return ocrAcknowledgementRequired(document.ocrStatus)?"Vincular · OCR pendiente":"Vincular";
}
function trustedSuggestions(matches:MovementDocumentMatches):MovementDocumentMatches{
  return {...matches,suggestions:(matches.suggestions||[]).filter(document=>ocrMetadataTrusted(document.ocrStatus))};
}

export function MovementDocuments({transaction,onChanged}:{transaction:TransactionDetail;onChanged?:()=>unknown}){
  const [matches,setMatches]=useState<MovementDocumentMatches>(()=>trustedSuggestions(transaction.documentMatches??emptyMatches));
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [pickerOpen,setPickerOpen]=useState(false);
  const [pickerLoading,setPickerLoading]=useState(false);
  const [pickerSearch,setPickerSearch]=useState("");
  const [candidates,setCandidates]=useState<ArchiveCandidate[]>([]);

  async function refresh(){
    const response=await fetch(`/api/movements/${transaction.id}`,{cache:"no-store"});
    const body=await response.json() as TransactionDetailResponse & {error?:string};
    if(!response.ok||!body.ok)throw new Error(body.error||"No se pudieron actualizar los documentos");
    setMatches(trustedSuggestions(body.transaction.documentMatches??emptyMatches));
    await onChanged?.();
  }

  async function openDocument(document:MovementDocument){
    setBusy(`open-${document.id}`);setError(null);setMessage(null);
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

  async function linkById(document:LinkableDocument){
    setBusy(`link-${document.id}`);setError(null);setMessage(null);
    try{
      const acknowledgeUnreviewed=ocrAcknowledgementRequired(document.ocrStatus);
      const restoreArchived=Boolean(document.archivedAt);
      const response=await fetch(`/api/archive/${document.id}/links`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceId:transaction.sourceId,acknowledgeUnreviewed,restoreArchived})});
      const body=await response.json() as {ok?:boolean;error?:string;restored?:boolean;linkedWithUnreviewedOcr?:boolean};
      if(!response.ok||!body.ok){
        if(body.error==="document_ocr_unreviewed")throw new Error("El estado OCR cambió y ahora requiere revisión. Vuelve a cargar el selector antes de vincularlo.");
        if(body.error==="archived_document_requires_restore")throw new Error("El documento está ahora en el histórico. Vuelve a cargar el selector para restaurarlo y vincularlo de forma explícita.");
        throw new Error(body.error||"No se pudo vincular la factura o ticket");
      }
      await refresh();
      setPickerOpen(false);
      if(body.linkedWithUnreviewedOcr)setMessage(body.restored?"Documento restaurado y relacionado. El OCR sigue pendiente de revisión; sus datos no se han dado por confirmados.":"Documento relacionado. El OCR sigue pendiente de revisión; sus datos no se han dado por confirmados.");
      else setMessage(body.restored?"Documento restaurado y vinculado correctamente.":"Documento vinculado correctamente.");
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo vincular la factura o ticket");}
    finally{setBusy(null);}
  }

  async function linkDocument(document:MovementDocument){await linkById(document);}

  async function unlinkDocument(document:MovementDocument){
    setBusy(`unlink-${document.id}`);setError(null);setMessage(null);
    try{
      const response=await fetch(`/api/archive/${document.id}/links?sourceId=${encodeURIComponent(transaction.sourceId)}`,{method:"DELETE"});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo desvincular la factura");
      await refresh();
      setMessage("Documento desvinculado. No se ha modificado su OCR ni el movimiento bancario.");
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo desvincular la factura");}
    finally{setBusy(null);}
  }

  async function loadCandidates(query=pickerSearch){
    setPickerLoading(true);setError(null);setMessage(null);
    try{
      const params=new URLSearchParams({includeArchived:"1"});
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
    const next=!pickerOpen;setPickerOpen(next);setError(null);setMessage(null);
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
      {message&&<div className="inline-alert success" role="status">{message}</div>}
      <div className="manual-link-actions"><button className="primary-action" type="button" onClick={openPicker} disabled={busy!==null}>{pickerOpen?"Cerrar selector":"Vincular factura o ticket"}</button></div>

      {pickerOpen&&<section className="manual-link-picker" aria-label="Elegir factura o ticket de Archivo">
        <form className="link-picker-toolbar" onSubmit={submitPickerSearch}><input value={pickerSearch} onChange={event=>setPickerSearch(event.target.value)} placeholder="Buscar por archivo, comercio, importe u OCR"/><button className="ghost" type="submit" disabled={pickerLoading}>{pickerLoading?"Buscando…":"Buscar"}</button></form>
        <p className="muted-copy">Puedes elegir documentos activos o del histórico. Los archivados se restauran solo si pulsas “Restaurar y vincular”. Si el OCR sigue pendiente, la relación puede confirmarse porque reconoces el documento, pero sus datos continuarán marcados como provisionales.</p>
        <div className="link-picker-list">{candidates.map(document=><div key={document.id}><span><strong>{document.fileName}</strong><small>{metadataText(document)}</small>{document.archivedAt&&<small>Histórico · se restaurará antes de vincular</small>}{!ocrMetadataTrusted(document.ocrStatus)&&<small>OCR pendiente · vincular no confirma fecha, importe ni comercio</small>}</span><button className="primary-action" type="button" onClick={()=>linkById(document)} disabled={busy!==null}>{linkButtonLabel(document,busy===`link-${document.id}`)}</button></div>)}{!pickerLoading&&!candidates.length&&<p className="muted-copy">No hay documentos disponibles con esa búsqueda.</p>}</div>
      </section>}

      {matches.linked.length>0&&<div className="document-group">
        <strong className="document-group-title">Relacionado con este movimiento</strong>
        <ul className="document-link-list">
          {matches.linked.map(document=><li key={document.id}>
            <div className="document-link-copy">
              <strong>{document.fileName}</strong>
              <span>{metadataText(document)}</span>
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
        <p className="muted-copy">Estas sugerencias ya usan el matcher canónico supervisado y solo incluyen documentos con OCR resuelto. Se comparan importe, fecha real de compra y comercio.</p>
        <ul className="document-link-list">
          {matches.suggestions.map(document=><li key={document.id}>
            <div className="document-link-copy">
              <strong>{document.fileName}</strong>
              <span>{metadataText(document)}</span>
              <small>{isDriveDocument(document)?"Google Drive · ":""}Coincidencia {Math.round(Number(document.score??0))}%{document.merchantMatch?" · comercio coincide":""}{document.daysDiff!=null?` · ${document.daysDiff} día${document.daysDiff===1?"":"s"} de diferencia`:""}{document.installmentMatch?" · pago fraccionado":""}</small>
            </div>
            <div className="document-link-actions">
              {openAction(document)}
              <button className="primary-action" type="button" onClick={()=>linkDocument(document)} disabled={busy!==null}>{linkButtonLabel(document,busy===`link-${document.id}`)}</button>
            </div>
          </li>)}
        </ul>
      </div>}

      {!matches.linked.length&&!matches.suggestions.length&&!pickerOpen&&<p className="muted-copy">No hay factura o ticket relacionado todavía. Puedes buscar manualmente en Archivo. Si haces una foto o subes un ticket, el OCR intentará vincularlo automáticamente usando la fecha real de compra, el importe y el comercio, pero solo cuando esos datos estén resueltos y el matcher canónico encuentre evidencia suficiente; mientras tanto permanecerá pendiente de revisión.</p>}
    </div>
  </details>;
}