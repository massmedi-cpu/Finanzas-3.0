"use client";

import { useEffect,useMemo,useState } from "react";
import { manualReviewMissingFields } from "@/lib/document/ocr-review-completeness";
import type { DocumentOperationDocument } from "@/lib/financial/document-operations";

type Draft={documentType:string;documentDate:string;amount:string;merchant:string};
type Props={
  document:DocumentOperationDocument;
  disabled:boolean;
  onChanged:(message:string)=>void;
  onResolved:(documentId:string,message:string)=>void;
  onError:(message:string)=>void;
};

type BatchResult={applied?:number;rejected?:number;results?:Array<{ok?:boolean;documentId?:string;error?:string}>};

const draftFrom=(document:DocumentOperationDocument):Draft=>({
  documentType:document.documentType||"documento",
  documentDate:document.documentDate||"",
  amount:document.amount==null?"":String(document.amount).replace(".",","),
  merchant:document.merchant||"",
});

function reviewMissingLabel(fields:string[]){
  const labels=fields.map(field=>field==="documentDate"?"fecha":field==="amount"?"importe":field);
  if(labels.length<=1)return labels[0]||"los campos obligatorios";
  return `${labels.slice(0,-1).join(", ")} e ${labels.at(-1)}`;
}

function dateShift(value:string|null,days:number){
  if(!value)return"";
  const parsed=new Date(`${value}T12:00:00Z`);
  if(Number.isNaN(parsed.getTime()))return"";
  parsed.setUTCDate(parsed.getUTCDate()+days);
  return parsed.toISOString().slice(0,10);
}

function movementSearchHref(document:DocumentOperationDocument,draft:Draft){
  const params=new URLSearchParams();
  const search=(draft.merchant||document.merchant||"").trim();
  if(search)params.set("search",search);
  const from=dateShift(draft.documentDate||document.documentDate,-7);
  const to=dateShift(draft.documentDate||document.documentDate,7);
  if(from)params.set("from",from);
  if(to)params.set("to",to);
  params.set("reconciled","0");
  const query=params.toString();
  return query?`/movimientos?${query}`:"/movimientos?reconciled=0";
}

export function TriageQuickResolution({document,disabled,onChanged,onResolved,onError}:Props){
  const [draft,setDraft]=useState<Draft>(()=>draftFrom(document));
  const [busy,setBusy]=useState<"save"|"validate"|"resolve"|null>(null);

  useEffect(()=>setDraft(draftFrom(document)),[document.id,document.documentType,document.documentDate,document.amount,document.merchant]);

  const movementHref=useMemo(()=>movementSearchHref(document,draft),[document,draft]);
  const canValidateOcr=document.action==="review_ocr";
  const hasSafeResolution=Boolean(document.safeOperation);

  async function save(validateOcr=false){
    if(disabled||busy)return;
    const normalizedAmount=draft.amount.trim().replace(",",".");
    const amount=normalizedAmount===""?null:Number(normalizedAmount);
    if(amount!=null&&!Number.isFinite(amount)){onError("El importe no es válido.");return;}
    if(validateOcr){
      const missing=manualReviewMissingFields(draft.documentType,draft.documentDate||null,amount);
      if(missing.length){onError(`Completa ${reviewMissingLabel(missing)} antes de confirmar la revisión.`);return;}
    }
    setBusy(validateOcr?"validate":"save");
    onError("");
    try{
      const payload:Record<string,unknown>={
        documentType:draft.documentType.trim()||"documento",
        documentDate:draft.documentDate||null,
        amount,
        merchant:draft.merchant.trim()||null,
      };
      if(validateOcr){payload.ocrStatus="manual";payload.manualReviewConfirmed=true;}
      const response=await fetch(`/api/archive/${document.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const body=await response.json() as {ok?:boolean;error?:string;missingFields?:string[]};
      if(!response.ok||!body.ok){
        if(body.error==="manual_review_incomplete")throw new Error(`Completa ${reviewMissingLabel(body.missingFields||[])} antes de confirmar la revisión.`);
        throw new Error(body.error||"document_update_failed");
      }
      onChanged(validateOcr?"Revisión manual confirmada. La bandeja ha recalculado el siguiente paso.":"Datos guardados. La bandeja ha recalculado las coincidencias.");
    }catch(cause){onError(cause instanceof Error?cause.message:"No se pudieron guardar los datos del documento.");}
    finally{setBusy(null);}
  }

  async function resolveSafe(){
    const operation=document.safeOperation;
    if(!operation||disabled||busy)return;
    if(!window.confirm(`¿Aplicar “${operation.label}”? El servidor volverá a validar el documento antes de modificar nada.`))return;
    setBusy("resolve");
    onError("");
    try{
      const response=await fetch("/api/archive/operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operations:[{documentId:document.id,action:operation.action,...(operation.sourceId?{sourceId:operation.sourceId}:{})}]})});
      const body=await response.json() as {ok?:boolean;error?:string;result?:BatchResult};
      if(!response.ok||!body.ok||!body.result)throw new Error(body.error||"document_operation_failed");
      if(Number(body.result.applied||0)!==1)throw new Error(body.result.results?.[0]?.error||"El documento ha cambiado y ya no cumple las condiciones de seguridad.");
      onResolved(document.id,operation.action==="archive"?"Documento archivado. Se ha abierto automáticamente el siguiente pendiente.":"Documento asociado. Se ha abierto automáticamente el siguiente pendiente.");
    }catch(cause){onError(cause instanceof Error?cause.message:"No se pudo resolver el documento.");}
    finally{setBusy(null);}
  }

  return <section className="triage-resolution" aria-label={`Resolver ${document.fileName}`}>
    <div className="triage-resolution-head">
      <div><span className="queue-kicker">Resolver aquí</span><strong>Corrige, valida y continúa sin salir de la bandeja</strong><p>Los cambios actualizan el documento, recalculan las coincidencias y conservan intacto el movimiento bancario original.</p></div>
      <span className="triage-step">Paso {document.action==="review_ocr"?1:document.action==="complete_metadata"?2:document.action==="ready_to_link"?3:document.action==="review_match"?4:document.action==="investigate_no_match"?5:6} de 6</span>
    </div>

    <div className="triage-resolution-grid">
      <label><span>Tipo de documento</span><input value={draft.documentType} onChange={event=>setDraft(current=>({...current,documentType:event.target.value}))} disabled={disabled||busy!==null}/></label>
      <label><span>Fecha</span><input type="date" value={draft.documentDate} onChange={event=>setDraft(current=>({...current,documentDate:event.target.value}))} disabled={disabled||busy!==null}/></label>
      <label><span>Importe</span><div className="triage-money-input"><input inputMode="decimal" value={draft.amount} onChange={event=>setDraft(current=>({...current,amount:event.target.value}))} placeholder="0,00" disabled={disabled||busy!==null}/><span>€</span></div></label>
      <label><span>Emisor / comercio</span><input value={draft.merchant} onChange={event=>setDraft(current=>({...current,merchant:event.target.value}))} placeholder="Nombre del comercio" disabled={disabled||busy!==null}/></label>
    </div>

    <div className="triage-resolution-actions">
      <button className="ghost" type="button" onClick={()=>void save(false)} disabled={disabled||busy!==null}>{busy==="save"?"Guardando…":"Guardar datos"}</button>
      {canValidateOcr&&<button className="secondary-action" type="button" onClick={()=>void save(true)} disabled={disabled||busy!==null}>{busy==="validate"?"Validando…":"Guardar y confirmar revisión"}</button>}
      <a className="ghost button-link" href={movementHref}>Buscar movimiento compatible</a>
      {hasSafeResolution&&<button className="primary-action" type="button" onClick={()=>void resolveSafe()} disabled={disabled||busy!==null}>{busy==="resolve"?"Revalidando…":document.safeOperation!.label}</button>}
    </div>

    <div className="triage-resolution-foot">
      <span>Guardar datos no asocia, archiva ni confirma el OCR.</span>
      <span>{hasSafeResolution?"La acción destacada se revalida en servidor y sigue siendo reversible.":"Este caso sigue necesitando una decisión manual antes de cerrarse."}</span>
    </div>
  </section>;
}
