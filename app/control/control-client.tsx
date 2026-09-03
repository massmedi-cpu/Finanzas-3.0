import Link from "next/link";
import { formatEuro } from "@/lib/format/es-es";
import type { ControlAlert,ControlAlertState,ControlOverview,ControlSeverity,ControlSnapshot } from "@/lib/financial/control";
import { CloseMonthActions,ControlAlertActions,ControlMutationBoundary,ControlMutationFeedback,ReopenMonthAction } from "./control-actions";

const monthFmt=new Intl.DateTimeFormat("es-ES",{month:"long",year:"numeric",timeZone:"Europe/Madrid"});
const dateTimeFmt=new Intl.DateTimeFormat("es-ES",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Madrid"});
const madridMonthFmt=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit"});
const severityLabel:Record<ControlSeverity,string>={critical:"Crítica",high:"Alta",medium:"Media",low:"Informativa"};
const severityTone:Record<ControlSeverity,"error"|"warning"|"info"|"ok">={critical:"error",high:"warning",medium:"info",low:"ok"};
const stateLabel:Record<ControlAlertState,string>={open:"Abierta",resolved:"Resuelta",dismissed:"Ignorada",snoozed:"Pospuesta"};
const stateTone:Record<ControlAlertState,"info"|"ok"|"muted"|"warning">={open:"info",resolved:"ok",dismissed:"muted",snoozed:"warning"};

function monthLabel(month:string){return monthFmt.format(new Date(`${month}-01T12:00:00Z`));}
function currentMadridMonth(){const parts=madridMonthFmt.formatToParts(new Date());return `${parts.find(part=>part.type==="year")?.value}-${parts.find(part=>part.type==="month")?.value}`;}
function shiftMonth(month:string,delta:number){const date=new Date(`${month}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+delta);return date.toISOString().slice(0,7);}
function alertHref(alert:ControlAlert,snapshot:ControlSnapshot){const range=`from=${snapshot.monthStart}&to=${snapshot.monthEnd}`;if(alert.type==="needs_review")return `/movimientos?review=1&${range}`;if(alert.type==="duplicates")return `/movimientos?duplicate=1&${range}`;if(alert.type==="reconciliation")return `/movimientos?reconciled=0&${range}`;return alert.href;}

export function ControlClient({initialData:data}:{initialData:ControlOverview}){
  const selectedClose=data.closes.find(close=>close.month===data.month)||null;
  const isCompletedMonth=data.month<currentMadridMonth();
  const openCritical=data.alerts.filter(alert=>alert.severity==="critical"||alert.severity==="high").length;
  const snapshot=data.snapshot;
  const selectedMonthLabel=monthLabel(data.month);

  return <ControlMutationBoundary>
    <div className="control-toolbar">
      <div className="control-month-nav"><Link className="ghost button-link" href={`/control?month=${shiftMonth(data.month,-1)}`} aria-label="Mes anterior">←</Link><form action="/control"><label>Periodo<input type="month" name="month" defaultValue={data.month}/></label><button className="primary-action" type="submit">Ver mes</button></form><Link className="ghost button-link" href={`/control?month=${shiftMonth(data.month,1)}`} aria-label="Mes siguiente">→</Link></div>
      <div><strong>{selectedMonthLabel}</strong><span>{openCritical?`${openCritical} prioridades altas`:data.alerts.length?`${data.alerts.length} avisos abiertos`:"Sin avisos abiertos"}</span></div>
    </div>
    <ControlMutationFeedback/>

    <section className="control-summary" aria-label="Resumen del mes">
      <article><span>Ingresos</span><strong>{formatEuro(snapshot.income)}</strong><small>Cash Flow computable</small></article>
      <article><span>Gastos</span><strong>{formatEuro(snapshot.expenses)}</strong><small>Gasto personal real</small></article>
      <article className={snapshot.net<0?"warning":"good"}><span>Cash Flow neto</span><strong>{formatEuro(snapshot.net)}</strong><small>{snapshot.net<0?"Mes negativo":"Mes positivo"}</small></article>
      <article className={snapshot.closeBlockers?"danger":snapshot.closeWarnings?"warning":"good"}><span>Estado de cierre</span><strong>{snapshot.closeBlockers?`${snapshot.closeBlockers} bloqueos`:snapshot.closeWarnings?`${snapshot.closeWarnings} avisos`:"Listo"}</strong><small>{snapshot.closeReady?"Puede cerrarse cuando termine el mes":"Requiere revisión"}</small></article>
    </section>

    <div className="control-grid">
      <section className="control-panel alerts-panel"><div className="control-panel-head"><div><p className="eyebrow">PRIORIDADES</p><h2>Avisos financieros</h2></div><span className="pill">{data.alerts.length} abiertos{data.hiddenAlertCount?` · ${data.hiddenAlertCount} ocultos`:""}</span></div>
        {!data.alerts.length?<div className="control-empty"><strong>No hay avisos abiertos para este periodo.</strong><p>El centro de control seguirá vigilando revisión, duplicados, conciliación, presupuesto, anomalías y cierres.</p></div>:<div className="alert-list">{data.alerts.map(alert=><article className={`control-alert severity-${alert.severity}`} key={alert.key}>
          <div className="alert-head"><div><span className={`status-badge ${severityTone[alert.severity]}`}>{severityLabel[alert.severity]}</span><h3>{alert.title}</h3></div><span className={`status-badge ${stateTone[alert.state]}`}>{stateLabel[alert.state]}</span></div>
          <p>{alert.detail}</p><ControlAlertActions alertKey={alert.key} originHref={alertHref(alert,snapshot)}/>
        </article>)}</div>}
      </section>

      <section className="control-panel close-panel"><div className="control-panel-head"><div><p className="eyebrow">CIERRE MENSUAL</p><h2>{selectedMonthLabel}</h2></div>{selectedClose&&<span className={`status-badge ${selectedClose.status==="closed"?"ok":"warning"}`}>{selectedClose.status==="closed"?"Cerrado":"Reabierto"}</span>}</div>
        <CloseChecklist snapshot={snapshot}/>
        {!isCompletedMonth?<div className="close-note"><strong>Mes en curso</strong><p>El cierre se habilita al terminar el mes. Puedes resolver los bloqueos desde ahora.</p></div>:selectedClose?.status==="closed"?<div className="close-confirmed"><strong>Cierre guardado</strong><p>{selectedClose.closedAt?`Registrado el ${dateTimeFmt.format(new Date(selectedClose.closedAt))}.`:"Snapshot financiero conservado."}</p>{selectedClose.notes&&<p>Nota: {selectedClose.notes}</p>}<ReopenMonthAction month={data.month} monthLabel={selectedMonthLabel}/></div>:<CloseMonthActions month={data.month} monthLabel={selectedMonthLabel} closeReady={snapshot.closeReady}/>} 
      </section>
    </div>

    <section className="control-panel control-history"><div className="control-panel-head"><div><p className="eyebrow">TRAZABILIDAD</p><h2>Últimos cierres</h2></div><span className="pill">{data.closes.length} registrados</span></div>{!data.closes.length?<div className="control-empty compact"><strong>Todavía no hay cierres guardados.</strong><p>Cuando cierres un mes aparecerá aquí con su snapshot financiero.</p></div>:<div className="close-history-list">{data.closes.map(close=><Link href={`/control?month=${close.month}`} key={close.id}><span><strong>{monthLabel(close.month)}</strong><small>{close.status==="closed"?"Cierre vigente":"Reabierto"}</small></span><span><b>{formatEuro(close.snapshot.net)}</b><small>{close.snapshot.closeWarnings} avisos en el snapshot</small></span></Link>)}</div>}</section>

    <aside className="control-rules"><strong>Reglas del centro de control</strong><p><b>Gasto anómalo:</b> {data.rules.highExpense}. <b>Bloqueos de cierre:</b> {data.rules.closeBlockers}. <b>Avisos no bloqueantes:</b> {data.rules.closeWarnings}. Resolver o ignorar un aviso no modifica ningún movimiento; el dato financiero solo cambia desde su módulo de origen.</p></aside>
  </ControlMutationBoundary>;
}

function CloseChecklist({snapshot}:{snapshot:ControlSnapshot}){const rows=[
  ["Duplicados",snapshot.duplicates,snapshot.duplicates===0,true],
  ["Pendientes de revisión",snapshot.needsReview,snapshot.needsReview===0,true],
  ["Sin conciliar",snapshot.unreconciled,snapshot.unreconciled===0,false],
  ["Presupuestos excedidos",snapshot.overBudgetCount,snapshot.overBudgetCount===0,false],
] as const;return <ul className="close-checklist">{rows.map(([label,count,ok,blocking])=><li key={label} className={ok?"ok":blocking?"blocking":"warning"}><span>{ok?"✓":blocking?"!":"·"}</span><div><strong>{label}</strong><small>{ok?"Sin incidencias":`${count} pendiente${count===1?"":"s"}${blocking?" · bloquea el cierre":" · no bloquea"}`}</small></div></li>)}<li className={snapshot.unbudgetedSpent===0?"ok":"warning"}><span>{snapshot.unbudgetedSpent===0?"✓":"·"}</span><div><strong>Gasto sin presupuesto</strong><small>{snapshot.unbudgetedSpent===0?"Todo el gasto está presupuestado":`${formatEuro(snapshot.unbudgetedSpent)} · no bloquea`}</small></div></li></ul>}
