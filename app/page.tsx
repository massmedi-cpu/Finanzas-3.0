import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getFinancialDashboard } from "@/lib/financial/dashboard";
import { SyncButton } from "@/components/sync-button";
import { AppSidebar } from "@/components/app-sidebar";

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const date = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireAuthorizedUser();
  const dashboard = await getFinancialDashboard();
  return <main className="app-shell">
    <AppSidebar active="/" />
    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">INICIO · {dashboard.month}</p><h1>Tu situación financiera</h1><p>Datos reales consolidados desde la fuente bancaria.</p></div><SyncButton /></header>
      <div className="account-grid">
        {dashboard.accounts.map(account=><Link key={account.id} className={`account-card account-card-link ${account.role==="operating"?"primary":""}`} href={`/cuentas/${account.id}`}><div><span>{account.name}</span><small>{account.identifier}</small></div><strong>{account.balance==null?"—":money.format(account.balance)}</strong><p>{account.cashFlowEnabled?"Incluida en Cash Flow":"Excluida del Cash Flow"}{account.balanceDate?` · saldo ${date.format(new Date(account.balanceDate+"T12:00:00"))}`:""}</p></Link>)}
        <article className="account-card total"><div><span>Total disponible</span><small>Patrimonio financiero</small></div><strong>{money.format(dashboard.totalAvailable)}</strong><p>{dashboard.accounts.length} cuentas activas</p></article>
      </div>
      <div className="metric-grid">
        <article><span>Ingresos del mes</span><strong>{money.format(dashboard.income)}</strong><small>Solo movimientos computables</small></article>
        <article><span>Gastos del mes</span><strong>{money.format(dashboard.expenses)}</strong><small>Sin ahorro ni traspasos internos</small></article>
        <Link className="metric-link" href="/cash-flow"><article><span>Cash Flow</span><strong>{money.format(dashboard.cashFlow)}</strong><small>Abrir análisis anual →</small></article></Link>
        <article><span>Pendientes de revisar</span><strong>{dashboard.needsReview}</strong><small>{dashboard.reviewSource} por cambios en origen</small></article>
      </div>
      <div className="content-grid">
        <article className="panel"><div className="panel-head"><div><p className="eyebrow">CASH FLOW</p><h2>Control anual real</h2></div><Link className="pill pill-link" href="/cash-flow">Abrir Cash Flow</Link></div><div className="chart-placeholder"><div className="chart-line" /><span>Ingresos, gastos y acumulado mensual ya disponibles con reglas financieras protegidas.</span></div></article>
        <article className="panel"><div className="panel-head"><div><p className="eyebrow">CONTROL</p><h2>Estado del sistema</h2></div></div><ul className="health-list"><li><b>Autenticación</b><span>Google OAuth · server-side</span></li><li><b>Fuente</b><span>Google Drive XLSX · solo lectura</span></li><li><b>Última sincronización</b><span>{dashboard.sync?.status==="success"?"Correcta":"Pendiente"}</span></li><li><b>Último movimiento</b><span>{dashboard.lastMovementDate?date.format(new Date(dashboard.lastMovementDate+"T12:00:00")):"—"}</span></li><li><b>Versión</b><span>{dashboard.version} · Cash Flow real</span></li></ul></article>
      </div>
    </section>
  </main>;
}
