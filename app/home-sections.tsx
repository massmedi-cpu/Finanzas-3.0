import { formatEuro, formatInteger, formatPercent } from "@/lib/format/es-es";
import { IntentLink } from "@/components/intent-link";
import { CashFlowChart } from "@/components/cash-flow-chart";
import { movementState,movementUrl } from "@/lib/financial/movement-query";
import type { AccountsOverview } from "@/lib/financial/accounts";
import type { BudgetMonth } from "@/lib/financial/budget";
import type { ForecastOverview } from "@/lib/financial/forecast";
import type { AnalysisOverview } from "@/lib/financial/analysis";
import type { ReconciliationSummary } from "@/lib/financial/reconciliation";
import type { HomeControlSummary } from "@/lib/financial/home-streaming";
import type { CashFlowPoint } from "@/lib/financial/cash-flow";

const date=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
function fmtDate(value:string|null|undefined){return value?date.format(new Date(`${value.slice(0,10)}T12:00:00`)):"—"}
function variation(series:{balance:number|null}[]){const values=series.map(x=>x.balance).filter((x):x is number=>x!=null&&Number.isFinite(x));return values.length>=2?values.at(-1)!-values.at(-2)!:null}
function signed(value:number){return `${value>0?"+":""}${formatEuro(value)}`}

export function HomeAccountsFallback(){
  return <section className="home-accounts-section home-stream-loading" aria-busy="true" aria-label="Cargando cuentas">
    <div className="home-section-heading compact"><div><p className="eyebrow">CUENTAS</p><h2>Disponibilidad por cuenta</h2><p>Preparando saldos y variación reciente.</p></div></div>
    <div className="home-stream-lines" aria-hidden="true"><i/><i/><i/></div>
  </section>;
}

export async function HomeAccountsSection({data}:{data:Promise<AccountsOverview>}){
  const accounts=await data;
  return <section className="home-accounts-section" aria-labelledby="home-accounts-title"><div className="home-section-heading compact"><div><p className="eyebrow">CUENTAS</p><h2 id="home-accounts-title">Disponibilidad por cuenta</h2><p>Consulta cada cuenta por separado; el saldo total queda reservado para Patrimonio.</p></div><IntentLink href="/cuentas">Ver cuentas →</IntentLink></div><div className="home-account-ledger" aria-label="Cuentas">{accounts.accounts.map(account=>{const change=variation(account.balanceSeries||[]);return <IntentLink key={account.id} href={`/cuentas/${account.id}`} className="home-account-row"><div><strong>{account.name}</strong><small>{account.identifier} · {account.role==="operating"?"Operativa":"Ahorro"}</small></div><div className="home-account-balance"><strong>{account.balance==null?"—":formatEuro(account.balance)}</strong><small>{change==null?"Variación reciente no disponible":`${signed(change)} vs. mes anterior`}</small></div></IntentLink>})}</div></section>;
}

export function HomePulseSecondaryFallback(){
  return <><div className="home-stream-pulse-placeholder" aria-hidden="true"><span>Conciliación</span><strong>—</strong><small>Calculando…</small></div><div className="home-stream-pulse-placeholder" aria-hidden="true"><span>Alertas</span><strong>—</strong><small>Calculando…</small></div></>;
}

export async function HomePulseSecondary({reconciliation,control}:{reconciliation:Promise<ReconciliationSummary>;control:Promise<HomeControlSummary>}){
  const [r,c]=await Promise.all([reconciliation,control]);
  const open=r.pending+r.notReconciled;
  const alerts=c.visibleAlerts+c.hiddenAlerts;
  return <><IntentLink href="/movimientos/conciliacion"><span>Conciliación</span><strong>{formatInteger(open)}</strong><small>{r.reconciled} conciliados</small></IntentLink><IntentLink href="/control"><span>Alertas</span><strong>{formatInteger(alerts)}</strong><small>{c.closeReady?"mes listo para cierre":`${c.closeBlockers} bloqueos · ${c.closeWarnings} avisos`}</small></IntentLink></>;
}

export function HomeFlowFallback(){
  return <section className="home-flow-section home-stream-loading" aria-busy="true" aria-label="Cargando evolución financiera"><div className="home-section-heading"><div><p className="eyebrow">EVOLUCIÓN</p><h2>Cómo se está moviendo tu dinero</h2><p>Preparando la evolución del año y el presupuesto del mes.</p></div></div><div className="home-stream-chart" aria-hidden="true"/></section>;
}

export async function HomeFlowSection({analysis,budget}:{analysis:Promise<AnalysisOverview>;budget:Promise<BudgetMonth>}){
  const [a,b]=await Promise.all([analysis,budget]);
  const year=a.year||new Date().getFullYear();
  let accumulated=0;
  const cashFlowPoints:CashFlowPoint[]=a.monthly.filter(m=>m.available).map(m=>{accumulated+=m.net;return{date:`${m.month}-01`,label:m.month,income:m.income,expenses:m.expenses,net:m.net,accumulated,movements:0}});
  const budgetRate=b.assigned>0?Math.min(150,(b.spent/b.assigned)*100):0;
  return <section className="home-flow-section" aria-labelledby="home-flow-title"><div className="home-section-heading"><div><p className="eyebrow">EVOLUCIÓN {year}</p><h2 id="home-flow-title">Cómo se está moviendo tu dinero</h2><p>Ingresos, gastos y acumulado en el mismo contexto temporal.</p></div><IntentLink href="/cash-flow">Abrir Cash Flow →</IntentLink></div><div className="home-flow-layout"><div className="home-chart-area">{cashFlowPoints.length?<CashFlowChart points={cashFlowPoints} drilldown={{bucket:"month",dateFrom:a.periodStart,dateTo:a.periodEnd,account:"",type:"",category:"",subcategory:"",merchant:""}}/>:<div className="home-empty">No hay evolución disponible.</div>}</div><aside className="home-budget-context" aria-label={`Presupuesto ${b.month}`}><p className="eyebrow">PRESUPUESTO · {b.month}</p><h3>Control del mes</h3>{b.assigned>0?<><dl><div><dt>Asignado</dt><dd>{formatEuro(b.assigned)}</dd></div><div><dt>Gastado</dt><dd>{formatEuro(b.spent)}</dd></div><div><dt>Disponible</dt><dd className={b.available<0?"negative":"positive"}>{formatEuro(b.available)}</dd></div></dl><div className="home-budget-bar" aria-label={`${Math.round(budgetRate)}% del presupuesto consumido`}><i style={{width:`${Math.min(100,budgetRate)}%`}}/></div><p>{Math.round(budgetRate)}% consumido · {b.overBudgetCount} presupuestos excedidos.</p></>:<div className="home-empty compact"><strong>Aún no hay presupuestos asignados.</strong><span>El gasto real del mes es {formatEuro(b.spent)} y hay {formatEuro(b.unbudgetedSpent)} sin presupuesto.</span></div>}<IntentLink href="/presupuesto">Revisar presupuesto →</IntentLink></aside></div></section>;
}

export function HomeForecastFallback(){
  return <section className="home-forecast-section home-stream-loading" aria-busy="true" aria-label="Cargando previsión"><div className="home-section-heading"><div><p className="eyebrow">PRÓXIMOS 30 DÍAS</p><h2>Lo que viene</h2><p>Calculando movimientos esperados y saldo previsto.</p></div></div><div className="home-stream-lines short" aria-hidden="true"><i/><i/></div></section>;
}

export async function HomeForecastSection({data}:{data:Promise<ForecastOverview>}){
  const forecast=await data;
  const upcoming=forecast.events.slice(0,4);
  const suggestions=forecast.suggestions.slice(0,4);
  return <section className="home-forecast-section" aria-labelledby="home-forecast-title"><div className="home-section-heading"><div><p className="eyebrow">PRÓXIMOS 30 DÍAS</p><h2 id="home-forecast-title">Lo que viene</h2><p>Previsión basada en movimientos confirmados y patrones fiables.</p></div><IntentLink href="/prevision">Simular escenarios →</IntentLink></div><div className="home-forecast-line"><div><span>Saldo previsto</span><strong>{formatEuro(forecast.projectedBalance)}</strong></div><div><span>Saldo mínimo</span><strong className={forecast.lowestBalance<0?"negative":""}>{formatEuro(forecast.lowestBalance)}</strong></div></div>{upcoming.length?<div className="home-upcoming">{upcoming.map(event=><div key={event.id}><span>{fmtDate(event.date)}</span><strong>{event.title}</strong><b className={event.amount<0?"negative":"positive"}>{formatEuro(event.amount)}</b></div>)}</div>:suggestions.length?<><p className="home-section-note">Patrones detectados que aún no afectan al saldo:</p><div className="home-upcoming suggestions">{suggestions.map(item=><div key={item.id}><span>{fmtDate(item.nextDate)}</span><strong>{item.title} · {Math.round(item.confidence*100)}%</strong><b className={item.amount<0?"negative":"positive"}>{formatEuro(item.amount)}</b></div>)}</div></>:<div className="home-empty compact">Sin próximos movimientos confirmados ni patrones fiables.</div>}</section>;
}

export function HomeDecisionFallback(){
  return <section className="home-decision-grid home-stream-loading" aria-busy="true" aria-label="Cargando decisiones"><div className="home-stream-chart" aria-hidden="true"/><div className="home-stream-lines" aria-hidden="true"><i/><i/><i/><i/></div></section>;
}

export async function HomeDecisionGrid({analysis,budget,reconciliation,control}:{analysis:Promise<AnalysisOverview>;budget:Promise<BudgetMonth>;reconciliation:Promise<ReconciliationSummary>;control:Promise<HomeControlSummary>}){
  const [a,b,r,c]=await Promise.all([analysis,budget,reconciliation,control]);
  const year=a.year||new Date().getFullYear();
  const open=r.pending+r.notReconciled;
  const alertCount=c.visibleAlerts+c.hiddenAlerts;
  return <section className="home-decision-grid"><div className="home-spend-section"><div className="home-section-heading compact"><div><p className="eyebrow">GASTO {year}</p><h2>En qué se concentra</h2></div><IntentLink href="/analisis">Analizar →</IntentLink></div>{a.categories.length?<div className="home-category-list">{a.categories.slice(0,6).map(item=><IntentLink key={item.category} href={movementUrl(movementState({category:item.category,from:a.periodStart,to:a.periodEnd,cashFlowOnly:true}))}><div><strong>{item.category}</strong><small>{formatPercent(item.share,1)} · {formatInteger(item.movements)} mov.</small></div><b>{formatEuro(item.amount)}</b><i><span style={{width:`${Math.min(100,item.share)}%`}}/></i></IntentLink>)}</div>:<div className="home-empty">No hay categorías disponibles.</div>}</div><div className="home-attention-section"><div className="home-section-heading compact"><div><p className="eyebrow">CONTROL</p><h2>Qué necesita atención</h2></div><IntentLink href="/control">{formatInteger(alertCount)} alertas →</IntentLink></div><div className="home-attention-list"><IntentLink href="/movimientos?review=1"><span>Movimientos por revisar</span><strong>{c.closeBlockers}</strong></IntentLink><IntentLink href="/movimientos/conciliacion"><span>Conciliación pendiente / no conciliada</span><strong>{open}</strong></IntentLink><IntentLink href="/analisis"><span>Sin categoría</span><strong>{a.uncategorizedCount}</strong></IntentLink><IntentLink href="/presupuesto"><span>Presupuestos excedidos</span><strong>{b.overBudgetCount}</strong></IntentLink></div></div></section>;
}
