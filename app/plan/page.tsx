import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getFinancialPlan, type PlanStatus } from "@/lib/financial/plan";

export const dynamic="force-dynamic";
const MONTH_RE=/^\d{4}-\d{2}$/;
const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});
const number=new Intl.NumberFormat("es-ES");
const date=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});

function signed(value:number){return `${value>0?"+":""}${money.format(value)}`}
function formatDate(value:string|null){return value?date.format(new Date(`${value.slice(0,10)}T12:00:00`)):"—"}
function statusCopy(status:PlanStatus){
  if(status==="critical")return{eyebrow:"PRIORIDAD CRÍTICA",title:"Tu plan necesita intervención",detail:"Hay una o más condiciones que pueden distorsionar los cálculos o comprometer el saldo previsto."};
  if(status==="attention")return{eyebrow:"REQUIERE ATENCIÓN",title:"Tu plan tiene ajustes pendientes",detail:"No hay una emergencia global, pero sí acciones concretas que conviene resolver para mantener el plan alineado."};
  return{eyebrow:"PLAN ESTABLE",title:"Tu plan está alineado",detail:"No se detectan prioridades críticas o relevantes con las reglas y datos disponibles."};
}

export default async function PlanPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const requested=MONTH_RE.test(params.month||"")?params.month!:null;
  const plan=await getFinancialPlan(requested);
  const copy=statusCopy(plan.status);
  const s=plan.summary;const d=plan.domains;const goals=d.goals.summary;const budgetProjection=s.budgetProjectedDifference;
  const budgetPercent=s.budgetAssigned>0?Math.min(100,Math.max(0,(s.budgetSpent/s.budgetAssigned)*100)):0;
  const capacityPercent=s.goalCapacityReference>0?Math.min(100,Math.max(0,(s.goalMonthlyRequired/s.goalCapacityReference)*100)):0;
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace plan-workspace">
    <header className="topbar plan-topbar"><div><p className="eyebrow">PLAN FINANCIERO · {plan.version}</p><h1>Control y planificación en una sola vista</h1><p>Una lectura única de presupuesto, previsión, objetivos, patrimonio y Control. Cada recomendación enlaza con el dato que la origina.</p></div><form className="plan-month" method="get" action="/plan"><label htmlFor="plan-month">Mes del plan</label><div><input id="plan-month" name="month" type="month" defaultValue={plan.month}/><button className="ghost" type="submit">Aplicar</button></div></form></header>

    <section className={`plan-status ${plan.status}`} aria-labelledby="plan-status-title"><div><p className="eyebrow">{copy.eyebrow}</p><h2 id="plan-status-title">{copy.title}</h2><p>{copy.detail}</p></div><div className="plan-status-count"><strong>{number.format(plan.actionSummary.total)}</strong><span>prioridades activas</span><small>{plan.actionSummary.critical} críticas · {plan.actionSummary.high} altas · {plan.actionSummary.medium} medias</small></div></section>

    <section className="plan-kpis" aria-label="Magnitudes principales del plan">
      <article><span>Resultado del mes</span><strong className={s.monthlyNet<0?"negative":"positive"}>{signed(s.monthlyNet)}</strong><small>{money.format(s.monthlyIncome)} ingresos · {money.format(s.monthlyExpenses)} gastos</small><Link href={`/cash-flow?from=${plan.month}-01`}>Ver Cash Flow →</Link></article>
      <article><span>Presupuesto proyectado</span><strong className={budgetProjection!=null&&budgetProjection<0?"negative":""}>{budgetProjection==null?"Sin límite":signed(budgetProjection)}</strong><small>{money.format(s.budgetSpent)} gastados de {money.format(s.budgetAssigned)} asignados</small><Link href="/presupuesto">Abrir presupuesto →</Link></article>
      <article><span>Saldo previsto · 90 días</span><strong className={s.forecastProjectedBalance90<0?"negative":""}>{money.format(s.forecastProjectedBalance90)}</strong><small>Mínimo previsto {money.format(s.forecastLowestBalance90)} · flujo {signed(s.forecastProjectedNet90)}</small><Link href="/prevision">Abrir previsión →</Link></article>
      <article><span>Patrimonio</span><strong>{money.format(s.netWorth)}</strong><small>Proyección 90 días {money.format(s.projectedNetWorth90)}</small><Link href="/patrimonio">Abrir patrimonio →</Link></article>
    </section>

    <section className="plan-capacity panel" aria-labelledby="capacity-title"><div className="panel-head"><div><p className="eyebrow">CAPACIDAD PARA OBJETIVOS</p><h2 id="capacity-title">Qué esfuerzo mensual exige tu plan</h2></div><Link className="pill pill-link" href="/objetivos">Gestionar objetivos</Link></div><div className="plan-capacity-grid"><div><span>Capacidad de referencia</span><strong>{money.format(s.goalCapacityReference)}<small>/mes</small></strong><p>Media del Cash Flow de los tres meses completos anteriores.</p></div><div><span>Requerido por objetivos</span><strong>{money.format(s.goalMonthlyRequired)}<small>/mes</small></strong><p>{goals.activeCount} objetivos activos · {goals.attentionCount} requieren atención.</p></div><div><span>Margen después de objetivos</span><strong className={s.capacityAfterGoals<0?"negative":"positive"}>{signed(s.capacityAfterGoals)}<small>/mes</small></strong><p>No modifica presupuesto ni previsiones: es una referencia de capacidad.</p></div></div><div className="plan-capacity-bar" aria-label={`${Math.round(capacityPercent)}% de la capacidad mensual comprometida por objetivos`}><i style={{width:`${capacityPercent}%`}}/></div></section>

    <div className="plan-main-grid"><section className="panel plan-actions" aria-labelledby="actions-title"><div className="panel-head"><div><p className="eyebrow">SIGUIENTES ACCIONES</p><h2 id="actions-title">Prioridades explicables</h2></div><span className="pill">{plan.actions.length} activas</span></div>{plan.actions.length?<ol>{plan.actions.map(action=><li key={action.key} className={`severity-${action.severity}`}><div className="plan-action-rank" aria-hidden="true"/><div><div className="plan-action-title"><span>{action.domain}</span><strong>{action.title}</strong></div><p>{action.detail}</p><small>Origen: {action.sourcePath}{action.date?` · ${formatDate(action.date)}`:""}</small></div><Link className="ghost button-link" href={action.href}>Resolver</Link></li>)}</ol>:<div className="plan-empty"><strong>No hay prioridades activas.</strong><span>El plan no detecta bloqueos ni avisos relevantes con los datos actuales.</span></div>}</section>

      <section className="panel plan-integrity" aria-labelledby="integrity-title"><div className="panel-head"><div><p className="eyebrow">CONFIANZA DEL PLAN</p><h2 id="integrity-title">Calidad antes que automatismo</h2></div></div><dl><div><dt>Cierre mensual</dt><dd>{d.control.snapshot.closeReady?"Listo":"Pendiente"}</dd></div><div><dt>Duplicados</dt><dd>{d.control.snapshot.duplicates}</dd></div><div><dt>Por revisar</dt><dd>{d.control.snapshot.needsReview}</dd></div><div><dt>Conciliación pendiente</dt><dd>{d.control.snapshot.unreconciled}</dd></div><div><dt>Cobertura patrimonio</dt><dd>{d.netWorth.coverage.knownAccounts}/{d.netWorth.coverage.accountCount}</dd></div><div><dt>Sugerencias automáticas en previsión</dt><dd>{plan.rules.forecastSuggestionsAffectProjection?"Incluidas":"No alteran el saldo"}</dd></div></dl><Link className="plan-control-link" href={d.control.href}>Abrir Centro de Control →</Link></section></div>

    <section className="plan-domains" aria-labelledby="domains-title"><div className="plan-section-head"><div><p className="eyebrow">LAS CINCO FUENTES DEL PLAN</p><h2 id="domains-title">Detalle por dominio</h2></div><p>El Plan resume; cada módulo sigue siendo la fuente operativa de su área.</p></div><div className="plan-domain-grid">
      <Link href={d.budget.href}><span>Presupuesto</span><strong>{money.format(d.budget.available)}</strong><small>disponible · {d.budget.overBudgetCount} excedidos</small><progress max={100} value={budgetPercent}/><em>{Math.round(budgetPercent)}% consumido</em></Link>
      <Link href={d.forecast.href}><span>Previsión</span><strong>{money.format(d.forecast.lowestBalance)}</strong><small>saldo mínimo en 90 días</small><em>{d.forecast.eventCount} confirmados · {d.forecast.suggestionCount} sugerencias</em></Link>
      <Link href={d.goals.href}><span>Objetivos</span><strong>{money.format(goals.remainingTotal)}</strong><small>pendiente total · {goals.activeCount} activos</small><em>{goals.achievedCount} alcanzados · {goals.overdueCount} vencidos</em></Link>
      <Link href={d.netWorth.href}><span>Patrimonio</span><strong>{money.format(d.netWorth.netWorth)}</strong><small>{money.format(d.netWorth.assets)} activos · {money.format(d.netWorth.liabilities)} pasivos</small><em>{d.netWorth.coverage.currentComplete?"Cobertura completa":"Cobertura incompleta"}</em></Link>
      <Link href={d.control.href}><span>Control</span><strong>{d.control.visibleAlertCount}</strong><small>alertas visibles · {d.control.snapshot.closeBlockers} bloqueos</small><em>{d.control.snapshot.closeReady?"Mes listo para cerrar":"Revisión pendiente"}</em></Link>
    </div></section>

    <details className="plan-method"><summary>Cómo se construye este plan</summary><p>Es una capa de decisión de solo lectura. No cambia movimientos, presupuestos, previsiones, objetivos ni patrimonio. Reutiliza las reglas canónicas ya validadas de cada módulo y las reúne en una sola respuesta.</p><ul>{plan.rules.sourceFunctions.map(source=><li key={source}><code>{source}</code></li>)}</ul><p>Las sugerencias automáticas de previsión siguen sin alterar el saldo proyectado hasta que se confirman.</p></details>
  </section></main>;
}
