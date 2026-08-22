import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getFinancialDashboard } from "@/lib/financial/dashboard";
import { getAccountsOverview } from "@/lib/financial/accounts";
import { getBudgetMonth } from "@/lib/financial/budget";
import { getForecastOverview } from "@/lib/financial/forecast";
import { getAnalysisOverview } from "@/lib/financial/analysis";
import { getReconciliationOverview } from "@/lib/financial/reconciliation";
import { SyncButton } from "@/components/sync-button";
import { AppSidebar } from "@/components/app-sidebar";
import { CashFlowChart } from "@/components/cash-flow-chart";
import type { CashFlowPoint } from "@/lib/financial/cash-flow";

const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});
const number=new Intl.NumberFormat("es-ES");
const date=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
export const dynamic="force-dynamic";

function settled<T>(result:PromiseSettledResult<T>):T|null{return result.status==="fulfilled"?result.value:null;}
function fmtDate(value:string|null|undefined){return value?date.format(new Date(`${value.slice(0,10)}T12:00:00`)):"—";}
function variation(series:{balance:number|null}[]){const values=series.map(x=>x.balance).filter((x):x is number=>x!=null&&Number.isFinite(x));return values.length>=2?values.at(-1)!-values.at(-2)!:null;}
function signed(value:number){return `${value>0?"+":""}${money.format(value)}`;}

export default async function Home(){
  await requireAuthorizedUser();
  const dashboard=await getFinancialDashboard();
  const year=Number(dashboard.month.slice(0,4))||new Date().getFullYear();
  const [accountsResult,budgetResult,forecastResult,analysisResult,reconciliationResult]=await Promise.allSettled([
    getAccountsOverview(),getBudgetMonth(dashboard.month),getForecastOverview(30),getAnalysisOverview(year),getReconciliationOverview(),
  ]);
  const accounts=settled(accountsResult);const budget=settled(budgetResult);const forecast=settled(forecastResult);const analysis=settled(analysisResult);const reconciliation=settled(reconciliationResult);
  const accountCards=(accounts?.accounts||dashboard.accounts.map(a=>({...a,institution:null,productType:null,currency:"EUR",movements:0,firstDate:null,lastDate:null,monthIncome:0,monthExpenses:0,monthNet:0,sources:[],balanceSeries:[]})));
  let accumulated=0;
  const cashFlowPoints:CashFlowPoint[]=analysis?analysis.monthly.filter(m=>m.available).map(m=>{accumulated+=m.net;return{date:`${m.month}-01`,label:m.month,income:m.income,expenses:m.expenses,net:m.net,accumulated,movements:0};}):[];
  const budgetRate=budget&&budget.assigned>0?Math.min(150,(budget.spent/budget.assigned)*100):0;
  const reconciliationOpen=reconciliation?reconciliation.summary.pending+reconciliation.summary.notReconciled:null;
  const alertCount=(dashboard.needsReview||0)+(budget?.overBudgetCount||0)+(analysis?.uncategorizedCount||0)+(reconciliationOpen||0);
  const upcoming=forecast?.events.slice(0,4)||[];
  const suggestions=forecast?.suggestions.slice(0,4)||[];

  return <main className="app-shell"><AppSidebar active="/" status={`Inicio · ${dashboard.version}`}/><section className="workspace home-workspace">
    <header className="topbar home-topbar"><div><p className="eyebrow">INICIO · {dashboard.version}</p><h1>Tu situación financiera</h1><p>Pasado, presente y próximos movimientos en una sola vista.</p></div><div className="home-top-actions"><span>Último movimiento {fmtDate(dashboard.lastMovementDate)}</span><SyncButton/></div></header>

    <section className="home-account-grid" aria-label="Cuentas y patrimonio">
      {accountCards.map(account=>{const change=variation(account.balanceSeries||[]);return <Link key={account.id} className={`home-account-card ${account.role==="operating"?"operating":"savings"}`} href={`/cuentas/${account.id}`}><div className="home-account-title"><div><span>{account.name}</span><small>{account.identifier}</small></div><em>{account.role==="operating"?"Operativa":"Ahorro"}</em></div><strong>{account.balance==null?"—":money.format(account.balance)}</strong><div className="home-account-meta"><span>{change==null?"Variación reciente no disponible":`${signed(change)} vs. mes anterior`}</span><span>{account.balanceDate?`Saldo ${fmtDate(account.balanceDate)}`:""}</span></div>{account.role==="savings"&&<p>Excluida siempre del Cash Flow.</p>}</Link>})}
      <Link className="home-account-card total" href="/patrimonio"><div className="home-account-title"><div><span>Total disponible</span><small>Patrimonio financiero actual</small></div><em>Total</em></div><strong>{money.format(dashboard.totalAvailable)}</strong><div className="home-account-meta"><span>{accountCards.length} cuentas reales</span><span>Abrir patrimonio →</span></div></Link>
    </section>

    <section className="home-kpis" aria-label="Resumen del mes">
      <Link href="/analisis"><span>Ingresos del mes</span><strong className="positive">{money.format(dashboard.income)}</strong><small>Ingresos reales computables</small></Link>
      <Link href="/presupuesto"><span>Gastos del mes</span><strong className="negative">{money.format(dashboard.expenses)}</strong><small>Gasto personal real</small></Link>
      <Link href="/cash-flow"><span>Cash Flow</span><strong className={dashboard.cashFlow<0?"negative":"positive"}>{money.format(dashboard.cashFlow)}</strong><small>Sin ahorro ni traspasos</small></Link>
      <Link href="/movimientos"><span>Pendientes de revisar</span><strong>{number.format(dashboard.needsReview)}</strong><small>{dashboard.reviewSource} por cambios en origen</small></Link>
      <Link href="/movimientos/conciliacion"><span>Conciliación abierta</span><strong>{reconciliationOpen==null?"—":number.format(reconciliationOpen)}</strong><small>{reconciliation?`${reconciliation.summary.reconciled} conciliados`:"Resumen no disponible"}</small></Link>
      <Link href="/analisis"><span>Alertas de calidad</span><strong>{number.format(alertCount)}</strong><small>Revisión, presupuesto, categorías y conciliación</small></Link>
    </section>

    <div className="home-main-grid">
      <article className="panel home-chart-panel"><div className="panel-head"><div><p className="eyebrow">EVOLUCIÓN {year}</p><h2>Ingresos, gastos y Cash Flow</h2></div><Link className="pill pill-link" href="/cash-flow">Abrir Cash Flow</Link></div>{cashFlowPoints.length?<CashFlowChart points={cashFlowPoints}/>:<div className="home-empty">No se pudo cargar la evolución financiera.</div>}</article>

      <article className="panel home-budget-panel"><div className="panel-head"><div><p className="eyebrow">PRESUPUESTO · {dashboard.month}</p><h2>Control del mes</h2></div><Link className="pill pill-link" href="/presupuesto">Abrir</Link></div>{budget?<>{budget.assigned>0?<><div className="home-budget-numbers"><div><span>Asignado</span><strong>{money.format(budget.assigned)}</strong></div><div><span>Gastado</span><strong>{money.format(budget.spent)}</strong></div><div><span>Disponible</span><strong className={budget.available<0?"negative":"positive"}>{money.format(budget.available)}</strong></div></div><div className="home-budget-bar" aria-label={`${Math.round(budgetRate)}% del presupuesto consumido`}><i style={{width:`${Math.min(100,budgetRate)}%`}}/></div><p>{Math.round(budgetRate)}% consumido · {budget.overBudgetCount} presupuestos excedidos.</p></>:<div className="home-empty compact"><strong>Aún no hay presupuestos asignados.</strong><span>El gasto real del mes es {money.format(budget.spent)} y hay {money.format(budget.unbudgetedSpent)} sin presupuesto.</span></div>}</>:<div className="home-empty">Presupuesto no disponible.</div>}</article>
    </div>

    <div className="home-secondary-grid">
      <article className="panel home-forecast-panel"><div className="panel-head"><div><p className="eyebrow">PRÓXIMOS 30 DÍAS</p><h2>Previsión</h2></div><Link className="pill pill-link" href="/prevision">Simular</Link></div>{forecast?<><div className="home-forecast-summary"><div><span>Saldo previsto</span><strong>{money.format(forecast.projectedBalance)}</strong></div><div><span>Saldo mínimo</span><strong className={forecast.lowestBalance<0?"negative":""}>{money.format(forecast.lowestBalance)}</strong></div></div>{upcoming.length?<div className="home-upcoming">{upcoming.map(event=><div key={event.id}><span>{fmtDate(event.date)} · {event.title}</span><strong className={event.amount<0?"negative":"positive"}>{money.format(event.amount)}</strong></div>)}</div>:suggestions.length?<><p className="home-section-note">No hay previsiones confirmadas. Patrones detectados que aún no afectan al saldo:</p><div className="home-upcoming suggestions">{suggestions.map(item=><div key={item.id}><span>{fmtDate(item.nextDate)} · {item.title} · {Math.round(item.confidence*100)}%</span><strong className={item.amount<0?"negative":"positive"}>{money.format(item.amount)}</strong></div>)}</div></>:<div className="home-empty compact">Sin próximos movimientos confirmados ni patrones fiables.</div>}</>:<div className="home-empty">Previsión no disponible.</div>}</article>

      <article className="panel home-categories-panel"><div className="panel-head"><div><p className="eyebrow">GASTO {year}</p><h2>Principales categorías</h2></div><Link className="pill pill-link" href="/analisis">Analizar</Link></div>{analysis?.categories.length?<div className="home-category-list">{analysis.categories.slice(0,6).map(item=><div key={item.category}><div><span>{item.category}</span><small>{item.share.toLocaleString("es-ES",{maximumFractionDigits:1})}% · {item.movements} mov.</small></div><strong>{money.format(item.amount)}</strong><i><b style={{width:`${Math.min(100,item.share)}%`}}/></i></div>)}</div>:<div className="home-empty">No hay categorías disponibles.</div>}</article>

      <article className="panel home-alert-panel"><div className="panel-head"><div><p className="eyebrow">ALERTAS</p><h2>Qué necesita atención</h2></div><span className="pill">{number.format(alertCount)}</span></div><div className="home-alert-list"><Link href="/movimientos"><span>Movimientos por revisar</span><strong>{dashboard.needsReview}</strong></Link><Link href="/movimientos/conciliacion"><span>Conciliación pendiente / no conciliada</span><strong>{reconciliationOpen??"—"}</strong></Link><Link href="/analisis"><span>Sin categoría</span><strong>{analysis?.uncategorizedCount??"—"}</strong></Link><Link href="/presupuesto"><span>Presupuestos excedidos</span><strong>{budget?.overBudgetCount??"—"}</strong></Link><Link href="/movimientos"><span>Detectados en última sincronización</span><strong>{dashboard.sync?.newCount??0}</strong></Link></div>{analysis?.deviations?.length?<div className="home-deviations"><p>Desviaciones frente a la media de 3 meses</p>{analysis.deviations.slice(0,3).map(d=><div key={d.category}><span>{d.category}</span><strong>{d.changePercent==null?"—":`${d.changePercent>0?"+":""}${d.changePercent.toLocaleString("es-ES",{maximumFractionDigits:1})}%`}</strong></div>)}</div>:null}</article>
    </div>

    <footer className="home-freshness"><span>Fuente oficial: Google Drive XLSX · solo lectura.</span><span>Última sincronización {dashboard.sync?.finishedAt?new Date(dashboard.sync.finishedAt).toLocaleString("es-ES"):"pendiente"}.</span></footer>
  </section></main>;
}
