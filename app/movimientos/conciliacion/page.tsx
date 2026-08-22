import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { AppSidebar } from "@/components/app-sidebar";
import { getReconciliationOverview } from "@/lib/financial/reconciliation";

const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});
const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
const methodLabel=(value:string)=>value==="linked_product_exact_same_day"?"Productos vinculados · exacto mismo día":value==="exact_same_day"?"Cuentas propias · exacto mismo día":value;
const statusLabel=(value:string)=>value==="pending"?"Pendiente":"No conciliado";
const fmt=(value:string)=>dateFmt.format(new Date(`${value}T12:00:00`));

export const dynamic="force-dynamic";

export default async function ReconciliationPage(){
  await requireAuthorizedUser();
  const data=await getReconciliationOverview();
  return <main className="app-shell">
    <AppSidebar active="/movimientos" status="Conciliación · evidencia trazable" />
    <section className="workspace reconciliation-workspace">
      <header className="topbar"><div><p className="eyebrow">CONCILIACIÓN · {data.version}</p><h1>Conciliación</h1><p>Empareja solo operaciones con evidencia suficiente. El estado original del XLSX permanece intacto.</p></div><Link className="ghost button-link" href="/movimientos">Volver a movimientos</Link></header>

      <section className="reconciliation-summary" aria-label="Resumen de conciliación">
        <article><span>Conciliados</span><strong className="positive">{data.summary.reconciled.toLocaleString("es-ES")}</strong><small>Origen + conciliaciones de la app</small></article>
        <article><span>Pendientes</span><strong>{data.summary.pending.toLocaleString("es-ES")}</strong><small>Necesitan contrapartida o evidencia</small></article>
        <article><span>No conciliados</span><strong className="negative">{data.summary.notReconciled.toLocaleString("es-ES")}</strong><small>Marcados expresamente como No</small></article>
        <article><span>No aplica</span><strong>{data.summary.notApplicable.toLocaleString("es-ES")}</strong><small>No son casos pendientes</small></article>
      </section>

      <div className="reconciliation-grid">
        <article className="panel reconciliation-methods"><div className="panel-head"><div><p className="eyebrow">TRAZABILIDAD</p><h2>Parejas confirmadas</h2></div><span className="pill">{data.pairs.length}</span></div>
          <div className="reconciliation-method-list">{data.methods.map(m=><div key={m.method}><span>{methodLabel(m.method)}</span><strong>{m.count}</strong></div>)}</div>
          <p className="muted-copy">Una pareja solo se crea cuando la contrapartida queda identificada de forma inequívoca. Las aproximaciones ambiguas permanecen pendientes.</p>
        </article>
        <article className="panel reconciliation-rules"><div className="panel-head"><div><p className="eyebrow">REGLA</p><h2>Qué significa cada estado</h2></div></div>
          <ul><li><b>Conciliado</b><span>Existe confirmación del origen o una pareja validada por Financial App.</span></li><li><b>Pendiente</b><span>La operación requiere una segunda pata o una fuente independiente.</span></li><li><b>No conciliado</b><span>El origen la marca expresamente como “No” o existe un override manual.</span></li><li><b>No aplica</b><span>La operación no necesita conciliación. Nunca se cuenta como pendiente.</span></li></ul>
        </article>
      </div>

      <article className="panel reconciliation-pairs"><div className="panel-head"><div><p className="eyebrow">EVIDENCIA CONFIRMADA</p><h2>Últimas parejas</h2></div><span className="pill">confianza 100</span></div>
        <div className="reconciliation-table-wrap"><table><thead><tr><th>Fecha</th><th>Movimiento A</th><th>Movimiento B</th><th>Importe</th><th>Método</th></tr></thead><tbody>{data.pairs.slice(0,40).map(pair=><tr key={pair.id}><td>{fmt(pair.dateA)}</td><td><strong>{pair.a}</strong><small>{pair.accountA}</small></td><td><strong>{pair.b}</strong><small>{pair.accountB}</small></td><td className="numeric">{money.format(pair.amount)}</td><td><span>{methodLabel(pair.method)}</span><small>{pair.reason||"Coincidencia validada"}</small></td></tr>)}</tbody></table></div>
      </article>

      <article className="panel reconciliation-pending"><div className="panel-head"><div><p className="eyebrow">PENDIENTE DE EVIDENCIA</p><h2>Grupos todavía no resueltos</h2></div><span className="pill">{data.summary.pending+data.summary.notReconciled}</span></div>
        <div className="pending-groups">{data.unresolvedGroups.map((g,i)=><div key={`${g.status}-${g.identifier}-${g.subcategory}-${i}`}><div><strong>{g.subcategory}</strong><span>{g.account}</span><small>{fmt(g.firstDate)} — {fmt(g.lastDate)}</small></div><div><b>{g.count}</b><span>{statusLabel(g.status)}</span><small>{money.format(g.grossAmount)}</small></div></div>)}</div>
      </article>

      <p className="reconciliation-note">Financial App no concilia por parecido. Si falta el extracto o la segunda pata, el movimiento permanece pendiente hasta disponer de evidencia suficiente.</p>
    </section>
  </main>;
}
