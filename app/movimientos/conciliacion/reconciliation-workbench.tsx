"use client";

import { useMemo, useState } from "react";
import { formatEuro } from "@/lib/format/es-es";
import type { ReconciliationCase, ReconciliationQueue } from "@/lib/financial/reconciliation";

type QueueStatus="all"|"pending"|"not_reconciled";
const fmtDate=(value:string)=>new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(`${value}T12:00:00`));
const statusText=(value:string)=>value==="pending"?"Pendiente":"No conciliado";
const errorText=(code:string)=>({
  changed_since_open:"El movimiento cambió desde que abriste la cola. Se ha recargado para evitar sobrescribir cambios.",
  candidate_changed_since_open:"La contrapartida cambió desde que abriste la cola. Se ha recargado.",
  reconciliation_reason_required:"Escribe un motivo de al menos 3 caracteres.",
  amounts_do_not_offset:"Los importes ya no se compensan exactamente.",
  dates_too_far_apart:"Las fechas están demasiado separadas.",
  pair_already_reconciled:"Uno de los movimientos ya fue conciliado.",
  reconciliation_pair_failed:"No se pudo crear la pareja de conciliación.",
  reconciliation_update_failed:"No se pudo guardar la decisión.",
}[code]||"No se pudo completar la acción.");

export function ReconciliationWorkbench({initialData}:{initialData:ReconciliationQueue}){
  const [data,setData]=useState(initialData);
  const [status,setStatus]=useState<QueueStatus>("all");
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const pages=Math.max(1,Math.ceil(data.total/data.limit));
  const page=Math.floor(data.offset/data.limit)+1;
  const candidateTotal=useMemo(()=>data.items.reduce((sum,item)=>sum+item.candidateCount,0),[data.items]);

  async function load(nextStatus:QueueStatus=status,nextOffset=0){
    setBusy("queue");setError(null);
    try{
      const q=new URLSearchParams({limit:String(data.limit),offset:String(nextOffset)});
      if(nextStatus!=="all")q.set("status",nextStatus);
      const response=await fetch(`/api/reconciliation?${q}`,{cache:"no-store"});
      const body=await response.json() as ReconciliationQueue&{error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"reconciliation_queue_unavailable");
      setData(body);setStatus(nextStatus);
    }catch(cause){setError(errorText(cause instanceof Error?cause.message:""));}
    finally{setBusy(null);}
  }

  async function post(item:ReconciliationCase,payload:Record<string,unknown>,success:string){
    setBusy(item.id);setError(null);setMessage(null);
    try{
      const response=await fetch("/api/reconciliation",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"reconciliation_update_failed");
      setMessage(success);setReasons(current=>({...current,[item.id]:""}));
      await load(status,data.offset);
    }catch(cause){setError(errorText(cause instanceof Error?cause.message:""));await load(status,data.offset);}
    finally{setBusy(null);}
  }

  function reasonFor(item:ReconciliationCase){return (reasons[item.id]||"").trim();}
  function setReason(id:string,value:string){setReasons(current=>({...current,[id]:value}));}

  return <section className="reconciliation-workbench" aria-label="Cola de conciliación">
    <div className="workbench-head">
      <div><p className="eyebrow">COLA ACCIONABLE</p><h2>Resolver movimientos</h2><p>Solo se sugieren parejas que compensan importe, pertenecen a otro producto y están a ±3 días.</p></div>
      <div className="workbench-stats"><strong>{data.total.toLocaleString("es-ES")}</strong><span>casos</span><strong>{candidateTotal}</strong><span>candidatos en esta página</span></div>
    </div>

    <div className="workbench-toolbar" role="group" aria-label="Filtrar conciliación">
      {([['all','Todos'],['pending','Pendientes'],['not_reconciled','No conciliados']] as const).map(([value,label])=><button key={value} type="button" className={status===value?"ghost is-active":"ghost"} disabled={busy!==null} onClick={()=>load(value,0)}>{label}</button>)}
      <span>{busy==="queue"?"Actualizando…":`Página ${page} de ${pages}`}</span>
    </div>

    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}

    <div className="reconciliation-case-list">
      {data.items.map(item=><article className="reconciliation-case" key={item.id}>
        <div className="case-main">
          <div className="case-date"><strong>{fmtDate(item.date)}</strong><span>{item.sourceId}</span></div>
          <div className="case-copy"><div><span className={`status-badge ${item.status==="pending"?"warning":"muted"}`}>{statusText(item.status)}</span>{item.internalTransfer&&<span className="status-badge edited">Traspaso interno</span>}</div><h3>{item.concept||item.subcategory||"Movimiento sin concepto"}</h3><p>{item.account} · {item.subcategory||"Sin subcategoría"}</p>{item.counterparty&&<small>{item.counterparty}</small>}</div>
          <div className={`case-amount ${item.amount<0?"negative":"positive"}`}>{formatEuro(item.amount)}</div>
        </div>

        {item.lastDecision&&<div className="case-decision"><span>Última decisión: {item.lastDecision.decision}</span><small>{item.lastDecision.reason||"Sin motivo"}</small></div>}

        {item.candidates.length>0&&<div className="candidate-list"><strong>Contrapartidas exactas</strong>{item.candidates.map(candidate=><div className="candidate-row" key={candidate.id}><div><b>{fmtDate(candidate.date)} · {candidate.account}</b><span>{candidate.concept}</span><small>{candidate.sourceId} · diferencia {candidate.dayDifference} día{candidate.dayDifference===1?"":"s"}</small></div><strong className={candidate.amount<0?"negative":"positive"}>{formatEuro(candidate.amount)}</strong><button className="primary-action" type="button" disabled={busy!==null||reasonFor(item).length<3} onClick={()=>post(item,{action:"pair",id:item.id,candidateId:candidate.id,expectedUpdatedAt:item.updatedAt,candidateExpectedUpdatedAt:candidate.updatedAt,reason:reasonFor(item)},"Pareja conciliada con evidencia exacta.")}>Emparejar</button></div>)}</div>}

        <div className="case-actions">
          <label><span>Motivo de la decisión</span><textarea maxLength={500} rows={2} value={reasons[item.id]||""} onChange={event=>setReason(item.id,event.target.value)} placeholder={item.candidateCount?"Ej.: misma transferencia entre mis cuentas":"Ej.: verificado en extracto externo"}/></label>
          <div><button type="button" className="primary-action" disabled={busy!==null||reasonFor(item).length<3} onClick={()=>post(item,{action:"set_status",id:item.id,status:"reconciled",reason:reasonFor(item),expectedUpdatedAt:item.updatedAt},"Movimiento marcado como conciliado y registrado en historial.")}>Marcar conciliado</button><button type="button" className="ghost" disabled={busy!==null||reasonFor(item).length<3} onClick={()=>post(item,{action:"set_status",id:item.id,status:"not_reconciled",reason:reasonFor(item),expectedUpdatedAt:item.updatedAt},"Movimiento marcado como no conciliado y registrado en historial.")}>No conciliado</button>{item.override!==null&&<button type="button" className="ghost" disabled={busy!==null} onClick={()=>post(item,{action:"set_status",id:item.id,status:"source",reason:null,expectedUpdatedAt:item.updatedAt},"Decisión manual retirada; vuelve a mandar el estado de origen.")}>Restaurar origen</button>}</div>
        </div>
      </article>)}
      {!data.items.length&&<div className="empty-state"><strong>No hay casos en este filtro.</strong><span>La cola está limpia para el estado seleccionado.</span></div>}
    </div>

    <div className="pagination"><span>{data.total.toLocaleString("es-ES")} casos</span><div><button className="ghost" type="button" disabled={busy!==null||data.offset===0} onClick={()=>load(status,Math.max(0,data.offset-data.limit))}>Anterior</button><button className="ghost" type="button" disabled={busy!==null||data.offset+data.limit>=data.total} onClick={()=>load(status,data.offset+data.limit)}>Siguiente</button></div></div>
  </section>;
}
