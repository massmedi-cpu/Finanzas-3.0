import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { formatEuro, formatInteger } from "@/lib/format/es-es";
import { getActionableIntelligence } from "@/lib/financial/actionable-intelligence";
import { IntelligenceClient } from "./intelligence-client";

export const dynamic="force-dynamic";

export default async function IntelligencePage(){
  await requireAuthorizedUser();
  const data=await getActionableIntelligence(400);
  const activeSignals=data.summary.anomalies+data.summary.recurring+data.summary.rising;
  const recurringMonthly=data.recurring.reduce((total,item)=>total+item.monthlyAmount,0);

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace intelligence-workspace">
    <header className="topbar"><div><p className="eyebrow">INTELIGENCIA · {data.version}</p><h1>Qué merece tu atención en el gasto</h1><p>Prioriza anomalías, recurrencias, tendencias y oportunidades con evidencia. Las acciones nunca modifican movimientos ni aplican ahorros automáticamente.</p></div><div className="decision-actions"><Link className="ghost button-link" href="/plan">Volver al Plan</Link><Link className="text-button button-link" href="/plan/horizonte">Horizonte 3/6/12</Link></div></header>

    <section className="intelligence-summary decision-summary" aria-label="Resumen de inteligencia financiera">
      <article className="decision-metric is-primary"><span>Señales activas</span><strong>{formatInteger(activeSignals)}</strong><small>{formatInteger(data.summary.anomalies)} anomalías · {formatInteger(data.summary.recurring)} recurrencias · {formatInteger(data.summary.rising)} tendencias</small></article>
      <article className="decision-metric"><span>Gasto recurrente detectado</span><strong>{formatEuro(recurringMonthly)}<small>/mes</small></strong><small>{formatInteger(data.summary.recurring)} patrones con evidencia suficiente</small></article>
      <article className="decision-metric is-positive"><span>Escenario de ahorro</span><strong>{formatEuro(data.summary.monthlySavingsScenario)}<small>/mes</small></strong><small>{formatEuro(data.summary.annualSavingsScenario)} al año · {formatInteger(data.summary.opportunities)} categorías analizadas</small></article>
    </section>

    <IntelligenceClient initialData={data}/>

    <details className="decision-disclosure intelligence-method"><summary>Cómo decide esta sección</summary><div className="decision-disclosure-body"><p>La inteligencia es determinista y de solo lectura: analiza movimientos canónicos de cuentas operativas, excluye duplicados y traspasos y exige evidencia mínima antes de mostrar una señal.</p><ul><li>Una anomalía necesita al menos {formatInteger(data.rules.anomalyHistoryMinimum)} cargos anteriores comparables.</li><li>Una recurrencia necesita al menos {formatInteger(data.rules.recurringMinimumMonths)} meses y estabilidad de importe.</li><li>Una subida necesita al menos {formatInteger(data.rules.risingThresholdPercent)}% frente al bloque comparable anterior y una diferencia material.</li><li>El ahorro es un escenario del {formatInteger(data.rules.savingsScenarioPercent)}%, no una promesa ni una recomendación automática.</li></ul></div></details>
  </section></main>;
}
