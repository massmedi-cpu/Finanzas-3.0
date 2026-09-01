import Link from "next/link";
import type { DecisionIntelligence } from "@/lib/financial/intelligence";

const confidenceCopy={high:"Confianza alta",medium:"Confianza media",low:"Confianza limitada"} as const;
const confidenceTone={high:"ok",medium:"info",low:"warning"} as const;
const postureCopy={defensive:"PROTEGER",constrained:"AJUSTAR",balanced:"MANTENER",opportunity:"AVANZAR"} as const;

export function PlanIntelligence({data}:{data:DecisionIntelligence}){
  return <section className={`plan-intelligence plan-intelligence-${data.posture}`} aria-labelledby="intelligence-title">
    <div className="plan-intelligence-head"><div><p className="eyebrow">LECTURA INTELIGENTE · {postureCopy[data.posture]}</p><h2 id="intelligence-title">{data.headline}</h2><p>{data.detail}</p></div><span className={`status-badge ${confidenceTone[data.confidence]}`}>{confidenceCopy[data.confidence]}</span></div>
    {data.signals.length?<div className="plan-intelligence-signals">{data.signals.map(signal=><Link href={signal.href} key={signal.key} className={`plan-intelligence-signal severity-${signal.severity}`}><div><span>{signal.kind}</span><strong>{signal.title}</strong></div><p>{signal.detail}</p><small>Ver evidencia →</small></Link>)}</div>:<div className="empty-state"><strong>Sin señales dominantes.</strong><span>Ninguna condición necesita imponerse sobre el orden actual del Plan.</span></div>}
    <div className="plan-intelligence-foot"><p className="decision-note">{data.confidenceReasons.length?`La confianza baja por: ${data.confidenceReasons.join(" · ")}.`:"Los datos disponibles no presentan incidencias que reduzcan la confianza."}</p><Link className="text-button button-link" href="/inteligencia">Analizar señales</Link><Link className="text-button button-link" href="/plan/horizonte">Horizonte 3/6/12</Link></div>
  </section>;
}
