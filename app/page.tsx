import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getFinancialDashboard } from "@/lib/financial/dashboard";
import { SyncButton } from "@/components/sync-button";

const sections = [["Inicio","/"],["Cuentas","/cuentas"],["Movimientos","/movimientos"],["Cash Flow","/cash-flow"],["Presupuesto","/presupuesto"],["Previsión","/prevision"],["Patrimonio","/patrimonio"],["Análisis","/analisis"],["Archivo","/archivo"],["Configuración","/configuracion"]] as const;
const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const date = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireAuthorizedUser();
  const dashboard = await getFinancialDashboard();
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">F</span><div><strong>Financial App</strong><small>Control financiero personal</small></div></div>
      <nav>{sections.map(([label,href])=><Link key={href} className={href==="/"?"active":""} href={href}>{label}</Link>)}</nav>
      <div className="sidebar-foot"><span className="status-dot" /> Datos reales · fuente solo lectura</div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">INICIO · {dashboard.month}</p><h1>Tu situación financiera</h1><p>Datos reales consolidados desde la fuente bancaria.</p></div><SyncButton /></header>
      <div className="account-grid">
        {dashboard.accounts.map((account,index)=><article key={account.id} className={`account-card ${account.role==="operating"?"primary":""}`}><div><span>{account.name}</span><small>{account.identifier}</small></div><strong>{account.balance==null?"—":money.format(account.balance)}</strong><p>{account.cashFlowEnabled?"Incluida en Cash Flow":"Excluida del Cash Flow"}{account.balanceDate?` · saldo ${date.format(new Date(account.balanceDate+"T12:00:00"))}`:""}</p></article>)}
        <article className="account-card total"><div><span>Total disponible</span><small>Patrimonio financiero</small></div><strong>{money.format(dashboard.totalAvailable)}</strong><p>{dashboard.accounts.length} cuentas activas</p></article>
      </div>
      <div className="metric-grid">
        <article><span>Ingresos del mes</span><strong>{money.format(dashboard.income)}</strong><small>Solo movimientos computables</small></article>
        <article><span>Gastos del mes</span><strong>{money.format(dashboard.expenses)}</strong><small>Sin ahorro ni traspasos internos</small></article>
        <article><span>Cash Flow</span><strong>{money.format(dashboard.cashFlow)}</strong><small>Ingresos reales − gastos reales</small></article>
        <article><span>Pendientes de revisar</span><strong>{dashboard.needsReview}</strong><small>{dashboard.reviewSource} por cambios en origen</small></article>
      </div>
      <div className="content-grid">
        <article className="panel"><div className="panel-head"><div><p className="eyebrow">EVOLUCIÓN</p><h2>Saldo y patrimonio</h2></div><span className="pill">{dashboard.movementsTotal.toLocaleString("es-ES")} movimientos</span></div><div className="chart-placeholder"><div className="chart-line" /><span>Datos reales conectados. La serie histórica se incorporará en la siguiente fase visual.</span></div></article>
        <article className="panel"><div className="panel-head"><div><p className="eyebrow">CONTROL</p><h2>Estado del sistema</h2></div></div><ul className="health-list"><li><b>Autenticación</b><span>Google OAuth · server-side</span></li><li><b>Fuente</b><span>Google Drive XLSX · solo lectura</span></li><li><b>Última sincronización</b><span>{dashboard.sync?.status==="success"?"Correcta":"Pendiente"}</span></li><li><b>Último movimiento</b><span>{dashboard.lastMovementDate?date.format(new Date(dashboard.lastMovementDate+"T12:00:00")):"—"}</span></li><li><b>Versión</b><span>0.2.0 · Datos reales</span></li></ul></article>
      </div>
    </section>
  </main>;
}
