import Link from "next/link";
import type { DecisionIntelligence } from "@/lib/financial/intelligence";

const confidenceCopy={high:"Confianza alta",medium:"Confianza media",low:"Confianza limitada"} as const;
const postureCopy={defensive:"PROTEGER",constrained:"AJUSTAR",balanced:"MANTENER",opportunity:"AVANZAR"} as const;

export function PlanIntelligence({data}:{data:DecisionIntelligence}){
  return <section className={`plan-intelligence plan-intelligence-${data.posture}`} aria-labelledby="intelligence-title">
    <div className="plan-intelligence-head"><div><p className="eyebrow">LECTURA INTELIGENTE · {postureCopy[data.posture]}</p><h2 id="intelligence-title">{data.headline}</h2><p>{data.detail}</p></div><span className={`pill intelligence-confidence-${data.confidence}`}>{confidenceCopy[data.confidence]}</span></div>
    {data.signals.length?<div className="plan-intelligence-signals">{data.signals.map(signal=><Link href={signal.href} key={signal.key} className={`plan-intelligence-signal severity-${signal.severity}`}><div><span>{signal.kind}</span><strong>{signal.title}</strong></div><p>{signal.detail}</p><small>Origen: {signal.sourcePath} →</small></Link>)}</div>:<div className="plan-intelligence-empty"><strong>Sin señales dominantes.</strong><span>La capa inteligente no detecta una condición que deba imponerse sobre el orden actual del Plan.</span></div>}
    <div className="plan-intelligence-foot"><span>Motor determinista y explicable. No ejecuta movimientos ni cambia presupuesto, previsiones u objetivos.</span><span>{data.confidenceReasons.length?`Confianza condicionada por: ${data.confidenceReasons.join(" · ")}`:"Sin incidencias de calidad que reduzcan la confianza."}</span></div>
  </section>;
}
