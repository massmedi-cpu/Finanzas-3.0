import { formatEuro, formatNumber } from "@/lib/format/es-es";
import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getFinancialPlan } from "@/lib/financial/plan";
import { buildLongHorizon } from "@/lib/financial/long-horizon";

export const dynamic="force-dynamic";
const MONTH_RE=/^\d{4}-\d{2}$/;


const date=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});

const monthLabel=(months:number)=>months===3?"3 meses":months===6?"6 meses":"12 meses";
const sustainabilityCopy={positive:"Capacidad compatible con objetivos",strained:"Objetivos por encima de la capacidad",no_goals:"Sin objetivos activos"} as const;

export default async function LongHorizonPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const requested=MONTH_RE.test(params.month||"")?params.month!:null;
  const plan=await getFinancialPlan(requested);
  const horizon=buildLongHorizon(plan);
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace plan-workspace horizon-workspace">
    <header className="topbar plan-topbar"><div><p className="eyebrow">PLAN · HORIZONTE 3/6/12</p><h1>Capacidad a largo plazo sin inventar saldo futuro</h1><p>Extiende la referencia de capacidad y el esfuerzo de objetivos. El saldo bancario y el patrimonio siguen limitados a la previsión canónica de 90 días.</p></div><form className="plan-month" method="get" action="/plan/horizonte"><label htmlFor="horizon-month">Mes de referencia</label><div><input id="horizon-month" name="month" type="month" defaultValue={plan.month}/><button className="ghost" type="submit">Aplicar</button></div></form></header>

    <section className={`horizon-status horizon-status-${horizon.sustainability}`}><div><p className="eyebrow">SOSTENIBILIDAD</p><h2>{sustainabilityCopy[horizon.sustainability]}</h2><p>Capacidad de referencia {formatEuro(horizon.monthlyCapacityReference)}/mes · objetivos {formatEuro(horizon.monthlyGoalCommitment)}/mes · margen {formatEuro(horizon.monthlyResidualCapacity)}/mes.</p></div><Link className="ghost button-link" href={`/plan?month=${plan.month}`}>Volver al Plan</Link></section>

    <section className="horizon-points" aria-label="Horizonte lineal de capacidad">{horizon.points.map(point=><article key={point.months}><span>{monthLabel(point.months)}</span><strong className={point.residualCapacity<0?"negative":"positive"}>{formatEuro(point.residualCapacity)}</strong><small>margen lineal tras objetivos</small><dl><div><dt>Capacidad de referencia</dt><dd>{formatEuro(point.capacityReference)}</dd></div><div><dt>Esfuerzo de objetivos</dt><dd>{formatEuro(point.goalCommitment)}</dd></div></dl><p>No es saldo bancario: es capacidad acumulada si la referencia mensual se mantuviera.</p></article>)}</section>

    <div className="horizon-grid">
      <article className="panel horizon-liquidity"><div className="panel-head"><div><p className="eyebrow">LÍMITE DE PREVISIÓN</p><h2>Liquidez · 90 días</h2></div><Link className="pill pill-link" href="/prevision">Abrir Previsión</Link></div><dl><div><dt>Saldo actual</dt><dd>{formatEuro(horizon.liquidityBoundary.currentBalance)}</dd></div><div><dt>Saldo previsto a 90 días</dt><dd className={horizon.liquidityBoundary.projectedBalance90<0?"negative":""}>{formatEuro(horizon.liquidityBoundary.projectedBalance90)}</dd></div><div><dt>Mínimo previsto</dt><dd className={horizon.liquidityBoundary.lowestBalance90<0?"negative":""}>{formatEuro(horizon.liquidityBoundary.lowestBalance90)}</dd></div><div><dt>Primer negativo</dt><dd>{horizon.liquidityBoundary.firstNegativeDate?date.format(new Date(`${horizon.liquidityBoundary.firstNegativeDate}T12:00:00`)):"No detectado"}</dd></div></dl><p className="horizon-note">Financial App no extrapola este saldo a 6 o 12 meses porque los eventos confirmados de Previsión solo tienen cobertura canónica de 90 días.</p></article>

      <article className="panel horizon-goals"><div className="panel-head"><div><p className="eyebrow">OBJETIVOS</p><h2>Esfuerzo pendiente</h2></div><Link className="pill pill-link" href="/objetivos">Gestionar objetivos</Link></div><dl><div><dt>Pendiente total</dt><dd>{formatEuro(horizon.goalRemaining)}</dd></div><div><dt>Ritmo mensual requerido</dt><dd>{formatEuro(horizon.monthlyGoalCommitment)}</dd></div><div><dt>Meses matemáticos al ritmo actual</dt><dd>{horizon.goalFundingMonths==null?"—":formatNumber(horizon.goalFundingMonths,{maximumFractionDigits:1})}</dd></div><div><dt>Margen mensual tras objetivos</dt><dd className={horizon.monthlyResidualCapacity<0?"negative":"positive"}>{formatEuro(horizon.monthlyResidualCapacity)}</dd></div></dl><p className="horizon-note">Los meses matemáticos no sustituyen las fechas objetivo individuales: solo relacionan pendiente total y esfuerzo mensual requerido.</p></article>
    </div>

    <article className="panel horizon-method"><div className="panel-head"><div><p className="eyebrow">MÉTODO</p><h2>Qué puede y qué no puede decir este horizonte</h2></div></div><div className="horizon-method-grid"><div><strong>Capacidad</strong><p>Parte de <code>{horizon.method.capacityReference||"referencia canónica"}</code>, la misma base que usa el Plan para medir esfuerzo de objetivos.</p></div><div><strong>3/6/12 meses</strong><p>Multiplica capacidad y compromiso mensual de forma lineal. Sirve para dimensionar esfuerzo, no para predecir movimientos bancarios futuros.</p></div><div><strong>Liquidez y patrimonio</strong><p>Se mantienen en 90 días. No se crea una cifra de saldo o patrimonio a 12 meses sin eventos y datos que la sostengan.</p></div></div></article>
  </section></main>;
}
