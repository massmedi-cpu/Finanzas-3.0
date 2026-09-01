"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect,useMemo,useState } from "react";
import type { ArchiveMovementRef } from "@/lib/financial/archive";
import type { DocumentTriageAction } from "@/lib/financial/document-triage";
import type { DocumentOperations } from "@/lib/financial/document-operations";
import { formatEuro } from "@/lib/format/es-es";

const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
const date=(value:string|null)=>value?dateFormat.format(new Date(`${value}T12:00:00`)):"—";
const money=(value:number|null|undefined)=>value==null?"—":formatEuro(value);
const actionLabel=(action:DocumentTriageAction)=>({review_ocr:"Revisar OCR",complete_metadata:"Completar datos",ready_to_link:"Asociación segura",review_match:"Revisar coincidencia",investigate_no_match:"Buscar movimiento",archive_candidate:"Listo para archivar"}[action]);
const actionHint=(action:DocumentTriageAction)=>({review_ocr:"Primero hay que revisar el reconocimiento del documento para evitar trabajar con datos dudosos.",complete_metadata:"Falta información necesaria para buscar y justificar un movimiento con suficiente seguridad.",ready_to_link:"Hay una coincidencia que cumple la política supervisada. Se volverá a validar justo antes de asociarla.",review_match:"Hay evidencia útil, pero la decisión debe seguir siendo manual.",investigate_no_match:"No se ha encontrado todavía un movimiento compatible con la evidencia disponible.",archive_candidate:"El documento ya está asociado y puede pasar al histórico si su estado sigue resuelto."}[action]);
const confidenceLabel=(value:ArchiveMovementRef["confidenceTier"])=>(value==="exact"?"Exacta":value==="high"?"Alta":value==="medium"?"Media":value==="low"?"Baja":"Sin clasificar");
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

type QueueFilter="all"|"safe"|"manual";
type AppliedOperation={ok:true;documentId:string;action:"link"|"archive";sourceId?:string;undo?:{action:"unlink"|"restore";sourceId?:string}};
type BatchResult={applied:number;rejected:number;results:Array<AppliedOperation|{ok:false;documentId?:string;action?:string;error?:string}>};

export function DocumentTriageClient({data}:{data:DocumentOperations}){
  const router=useRouter();
  const [busy,setBusy]=useState<string|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [lastApplied,setLastApplied]=useState<AppliedOperation[]>([]);
  const [filter,setFilter]=useState<QueueFilter>("all");
  const [query,setQuery]=useState("");
  const [activeId,setActiveId]=useState<string|null>(data.documents[0]?.id??null);
  const [sessionDone,setSessionDone]=useState(0);

  const safeDocuments=useMemo(()=>data.documents.filter(item=>item.safeOperation),[data.documents]);
  const selectedDocuments=useMemo(()=>safeDocuments.filter(item=>selected.includes(item.id)),[safeDocuments,selected]);
  const manualCount=data.documents.length-safeDocuments.length;
  const visibleDocuments=useMemo(()=>{
    const needle=normalize(query.trim());
    return data.documents.filter(item=>{
      if(filter==="safe"&&!item.safeOperation)return false;
      if(filter==="manual"&&item.safeOperation)return false;
      if(!needle)return true;
      return normalize([item.fileName,item.merchant,item.documentType,date(item.documentDate),money(item.amount)].filter(Boolean).join(" ")).includes(needle);
    });
  },[data.documents,filter,query]);
  const activeIndex=visibleDocuments.findIndex(item=>item.id===activeId);

  useEffect(()=>{
    const ids=new Set(data.documents.map(item=>item.id));
    setSelected(current=>current.filter(id=>ids.has(id)));
    if(activeId&&!ids.has(activeId))setActiveId(data.documents[0]?.id??null);
  },[data.documents,activeId]);

  useEffect(()=>{
    if(!visibleDocuments.length){if(activeId!==null)setActiveId(null);return;}
    if(!activeId||!visibleDocuments.some(item=>item.id===activeId))setActiveId(visibleDocuments[0].id);
  },[visibleDocuments,activeId]);

  function focusDocument(documentId:string){
    setActiveId(documentId);
    requestAnimationFrame(()=>globalThis.document.getElementById(`triage-${documentId}`)?.scrollIntoView({block:"center"}));
  }

  function moveAfter(processedIds:string[]){
    const processed=new Set(processedIds);
    const next=visibleDocuments.find(item=>!processed.has(item.id));
    if(next)focusDocument(next.id);
  }

  function step(direction:-1|1){
    if(!visibleDocuments.length)return;
    const base=activeIndex<0?0:activeIndex;
    const next=Math.max(0,Math.min(visibleDocuments.length-1,base+direction));
    focusDocument(visibleDocuments[next].id);
  }

  function toggle(documentId:string){setSelected(current=>current.includes(documentId)?current.filter(id=>id!==documentId):[...current,documentId]);}
  function selectSafe(){
    const limit=Math.max(1,Math.min(50,data.rules.maxBatchSize||50));
    setSelected(safeDocuments.slice(0,limit).map(item=>item.id));
    if(safeDocuments.length>limit)setMessage(`Se han seleccionado las primeras ${limit} acciones seguras. El resto queda para el siguiente lote.`);
  }

  async function link(documentId:string,suggestion:ArchiveMovementRef){
    if(!suggestion.sourceId)return;
    setBusy(documentId);setError(null);setMessage(null);setLastApplied([]);
    try{
      const response=await fetch(`/api/archive/${documentId}/links`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceId:suggestion.sourceId})});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo asociar el documento");
      setSessionDone(current=>current+1);
      setMessage("Documento asociado correctamente. La cola se ha recalculado y puedes continuar con el siguiente pendiente.");
      moveAfter([documentId]);
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al asociar documento");}
    finally{setBusy(null);}
  }

  async function applySelected(){
    if(!selectedDocuments.length)return;
    const label=selectedDocuments.length===1?"esta acción segura":`estas ${selectedDocuments.length} acciones seguras`;
    if(!window.confirm(`¿Aplicar ${label}? El servidor volverá a validar cada documento antes de modificar nada.`))return;
    setBusy("batch");setError(null);setMessage(null);setLastApplied([]);
    try{
      const operations=selectedDocuments.map(item=>({documentId:item.id,action:item.safeOperation!.action,...(item.safeOperation!.sourceId?{sourceId:item.safeOperation!.sourceId}:{})}));
      const response=await fetch("/api/archive/operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operations})});
      const body=await response.json() as {ok?:boolean;error?:string;result?:BatchResult};
      if(!response.ok||!body.ok||!body.result)throw new Error(body.error||"No se pudieron aplicar las operaciones documentales");
      const applied=body.result.results.filter((item):item is AppliedOperation=>item.ok===true);
      setLastApplied(applied);setSelected([]);setSessionDone(current=>current+body.result!.applied);
      setMessage(`${body.result.applied} acción${body.result.applied===1?"":"es"} aplicada${body.result.applied===1?"":"s"}${body.result.rejected?`; ${body.result.rejected} rechazada${body.result.rejected===1?"":"s"} porque el estado ya no era seguro`:""}. La cola se ha actualizado.`);
      moveAfter(applied.map(item=>item.documentId));
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
    setLastApplied([]);setSessionDone(current=>Math.max(0,current-undone));
    if(failures.length)setError(`${undone} acción${undone===1?"":"es"} deshecha${undone===1?"":"s"}; ${failures.length} no pudieron revertirse.`);
    else setMessage(`${undone} acción${undone===1?"":"es"} deshecha${undone===1?"":"s"}.`);
    setBusy(null);router.refresh();
  }

  return <div className="triage-queue">
    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}

    <section className="queue-command" aria-label="Cola de revisión documental">
      <div className="queue-command-head"><div><span className="queue-kicker">Cola de trabajo</span><strong>{data.documents.length} pendiente{data.documents.length===1?"":"s"}</strong><p>Trabaja un documento cada vez o procesa en lote únicamente los casos que siguen siendo seguros al confirmar.</p></div><div className="queue-session"><span>Procesados esta sesión</span><strong>{sessionDone}</strong></div></div>
      <div className="queue-controls">
        <div className="queue-filters" role="group" aria-label="Filtrar cola"><button type="button" className={filter==="all"?"active":""} aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>Todos <span>{data.documents.length}</span></button><button type="button" className={filter==="safe"?"active":""} aria-pressed={filter==="safe"} onClick={()=>setFilter("safe")}>Seguros <span>{safeDocuments.length}</span></button><button type="button" className={filter==="manual"?"active":""} aria-pressed={filter==="manual"} onClick={()=>setFilter("manual")}>Manuales <span>{manualCount}</span></button></div>
        <label className="queue-search"><span className="sr-only">Buscar en la cola</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar archivo, emisor, fecha o importe"/></label>
      </div>
      <div className="queue-navigation"><div><strong>{visibleDocuments.length?`${Math.max(0,activeIndex)+1} de ${visibleDocuments.length}`:"Sin resultados"}</strong><span>{visibleDocuments.length?"documento visible en la cola":"Prueba otro filtro o búsqueda"}</span></div><div><button className="ghost" type="button" onClick={()=>step(-1)} disabled={busy!==null||activeIndex<=0}>Anterior</button><button className="ghost" type="button" onClick={()=>step(1)} disabled={busy!==null||activeIndex<0||activeIndex>=visibleDocuments.length-1}>Siguiente</button></div></div>
    </section>

    <div className="operations-summary" aria-label="Resumen de operaciones documentales">
      <div><span>Seguras ahora</span><strong>{data.operationSummary.safe}</strong></div><div><span>Asociar</span><strong>{data.operationSummary.link}</strong></div><div><span>Archivar</span><strong>{data.operationSummary.archive}</strong></div><div><span>Revisión manual</span><strong>{data.operationSummary.manual}</strong></div>
    </div>
    <div className="operations-toolbar" aria-label="Acciones seguras en lote">
      <div><strong>{selected.length} seleccionada{selected.length===1?"":"s"}</strong><span>Solo se pueden seleccionar acciones que el servidor considera seguras y reversibles.</span></div>
      <div className="operations-toolbar-actions"><button className="ghost" type="button" onClick={selectSafe} disabled={!safeDocuments.length||busy!==null}>Seleccionar seguras</button><button className="ghost" type="button" onClick={()=>setSelected([])} disabled={!selected.length||busy!==null}>Limpiar</button><button className="primary-action" type="button" onClick={applySelected} disabled={!selected.length||busy!==null}>{busy==="batch"?"Revalidando…":`Aplicar ${selected.length||""} seguras`}</button>{lastApplied.length>0&&<button className="secondary-action" type="button" onClick={undoLast} disabled={busy!==null}>{busy==="undo"?"Deshaciendo…":`Deshacer ${lastApplied.length}`}</button>}</div>
    </div>
    <div className="triage-summary" aria-label="Etapas pendientes del flujo documental">
      <div><span>1 · OCR</span><strong>{data.summary.reviewOcr}</strong></div><div><span>2 · Datos</span><strong>{data.summary.completeMetadata}</strong></div><div><span>3 · Asociar</span><strong>{data.summary.readyToLink}</strong></div><div><span>4 · Revisar</span><strong>{data.summary.reviewMatch}</strong></div><div><span>5 · Buscar</span><strong>{data.summary.investigateNoMatch}</strong></div><div><span>6 · Archivar</span><strong>{data.summary.archiveCandidate}</strong></div>
    </div>

    {!data.documents.length&&<div className="empty-state"><strong>No hay documentos que requieran atención.</strong><span>Todos los documentos activos están resueltos o no necesitan una acción adicional.</span></div>}
    {data.documents.length>0&&!visibleDocuments.length&&<div className="empty-state"><strong>No hay documentos con este filtro.</strong><span>Cambia el filtro o borra la búsqueda para volver a ver la cola.</span></div>}

    <div className="triage-list">
      {visibleDocuments.map(document=>{
        const suggestions=[...document.suggestions].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
        const archiveQuery=`/archivo?view=new&q=${encodeURIComponent(document.fileName)}`;
        const canMatch=document.action==="ready_to_link"||document.action==="review_match";
        const selectedSafe=selected.includes(document.id);
        const isActive=document.id===activeId;
        return <section id={`triage-${document.id}`} className={`triage-item triage-${document.action}${document.safeOperation?" triage-safe":""}${isActive?" triage-active":""}`} key={document.id} aria-current={isActive?"step":undefined}>
          <header><div className="triage-document-heading">{document.safeOperation&&<label className="operation-check"><input type="checkbox" checked={selectedSafe} onChange={()=>toggle(document.id)} disabled={busy!==null}/><span className="sr-only">Seleccionar operación segura para {document.fileName}</span></label>}<div><div className="triage-item-title"><span className="triage-priority">Prioridad {document.priorityScore}</span><span className="triage-action">{actionLabel(document.action)}</span>{document.safeOperation&&<span className="operation-safe-badge">Seguro y reversible</span>}</div><h2>{document.fileName}</h2><p>{document.merchant||"Emisor sin identificar"} · {date(document.documentDate)} · {money(document.amount)}</p></div></div><div className="triage-header-actions">{!isActive&&<button className="primary-action" type="button" onClick={()=>focusDocument(document.id)}>Revisar</button>}{document.storageUrl&&<a className="ghost button-link" href={document.storageUrl} target="_blank" rel="noreferrer">Original</a>}<Link className="ghost button-link" href={archiveQuery}>Abrir en Archivo</Link></div></header>
          {isActive&&<div className="triage-detail">
            <p className="triage-hint">{actionHint(document.action)}</p>
            {document.safeOperation&&<div className="operation-safe-note"><strong>{document.safeOperation.label}</strong><span>Solo se ejecutará si al confirmar sigue cumpliendo exactamente las condiciones de seguridad.</span></div>}
            {!!document.reasons.length&&<ul className="triage-reasons">{document.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
            {canMatch&&suggestions.length>0&&<div className="review-candidates">{suggestions.map((candidate,index)=><article key={`${document.id}-${candidate.sourceId}`} className={`review-candidate${index===0?" best":""}`}><div><div className="candidate-heading"><strong>{index===0?"Mejor coincidencia":"Alternativa"}</strong><span className={`confidence confidence-${candidate.confidenceTier||"unknown"}`}>Confianza {confidenceLabel(candidate.confidenceTier).toLowerCase()}</span></div><span>{candidate.counterparty||candidate.concept||candidate.sourceId}</span><small>{date(candidate.date)} · {money(candidate.amount)}{candidate.score!=null?` · score ${Math.round(Number(candidate.score))}%`:""}{candidate.scoreMargin!=null&&candidate.candidateRank===1?` · margen ${Math.round(Number(candidate.scoreMargin))} pt`:""}{candidate.daysDiff!=null?` · ${Math.abs(candidate.daysDiff)} día${Math.abs(candidate.daysDiff)===1?"":"s"} de diferencia`:""}{candidate.amountDiff!=null?` · diferencia ${money(Math.abs(candidate.amountDiff))}`:""}</small>{candidate.reasons?.length?<small>{candidate.reasons.join(" · ")}</small>:null}</div><button className={index===0?"primary-action":"ghost"} type="button" disabled={busy!==null} onClick={()=>link(document.id,candidate)}>{busy===document.id?"Asociando…":"Asociar manualmente"}</button></article>)}</div>}
            {canMatch&&!suggestions.length&&<div className="candidate-empty"><strong>Sin candidatos disponibles</strong><span>Este caso necesita completar datos o localizar el movimiento desde Archivo antes de poder asociarlo.</span></div>}
          </div>}
        </section>;
      })}
    </div>
    <p className="triage-safety">Nada se asocia ni se archiva de forma automática. Las operaciones seguras requieren selección y confirmación explícitas; el servidor vuelve a validar cada documento al ejecutar y los casos ambiguos permanecen siempre en revisión manual.</p>
  </div>;
}
