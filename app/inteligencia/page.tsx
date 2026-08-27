import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { formatEuro, formatInteger } from "@/lib/format/es-es";
import { getActionableIntelligence } from "@/lib/financial/actionable-intelligence";
import { IntelligenceClient } from "./intelligence-client";

export const dynamic="force-dynamic";

export default async function IntelligencePage(){
  await requireAuthorizedUser();
  const data=await getActionableIntelligence(400);
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace intelligence-workspace">
    <header className="topbar"><div><p className="eyebrow">INTELIGENCIA · {data.version}</p><h1>Señales concretas sobre tus gastos</h1><p>Anomalías con historial, cargos recurrentes, categorías que aceleran y escenarios voluntarios de ahorro. Cada señal enlaza con los movimientos que la justifican.</p></div></header>

    <section className="intelligence-summary" aria-label="Resumen de inteligencia financiera">
      <article><span>Anomalías</span><strong>{formatInteger(data.summary.anomalies)}</strong><small>solo con historial suficiente</small></article>
      <article><span>Cargos recurrentes</span><strong>{formatInteger(data.summary.recurring)}</strong><small>patrón estable activo</small></article>
      <article><span>Gasto que sube</span><strong>{formatInteger(data.summary.rising)}</strong><small>2 meses completos vs. 2 anteriores</small></article>
      <article><span>Escenarios de ahorro</span><strong>{formatInteger(data.summary.opportunities)}</strong><small>reducción hipotética del 10%</small></article>
      <article className="intelligence-savings"><span>Escenario mensual</span><strong>{formatEuro(data.summary.monthlySavingsScenario)}</strong><small>{formatEuro(data.summary.annualSavingsScenario)} al año si se aplicara el 10%</small></article>
    </section>

    <IntelligenceClient initialData={data}/>

    <details className="intelligence-method"><summary>Cómo decide esta sección</summary><p>No usa un modelo externo ni modifica movimientos. Analiza únicamente movimientos canónicos de cuentas operativas, excluye duplicados y traspasos, exige muestra mínima y usa meses completos para comparar tendencias.</p><ul><li>Una anomalía necesita al menos {formatInteger(data.rules.anomalyHistoryMinimum)} cargos anteriores del mismo comercio.</li><li>Una recurrencia necesita al menos {formatInteger(data.rules.recurringMinimumMonths)} meses y estabilidad de importe.</li><li>Una subida exige al menos {formatInteger(data.rules.risingThresholdPercent)}% frente al bloque comparable anterior y diferencia material.</li><li>El ahorro es un escenario del {formatInteger(data.rules.savingsScenarioPercent)}%, no una promesa ni una recomendación automática.</li></ul></details>
  </section></main>;
}
