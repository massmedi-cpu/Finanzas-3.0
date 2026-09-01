import { formatEuro, formatInteger } from "@/lib/format/es-es";
import { madridMonth } from "@/lib/time/madrid";
import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getFinancialPlan, type PlanStatus } from "@/lib/financial/plan";
import { getAnalysisOverview } from "@/lib/financial/analysis";
import { buildAnalysisInsights } from "@/lib/financial/analysis-insights";
import { buildDecisionIntelligence } from "@/lib/financial/intelligence";
import { PlanIntelligence } from "@/components/plan-intelligence";

export const dynamic="force-dynamic";
const MONTH_RE=/^\d{4}-\d{2}$/;
const date=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});

function signed(value:number){return `${value>0?"+":""}${formatEuro(value)}`}
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
  const currentMonth=madridMonth();
  const useCurrentAnalytics=requested==null||requested===currentMonth;
  const [plan,analysis]=useCurrentAnalytics
    ?await Promise.all([getFinancialPlan(requested),getAnalysisOverview(Number(currentMonth.slice(0,4)))])
    :[await getFinancialPlan(requested),null];
  const intelligence=buildDecisionIntelligence(plan,analysis?buildAnalysisInsights(analysis):null);
  const copy=statusCopy(plan.status);
  const s=plan.summary;
  const d=plan.domains;
  const goals=d.goals.summary;
  const budgetProjection=s.budgetProjectedDifference;
  const capacityPercent=s.goalCapacityReference>0?Math.min(100,Math.max(0,(s.goalMonthlyRequired/s.goalCapacityReference)*100)):0;

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace plan-workspace">
    <header className="topbar plan-topbar"><div><p className="eyebrow">PLAN FINANCIERO · {plan.version}</p><h1>Qué necesita tu dinero ahora</h1><p>Resultado, liquidez, objetivos y prioridades en una sola lectura. Entra en cada módulo solo cuando haya algo que revisar o decidir.</p></div><form className="plan-month" method="get" action="/plan"><label htmlFor="plan-month">Mes del plan</label><div><input id="plan-month" name="month" type="month" defaultValue={plan.month}/><button className="ghost" type="submit">Aplicar</button></div></form></header>

    <section className={`plan-status ${plan.status}`} aria-labelledby="plan-status-title"><div><p className="eyebrow">{copy.eyebrow}</p><h2 id="plan-status-title">{copy.title}</h2><p>{copy.detail}</p></div><div className="plan-status-count"><strong>{formatInteger(plan.actionSummary.total)}</strong><span>prioridades activas</span><small>{formatInteger(plan.actionSummary.critical)} críticas · {formatInteger(plan.actionSummary.high)} altas · {formatInteger(plan.actionSummary.medium)} medias</small></div></section>

    <PlanIntelligence data={intelligence}/>

    <section className="plan-kpis" aria-label="Magnitudes principales del plan">
      <article><span>Resultado del mes</span><strong className={s.monthlyNet<0?"negative":"positive"}>{signed(s.monthlyNet)}</strong><small>{formatEuro(s.monthlyIncome)} ingresos · {formatEuro(s.monthlyExpenses)} gastos</small><Link href={`/cash-flow?from=${plan.month}-01`}>Ver Cash Flow →</Link></article>
      <article><span>Presupuesto proyectado</span><strong className={budgetProjection!=null&&budgetProjection<0?"negative":""}>{budgetProjection==null?"Sin límite":signed(budgetProjection)}</strong><small>{formatEuro(s.budgetSpent)} gastados de {formatEuro(s.budgetAssigned)} asignados</small><Link href="/presupuesto">Abrir presupuesto →</Link></article>
      <article><span>Saldo previsto · 90 días</span><strong className={s.forecastProjectedBalance90<0?"negative":""}>{formatEuro(s.forecastProjectedBalance90)}</strong><small>Mínimo previsto {formatEuro(s.forecastLowestBalance90)} · flujo {signed(s.forecastProjectedNet90)}</small><Link href="/prevision">Abrir previsión →</Link></article>
      <article><span>Patrimonio</span><strong>{formatEuro(s.netWorth)}</strong><small>Proyección 90 días {formatEuro(s.projectedNetWorth90)}</small><Link href="/patrimonio">Abrir patrimonio →</Link></article>
    </section>

    <section className="plan-capacity panel" aria-labelledby="capacity-title"><div className="panel-head"><div><p className="eyebrow">CAPACIDAD PARA OBJETIVOS</p><h2 id="capacity-title">Qué esfuerzo mensual exige tu plan</h2></div><Link className="pill pill-link" href="/objetivos">Gestionar objetivos</Link></div><div className="plan-capacity-grid"><div><span>Capacidad de referencia</span><strong>{formatEuro(s.goalCapacityReference)}<small>/mes</small></strong><p>Media del Cash Flow de los tres meses completos anteriores.</p></div><div><span>Requerido por objetivos</span><strong>{formatEuro(s.goalMonthlyRequired)}<small>/mes</small></strong><p>{formatInteger(goals.activeCount)} objetivos activos · {formatInteger(goals.attentionCount)} requieren atención.</p></div><div><span>Margen después de objetivos</span><strong className={s.capacityAfterGoals<0?"negative":"positive"}>{signed(s.capacityAfterGoals)}<small>/mes</small></strong><p>Referencia de capacidad; no modifica presupuesto ni previsiones.</p></div></div><div className="plan-capacity-bar" aria-label={`${Math.round(capacityPercent)}% de la capacidad mensual comprometida por objetivos`}><i style={{width:`${capacityPercent}%`}}/></div></section>

    <div className="plan-main-grid"><section className="panel plan-actions" aria-labelledby="actions-title"><div className="panel-head"><div><p className="eyebrow">SIGUIENTES ACCIONES</p><h2 id="actions-title">Qué conviene resolver</h2></div><span className="pill">{formatInteger(plan.actions.length)} activas</span></div>{plan.actions.length?<ol>{plan.actions.map(action=><li key={action.key} className={`severity-${action.severity}`}><div className="plan-action-rank" aria-hidden="true"/><div><div className="plan-action-title"><span>{action.domain}</span><strong>{action.title}</strong></div><p>{action.detail}</p><small>{action.date?`Dato de ${formatDate(action.date)}`:"Basado en los datos actuales del módulo"}</small></div><Link className="ghost button-link" href={action.href}>Resolver</Link></li>)}</ol>:<div className="empty-state"><strong>No hay prioridades activas.</strong><span>El plan no detecta bloqueos ni avisos relevantes con los datos actuales.</span></div>}</section>

      <section className="panel plan-integrity" aria-labelledby="integrity-title"><div className="panel-head"><div><p className="eyebrow">CONFIANZA DEL PLAN</p><h2 id="integrity-title">¿Se puede confiar en esta lectura?</h2></div></div><dl><div><dt>Cierre mensual</dt><dd>{d.control.snapshot.closeReady?"Listo":"Pendiente"}</dd></div><div><dt>Duplicados</dt><dd>{formatInteger(d.control.snapshot.duplicates)}</dd></div><div><dt>Por revisar</dt><dd>{formatInteger(d.control.snapshot.needsReview)}</dd></div><div><dt>Conciliación pendiente</dt><dd>{formatInteger(d.control.snapshot.unreconciled)}</dd></div><div><dt>Cobertura patrimonio</dt><dd>{formatInteger(d.netWorth.coverage.knownAccounts)}/{formatInteger(d.netWorth.coverage.accountCount)}</dd></div><div><dt>Sugerencias de previsión</dt><dd>{plan.rules.forecastSuggestionsAffectProjection?"Incluidas":"No alteran el saldo"}</dd></div></dl><Link className="plan-control-link" href={d.control.href}>Abrir Centro de Control →</Link></section></div>

    <details className="decision-disclosure plan-explainability"><summary>Cómo llega Financial App a esta lectura</summary><div className="decision-disclosure-body"><p>El Plan es de solo lectura: reúne Presupuesto, Previsión, Objetivos, Patrimonio y Control sin modificar ninguno de ellos.</p><ul><li>El resultado y la capacidad proceden de cálculos financieros ya validados por cada módulo.</li><li>En el mes actual, la lectura inteligente puede añadir contexto de meses completos anteriores; no inventa datos futuros.</li><li>Las sugerencias automáticas de Previsión no alteran el saldo hasta que se confirman.</li><li>Las prioridades enlazan siempre con el módulo en el que se puede revisar o resolver su causa.</li></ul></div></details>
  </section></main>;
}
