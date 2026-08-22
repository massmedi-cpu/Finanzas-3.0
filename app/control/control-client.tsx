"use client";

import Link from "next/link";
import { useMemo,useState } from "react";
import type { ControlAlert,ControlAlertState,ControlOverview,ControlSeverity,ControlSnapshot } from "@/lib/financial/control";

const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});
const monthFmt=new Intl.DateTimeFormat("es-ES",{month:"long",year:"numeric"});
const severityLabel:Record<ControlSeverity,string>={critical:"Crítica",high:"Alta",medium:"Media",low:"Informativa"};
const stateLabel:Record<ControlAlertState,string>={open:"Abierta",resolved:"Resuelta",dismissed:"Ignorada",snoozed:"Pospuesta"};
function monthLabel(month:string){return monthFmt.format(new Date(`${month}-01T12:00:00`));}
function currentMadridMonth(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit"}).formatToParts(new Date());return `${parts.find(p=>p.type==="year")?.value}-${parts.find(p=>p.type==="month")?.value}`;}
function shiftMonth(month:string,delta:number){const d=new Date(`${month}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);}

export function ControlClient({initialData}:{initialData:ControlOverview}){
  const [data,setData]=useState(initialData);const [loading,setLoading]=useState(false);const [feedback,setFeedback]=useState<string|null>(null);const [notes,setNotes]=useState("");
  const selectedClose=useMemo(()=>data.closes.find(c=>c.month===data.month)||null,[data.closes,data.month]);
  const isCompletedMonth=data.month<currentMadridMonth();
  const openCritical=data.alerts.filter(a=>a.severity==="critical"||a.severity==="high").length;
  const snapshot=data.snapshot;

  async function reload(month=data.month){const r=await fetch(`/api/control?month=${encodeURIComponent(month)}`,{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se ha podido actualizar el centro de control");setData(j);}
  async function alertAction(alert:ControlAlert,action:ControlAlertState){setLoading(true);setFeedback(null);try{const r=await fetch("/api/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"alert",key:alert.key,action,days:7})});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se ha podido actualizar el aviso");await reload();setFeedback(action==="resolved"?"Aviso marcado como resuelto.":action==="snoozed"?"Aviso pospuesto 7 días.":action==="dismissed"?"Aviso ignorado.":"Aviso reabierto.");}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido actualizar el aviso");}finally{setLoading(false);}}
  async function closeMonth(){if(!isCompletedMonth)return;if(!snapshot.closeReady){setFeedback("Este mes todavía tiene bloqueos que deben resolverse antes del cierre.");return;}if(!window.confirm(`¿Cerrar ${monthLabel(data.month)}? Se guardará una fotografía verificable de sus cifras y avisos.`))return;setLoading(true);setFeedback(null);try{const r=await fetch("/api/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"close",month:data.month,notes})});const j=await r.json();if(!r.ok)throw new Error(j.error==="month_has_blockers"?"El mes tiene bloqueos pendientes.":j.error||"No se ha podido cerrar el mes");setNotes("");await reload();setFeedback(`Cierre de ${monthLabel(data.month)} guardado.`);}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido cerrar el mes");}finally{setLoading(false);}}
  async function reopenMonth(){if(!selectedClose||selectedClose.status!=="closed")return;if(!window.confirm(`¿Reabrir ${monthLabel(data.month)}? El snapshot histórico se conserva, pero el mes volverá a quedar editable para un nuevo cierre.`))return;setLoading(true);setFeedback(null);try{const r=await fetch("/api/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"reopen",month:data.month})});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se ha podido reabrir el mes");await reload();setFeedback(`Mes ${monthLabel(data.month)} reabierto.`);}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido reabrir el mes");}finally{setLoading(false);}}

  return <div className={`control-module ${loading?"is-loading":""}`}>
    <div className="control-toolbar">
      <div className="control-month-nav"><Link className="ghost button-link" href={`/control?month=${shiftMonth(data.month,-1)}`} aria-label="Mes anterior">←</Link><form action="/control"><label>Periodo<input type="month" name="month" defaultValue={data.month}/></label><button className="primary-action" type="submit">Ver mes</button></form><Link className="ghost button-link" href={`/control?month=${shiftMonth(data.month,1)}`} aria-label="Mes siguiente">→</Link></div>
      <div><strong>{monthLabel(data.month)}</strong><span>{openCritical?`${openCritical} prioridades altas`:data.alerts.length?`${data.alerts.length} avisos abiertos`:"Sin avisos abiertos"}</span></div>
    </div>
    {feedback&&<div className="control-feedback" role="status" aria-live="polite">{feedback}</div>}

    <section className="control-summary" aria-label="Resumen del mes">
      <article><span>Ingresos</span><strong>{money.format(snapshot.income)}</strong><small>Cash Flow computable</small></article>
      <article><span>Gastos</span><strong>{money.format(snapshot.expenses)}</strong><small>Gasto personal real</small></article>
      <article className={snapshot.net<0?"warning":"good"}><span>Cash Flow neto</span><strong>{money.format(snapshot.net)}</strong><small>{snapshot.net<0?"Mes negativo":"Mes positivo"}</small></article>
      <article className={snapshot.closeBlockers?"danger":snapshot.closeWarnings?"warning":"good"}><span>Estado de cierre</span><strong>{snapshot.closeBlockers?`${snapshot.closeBlockers} bloqueos`:snapshot.closeWarnings?`${snapshot.closeWarnings} avisos`:"Listo"}</strong><small>{snapshot.closeReady?"Puede cerrarse cuando termine el mes":"Requiere revisión"}</small></article>
    </section>

    <div className="control-grid">
      <section className="control-panel alerts-panel"><div className="control-panel-head"><div><p className="eyebrow">PRIORIDADES</p><h2>Avisos financieros</h2></div><span className="pill">{data.alerts.length} abiertos{data.hiddenAlertCount?` · ${data.hiddenAlertCount} ocultos`:""}</span></div>
        {!data.alerts.length?<div className="control-empty"><strong>No hay avisos abiertos para este periodo.</strong><p>El centro de control seguirá vigilando revisión, duplicados, conciliación, presupuesto, anomalías y cierres.</p></div>:<div className="alert-list">{data.alerts.map(alert=><article className={`control-alert severity-${alert.severity}`} key={alert.key}>
          <div className="alert-head"><div><span className={`severity-badge ${alert.severity}`}>{severityLabel[alert.severity]}</span><h3>{alert.title}</h3></div><span className="alert-state">{stateLabel[alert.state]}</span></div>
          <p>{alert.detail}</p><div className="alert-actions"><Link className="text-link" href={alert.href}>Abrir origen →</Link><span/><button type="button" className="text-button" onClick={()=>alertAction(alert,"snoozed")} disabled={loading}>Posponer 7 días</button><button type="button" className="text-button" onClick={()=>alertAction(alert,"resolved")} disabled={loading}>Marcar resuelto</button><button type="button" className="text-button muted" onClick={()=>alertAction(alert,"dismissed")} disabled={loading}>Ignorar</button></div>
        </article>)}</div>}
      </section>

      <section className="control-panel close-panel"><div className="control-panel-head"><div><p className="eyebrow">CIERRE MENSUAL</p><h2>{monthLabel(data.month)}</h2></div>{selectedClose&&<span className={`close-status ${selectedClose.status}`}>{selectedClose.status==="closed"?"Cerrado":"Reabierto"}</span>}</div>
        <CloseChecklist snapshot={snapshot}/>
        {!isCompletedMonth?<div className="close-note"><strong>Mes en curso</strong><p>El cierre se habilita al terminar el mes. Puedes resolver los bloqueos desde ahora.</p></div>:selectedClose?.status==="closed"?<div className="close-confirmed"><strong>Cierre guardado</strong><p>{selectedClose.closedAt?`Registrado el ${new Date(selectedClose.closedAt).toLocaleString("es-ES")}.`:"Snapshot financiero conservado."}</p>{selectedClose.notes&&<p>Nota: {selectedClose.notes}</p>}<button className="ghost" type="button" onClick={reopenMonth} disabled={loading}>Reabrir mes</button></div>:<div className="close-form"><label>Nota de cierre <small>Opcional</small><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Incidencias o contexto del mes"/></label><button className="primary-action" type="button" onClick={closeMonth} disabled={loading||!snapshot.closeReady}>{snapshot.closeReady?"Cerrar mes y guardar snapshot":"Resuelve los bloqueos para cerrar"}</button></div>}
      </section>
    </div>

    <section className="control-panel control-history"><div className="control-panel-head"><div><p className="eyebrow">TRAZABILIDAD</p><h2>Últimos cierres</h2></div><span className="pill">{data.closes.length} registrados</span></div>{!data.closes.length?<p className="muted-copy">Todavía no hay cierres guardados.</p>:<div className="close-history-list">{data.closes.map(close=><Link href={`/control?month=${close.month}`} key={close.id}><span><strong>{monthLabel(close.month)}</strong><small>{close.status==="closed"?"Cierre vigente":"Reabierto"}</small></span><span><b>{money.format(close.snapshot.net)}</b><small>{close.snapshot.closeWarnings} avisos en el snapshot</small></span></Link>)}</div>}</section>

    <aside className="control-rules"><strong>Reglas del centro de control</strong><p><b>Gasto anómalo:</b> {data.rules.highExpense}. <b>Bloqueos de cierre:</b> {data.rules.closeBlockers}. <b>Avisos no bloqueantes:</b> {data.rules.closeWarnings}. Resolver o ignorar un aviso no modifica ningún movimiento; el dato financiero solo cambia desde su módulo de origen.</p></aside>
  </div>;
}

function CloseChecklist({snapshot}:{snapshot:ControlSnapshot}){const rows=[
  ["Duplicados",snapshot.duplicates,snapshot.duplicates===0,true],
  ["Pendientes de revisión",snapshot.needsReview,snapshot.needsReview===0,true],
  ["Sin conciliar",snapshot.unreconciled,snapshot.unreconciled===0,false],
  ["Presupuestos excedidos",snapshot.overBudgetCount,snapshot.overBudgetCount===0,false],
] as const;return <ul className="close-checklist">{rows.map(([label,count,ok,blocking])=><li key={label} className={ok?"ok":blocking?"blocking":"warning"}><span>{ok?"✓":blocking?"!":"·"}</span><div><strong>{label}</strong><small>{ok?"Sin incidencias":`${count} pendiente${count===1?"":"s"}${blocking?" · bloquea el cierre":" · no bloquea"}`}</small></div></li>)}<li className={snapshot.unbudgetedSpent===0?"ok":"warning"}><span>{snapshot.unbudgetedSpent===0?"✓":"·"}</span><div><strong>Gasto sin presupuesto</strong><small>{snapshot.unbudgetedSpent===0?"Todo el gasto está presupuestado":`${money.format(snapshot.unbudgetedSpent)} · no bloquea`}</small></div></li></ul>}
