import "./reconciliation-workbench.css";
import { formatEuro } from "@/lib/format/es-es";
import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getReconciliationOverview, getReconciliationQueue } from "@/lib/financial/reconciliation";
import { ReconciliationWorkbench } from "./reconciliation-workbench";

const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
const methodLabel=(value:string)=>value==="linked_product_exact_same_day"?"Productos vinculados · exacto mismo día":value==="exact_same_day"?"Cuentas propias · exacto mismo día":value==="manual_exact"?"Emparejado manualmente · exacto":value;
const fmt=(value:string)=>dateFmt.format(new Date(`${value}T12:00:00`));

export const dynamic="force-dynamic";

export default async function ReconciliationPage(){
  await requireAuthorizedUser();
  const [data,queue]=await Promise.all([getReconciliationOverview(),getReconciliationQueue(null,25,0)]);
  return <main className="app-shell">
    <section id="main-content" tabIndex={-1} className="workspace reconciliation-workspace">
      <header className="topbar"><div><p className="eyebrow">CONCILIACIÓN · {data.version}</p><h1>Conciliación</h1><p>Resuelve casos con evidencia, registra decisiones y conserva intacto el estado original del XLSX.</p></div><Link className="ghost button-link" href="/movimientos">Volver a movimientos</Link></header>

      <section className="reconciliation-summary" aria-label="Resumen de conciliación">
        <article><span>Conciliados</span><strong className="positive">{data.summary.reconciled.toLocaleString("es-ES")}</strong><small>Origen + decisiones de la app</small></article>
        <article><span>Pendientes</span><strong>{data.summary.pending.toLocaleString("es-ES")}</strong><small>Necesitan contrapartida o evidencia</small></article>
        <article><span>No conciliados</span><strong className="negative">{data.summary.notReconciled.toLocaleString("es-ES")}</strong><small>Origen o decisión manual</small></article>
        <article><span>No aplica</span><strong>{data.summary.notApplicable.toLocaleString("es-ES")}</strong><small>No requieren conciliación</small></article>
      </section>

      <ReconciliationWorkbench initialData={queue}/>

      <div className="reconciliation-grid">
        <article className="panel reconciliation-methods"><div className="panel-head"><div><p className="eyebrow">TRAZABILIDAD</p><h2>Parejas confirmadas</h2></div><span className="pill">{data.pairs.length}</span></div>
          <div className="reconciliation-method-list">{data.methods.map(m=><div key={m.method}><span>{methodLabel(m.method)}</span><strong>{m.count}</strong></div>)}</div>
          <p className="muted-copy">Una pareja solo se crea cuando importe, producto y fechas cumplen las reglas de conciliación. Las aproximaciones ambiguas permanecen pendientes.</p>
        </article>
        <article className="panel reconciliation-rules"><div className="panel-head"><div><p className="eyebrow">REGLA</p><h2>Qué significa cada estado</h2></div></div>
          <ul><li><b>Conciliado</b><span>Existe confirmación del origen, una pareja validada o una decisión manual documentada.</span></li><li><b>Pendiente</b><span>Falta la segunda pata o una fuente independiente.</span></li><li><b>No conciliado</b><span>El origen lo marca como “No” o existe una decisión manual documentada.</span></li><li><b>Restaurar origen</b><span>Elimina el override manual y vuelve a aplicar el estado procedente de la fuente.</span></li></ul>
        </article>
      </div>

      <article className="panel reconciliation-pairs"><div className="panel-head"><div><p className="eyebrow">EVIDENCIA CONFIRMADA</p><h2>Últimas parejas</h2></div><span className="pill">confianza 100</span></div>
        <div className="reconciliation-table-wrap"><table><thead><tr><th>Fecha</th><th>Movimiento A</th><th>Movimiento B</th><th>Importe</th><th>Método</th></tr></thead><tbody>{data.pairs.slice(0,40).map(pair=><tr key={pair.id}><td>{fmt(pair.dateA)}</td><td><strong>{pair.a}</strong><small>{pair.accountA}</small></td><td><strong>{pair.b}</strong><small>{pair.accountB}</small></td><td className="numeric">{formatEuro(pair.amount)}</td><td><span>{methodLabel(pair.method)}</span><small>{pair.reason||"Coincidencia validada"}</small></td></tr>)}</tbody></table></div>
      </article>

      <p className="reconciliation-note">Financial App no concilia por parecido. Si falta evidencia, el movimiento permanece pendiente. Las decisiones manuales quedan auditadas y pueden retirarse restaurando el estado de origen.</p>
    </section>
  </main>;
}
