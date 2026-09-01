import { formatEuro } from "@/lib/format/es-es";
import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getAccountsOverview } from "@/lib/financial/accounts";
import { BalanceChart } from "@/components/balance-chart";

const date=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
export const dynamic="force-dynamic";

export default async function AccountsPage(){
  await requireAuthorizedUser();
  const data=await getAccountsOverview();
  const operatingBalance=data.accounts.filter(account=>account.role==="operating").reduce((total,account)=>total+(account.balance??0),0);
  const savingsBalance=data.accounts.filter(account=>account.role!=="operating").reduce((total,account)=>total+(account.balance??0),0);
  const cashFlowAccounts=data.accounts.filter(account=>account.cashFlowEnabled).length;

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace accounts-workspace">
    <header className="topbar"><div><p className="eyebrow">CUENTAS · {data.version}</p><h1>Cuentas</h1><p>Tu liquidez por cuenta, con la actividad mensual y la evolución del saldo sin mezclar detalles técnicos en la vista principal.</p></div><Link className="ghost button-link" href="/">Volver al inicio</Link></header>

    <section className="accounts-total decision-summary" aria-label="Resumen de saldos">
      <article className="decision-metric is-primary"><span>Total disponible</span><strong>{formatEuro(data.totalAvailable)}</strong><small>{data.accounts.length} cuentas activas</small></article>
      <article className="decision-metric"><span>Operativa</span><strong>{formatEuro(operatingBalance)}</strong><small>saldo disponible para el día a día</small></article>
      <article className="decision-metric"><span>Ahorro</span><strong>{formatEuro(savingsBalance)}</strong><small>saldo en cuentas de ahorro</small></article>
      <article className="decision-metric"><span>Cash Flow</span><strong>{cashFlowAccounts}/{data.accounts.length}</strong><small>cuentas incluidas en el flujo financiero</small></article>
    </section>

    <div className="accounts-list">{data.accounts.map(account=><article className={`account-overview ${account.role==="operating"?"operating":"savings"}`} key={account.id}>
      <div className="account-overview-head"><div><p className="eyebrow">{account.role==="operating"?"OPERATIVA":"AHORRO"}</p><h2>{account.name}</h2><span>{account.institution||"Entidad no indicada"}</span></div><div className="account-balance"><small>Saldo actual</small><strong>{account.balance==null?"—":formatEuro(account.balance)}</strong><span>{account.balanceDate?`Actualizado ${date.format(new Date(account.balanceDate+"T12:00:00"))}`:"Sin fecha de saldo"}</span></div></div>
      <BalanceChart points={account.balanceSeries} compact/>
      <div className="account-stats"><div><span>Ingresos del mes</span><strong>{formatEuro(account.monthIncome)}</strong></div><div><span>Gastos del mes</span><strong>{formatEuro(account.monthExpenses)}</strong></div><div><span>Neto del mes</span><strong className={account.monthNet<0?"negative":"positive"}>{formatEuro(account.monthNet)}</strong></div></div>
      <div className="account-overview-footer"><small>{account.movements.toLocaleString("es-ES")} movimientos registrados</small><div className="decision-actions"><Link className="secondary-action button-link" href={`/cuentas/${account.id}`}>Ver detalle</Link><Link className="text-button button-link" href={`/movimientos?account=${encodeURIComponent(account.id)}`}>Movimientos</Link></div></div>
      <details className="account-sources decision-disclosure"><summary>Origen y reglas <span className="status-badge muted">{account.sources.length} {account.sources.length===1?"producto":"productos"}</span></summary><div className="decision-disclosure-body account-source-tags">{account.sources.map(source=><span key={source.identifier} className={source.primary?"source-primary":"source-linked"}>{source.primary?"Principal":"Vinculada"}: {source.identifier}</span>)}{!account.cashFlowEnabled&&<span className="source-rule">Excluida del Cash Flow</span>}</div></details>
    </article>)}</div>
  </section></main>;
}
