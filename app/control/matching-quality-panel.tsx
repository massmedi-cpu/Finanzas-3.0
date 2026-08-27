import { formatNumber, formatPercent } from "@/lib/format/es-es";
import type { MatchingObservability, MatchingQualityStatus } from "@/lib/financial/matching-observability";

const label=(status:MatchingQualityStatus)=>status==="healthy"?"Saludable":status==="watch"?"Vigilar":status==="degraded"?"Degradado":"Sin muestra";
const pct=(value:number)=>formatPercent(value*100,1);
const signedPct=(value:number)=>`${value>0?"+":""}${formatNumber(value*100,{maximumFractionDigits:1})} pp`;
const signedDays=(value:number)=>`${value>0?"+":""}${formatNumber(value,{maximumFractionDigits:1})} días`;

function Status({value}:{value:MatchingQualityStatus}){return <span className={`matching-status status-${value}`}>{label(value)}</span>}

export function MatchingQualityPanel({data}:{data:MatchingObservability}){
  const forecastPreviousEnough=data.forecast.previous.matured>=data.rules.forecastMinimumSample;
  const reconciliationPreviousEnough=data.reconciliation.previous.pairsCreated>=data.rules.reconciliationMinimumPairs||data.reconciliation.previous.decisions>=data.rules.reconciliationMinimumDecisions;
  return <section className="matching-quality-panel" aria-labelledby="matching-quality-title">
    <div className="matching-quality-head">
      <div><p className="eyebrow">CALIDAD DE DECISIONES · {data.version}</p><h2 id="matching-quality-title">Conciliación y previsión bajo control</h2><p>Compara los últimos {data.windowDays} días con la ventana anterior y avisa solo cuando hay muestra suficiente. No almacena importes ni duplica movimientos para medir la calidad.</p></div>
      <div className="matching-quality-overall"><Status value={data.status}/><small>{data.releaseGate.pass?"Gate de release superado":"Gate de release bloqueado"}</small></div>
    </div>

    {data.alerts.length>0&&<div className="matching-alerts" role="status">{data.alerts.map(alert=><article key={alert.code} className={`matching-alert severity-${alert.severity}`}><strong>{alert.scope==="forecast"?"Previsión":"Conciliación"}</strong><span>{alert.message}</span></article>)}</div>}

    <div className="matching-quality-grid">
      <article className="matching-quality-card">
        <div className="matching-card-head"><div><span>Previsión</span><strong>¿Los cargos esperados se justifican bien?</strong></div><Status value={data.forecast.status}/></div>
        <div className="matching-metrics">
          <div><span>Aciertos maduros</span><strong>{pct(data.forecast.recent.matchRate)}</strong><small>{data.forecast.recent.received} de {data.forecast.recent.matured}</small></div>
          <div><span>Error mediano de fecha</span><strong>{formatNumber(data.forecast.recent.medianDateErrorDays,{maximumFractionDigits:1})} días</strong><small>solo eventos justificados</small></div>
          <div><span>Error mediano de importe</span><strong>{pct(data.forecast.recent.medianAmountErrorRatio)}</strong><small>relativo al importe previsto</small></div>
          <div><span>Matches débiles</span><strong>{pct(data.forecast.recent.weakIdentityRate)}</strong><small>identidad de rango 3 o superior</small></div>
        </div>
        <p className="matching-trend">{forecastPreviousEnough?<>Frente a la ventana anterior: acierto <b>{signedPct(data.forecast.trend.matchRateDelta)}</b>, error de fecha <b>{signedDays(data.forecast.trend.dateErrorDeltaDays)}</b> y error de importe <b>{signedPct(data.forecast.trend.amountErrorRatioDelta)}</b>.</>:<>Todavía no existe una ventana anterior con muestra suficiente para una tendencia fiable.</>}</p>
      </article>

      <article className="matching-quality-card">
        <div className="matching-card-head"><div><span>Conciliación</span><strong>¿Las parejas confirmadas siguen siendo fiables?</strong></div><Status value={data.reconciliation.status}/></div>
        <div className="matching-metrics">
          <div><span>Confianza media</span><strong>{formatNumber(data.reconciliation.recent.averageConfidence,{maximumFractionDigits:1})}</strong><small>parejas activas del periodo</small></div>
          <div><span>Cancelaciones</span><strong>{pct(data.reconciliation.recent.cancelRate)}</strong><small>{data.reconciliation.recent.pairsCancelled} canceladas</small></div>
          <div><span>Decisiones repetidas</span><strong>{pct(data.reconciliation.recent.repeatDecisionRate)}</strong><small>señal de corrección manual</small></div>
          <div><span>Confianza baja</span><strong>{pct(data.reconciliation.recent.lowConfidenceRate)}</strong><small>parejas por debajo de 90</small></div>
        </div>
        <p className="matching-trend">{reconciliationPreviousEnough?<>Frente a la ventana anterior: cancelaciones <b>{signedPct(data.reconciliation.trend.cancelRateDelta)}</b> y decisiones repetidas <b>{signedPct(data.reconciliation.trend.repeatDecisionRateDelta)}</b>.</>:<>La ventana anterior no tiene muestra suficiente; no se fuerza una comparación artificial.</>}</p>
      </article>
    </div>

    <div className="matching-quality-foot"><span>Fuente: historial canónico de conciliación + ledger de previsión 1↔1.</span><span>Umbrales con muestra mínima: {data.rules.forecastMinimumSample} previsiones · {data.rules.reconciliationMinimumPairs} parejas o {data.rules.reconciliationMinimumDecisions} decisiones.</span></div>
  </section>;
}
