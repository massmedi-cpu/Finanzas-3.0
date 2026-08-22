import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getAccountsOverview } from "@/lib/financial/accounts";
import { AppSidebar } from "@/components/app-sidebar";
import { BalanceChart } from "@/components/balance-chart";

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const date = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  await requireAuthorizedUser();
  const data = await getAccountsOverview();
  return <main className="app-shell">
    <AppSidebar active="/cuentas" status="2 cuentas reales · fuentes consolidadas" />
    <section id="main-content" tabIndex={-1} className="workspace accounts-workspace">
      <header className="topbar"><div><p className="eyebrow">CUENTAS · {data.version}</p><h1>Cuentas</h1><p>Saldos actuales, actividad y evolución de cada producto financiero.</p></div><Link className="ghost button-link" href="/">Volver al inicio</Link></header>

      <section className="accounts-total" aria-label="Patrimonio financiero disponible">
        <div><span>Total disponible</span><strong>{money.format(data.totalAvailable)}</strong></div>
        <p>{data.accounts.length} cuentas activas · saldos obtenidos del último movimiento con saldo de cada cuenta real.</p>
      </section>

      <div className="accounts-list">
        {data.accounts.map(account => <article className={`account-overview ${account.role === "operating" ? "operating" : "savings"}`} key={account.id}>
          <div className="account-overview-head">
            <div><p className="eyebrow">{account.role === "operating" ? "OPERATIVA" : "AHORRO"}</p><h2>{account.name}</h2><span>{account.institution || "Openbank"} · {account.identifier}</span></div>
            <div className="account-balance"><small>Saldo actual</small><strong>{account.balance == null ? "—" : money.format(account.balance)}</strong><span>{account.balanceDate ? `Actualizado ${date.format(new Date(account.balanceDate + "T12:00:00"))}` : "Sin fecha de saldo"}</span></div>
          </div>

          <BalanceChart points={account.balanceSeries} compact />

          <div className="account-stats">
            <div><span>Ingresos del mes</span><strong>{money.format(account.monthIncome)}</strong></div>
            <div><span>Gastos del mes</span><strong>{money.format(account.monthExpenses)}</strong></div>
            <div><span>Neto del mes</span><strong className={account.monthNet < 0 ? "negative" : "positive"}>{money.format(account.monthNet)}</strong></div>
            <div><span>Movimientos</span><strong>{account.movements.toLocaleString("es-ES")}</strong></div>
          </div>

          <div className="account-sources">
            {account.sources.map(source => <span key={source.identifier} className={source.primary ? "source-primary" : "source-linked"}>{source.primary ? "Cuenta" : "Vinculada"}: {source.identifier}</span>)}
            {!account.cashFlowEnabled && <span className="source-rule">Excluida del Cash Flow</span>}
          </div>

          <div className="account-actions"><Link href={`/cuentas/${account.id}`}>Ver detalle de la cuenta →</Link></div>
        </article>)}
      </div>

      <aside className="account-rule-note"><strong>Tarjeta ·8403</strong><p>Sus 133 movimientos están consolidados dentro de la cuenta corriente ·3967. No se presenta como una cuenta independiente y no altera la fuente utilizada para calcular el saldo de la cuenta corriente.</p></aside>
    </section>
  </main>;
}
