import { formatEuro } from "@/lib/format/es-es";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getAccountDetail } from "@/lib/financial/accounts";
import { BalanceChart } from "@/components/balance-chart";


const date = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
export const dynamic = "force-dynamic";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuthorizedUser();
  const { id } = await params;
  let data;
  try { data = await getAccountDetail(id); } catch { notFound(); }
  const account = data.account;

  return <main className="app-shell">
    
    <section id="main-content" tabIndex={-1} className="workspace account-detail-workspace">
      <header className="topbar"><div><p className="eyebrow">CUENTAS · DETALLE · {data.version}</p><h1>{account.name}</h1><p>{account.institution || "Openbank"} · {account.identifier}</p></div><Link className="ghost button-link" href="/cuentas">← Todas las cuentas</Link></header>

      <div className="account-detail-hero">
        <div><span>Saldo actual</span><strong>{account.balance == null ? "—" : formatEuro(account.balance)}</strong><small>{account.balanceDate ? `Saldo a ${date.format(new Date(account.balanceDate + "T12:00:00"))}` : "Sin fecha de saldo"}</small></div>
        <div className="account-detail-meta">
          <p><b>{account.movements.toLocaleString("es-ES")}</b><span>movimientos</span></p>
          <p><b>{account.firstDate ? date.format(new Date(account.firstDate + "T12:00:00")) : "—"}</b><span>primer movimiento</span></p>
          <p><b>{account.cashFlowEnabled ? "Sí" : "No"}</b><span>incluida en Cash Flow</span></p>
        </div>
      </div>

      <div className="account-detail-grid">
        <article className="panel account-chart-panel">
          <div className="panel-head"><div><p className="eyebrow">EVOLUCIÓN</p><h2>Saldo mensual</h2></div><span className="pill">Hasta 18 meses</span></div>
          <BalanceChart points={data.balanceSeries} />
        </article>
        <article className="panel account-source-panel">
          <div className="panel-head"><div><p className="eyebrow">FUENTES</p><h2>Productos asociados</h2></div></div>
          <div className="source-list">
            {data.sources.map(source => <div key={source.identifier} className={source.primary ? "primary-source" : "linked-source"}><span>{source.primary ? "Principal" : "Vinculada"}</span><strong>{source.label}</strong><small>{source.identifier}</small></div>)}
          </div>
          {data.sources.some(source => !source.primary) && <p className="source-explanation">Los productos vinculados aportan movimientos a esta cuenta, pero el saldo se toma únicamente del identificador principal.</p>}
        </article>
      </div>

      <article className="panel recent-account-movements">
        <div className="panel-head"><div><p className="eyebrow">ACTIVIDAD</p><h2>Últimos movimientos</h2></div><Link href="/movimientos">Abrir Movimientos →</Link></div>
        <div className="recent-movement-list">
          {data.recentMovements.map(movement => <div className="recent-movement" key={movement.id}>
            <div className="recent-date"><strong>{date.format(new Date(movement.date + "T12:00:00"))}</strong><span>{movement.sourceIdentifier}</span></div>
            <div className="recent-concept"><strong>{movement.concept || movement.counterparty || "Movimiento"}</strong><span>{movement.category || "Sin categoría"}{movement.needsReview ? " · Revisar" : ""}</span></div>
            <strong className={`recent-amount ${movement.amount < 0 ? "negative" : "positive"}`}>{formatEuro(movement.amount)}</strong>
          </div>)}
        </div>
      </article>
    </section>
  </main>;
}
