import { formatEuro, formatInteger } from "@/lib/format/es-es";
import type { ArchiveMatchConfidence, ArchiveMovementRef } from "@/lib/financial/archive";
import type { DocumentMatchingObservability, DocumentMatchingPriority } from "@/lib/financial/document-matching-observability";

const dates=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
const dateLabel=(value:string|null)=>value?dates.format(new Date(`${value}T12:00:00`)):"Sin fecha";
const moneyLabel=(value:number|null)=>value==null?"Sin importe":formatEuro(value);
const confidenceLabel=(value:ArchiveMatchConfidence|undefined,score:number)=>{
  if(value==="exact")return"Exacta";
  if(value==="high")return"Alta";
  if(value==="medium")return"Media";
  if(value==="low")return"Baja";
  if(score>=93)return"Alta";
  if(score>=75)return"Media";
  return"Baja";
};
const confidenceClass=(value:ArchiveMatchConfidence|undefined,score:number)=>value||((score>=93?"high":score>=75?"medium":"low") as ArchiveMatchConfidence);
const priorityLabel=(value:DocumentMatchingPriority)=>value==="auto_safe"?"Autoenlace seguro":value==="ambiguous"?"Ambigua":value==="high"?"Candidata fuerte":"Revisar";

function Candidate({candidate}:{candidate:ArchiveMovementRef}){
  const score=Math.max(0,Math.min(100,Number(candidate.score||0)));
  const tier=confidenceClass(candidate.confidenceTier,score);
  const reasons=Array.isArray(candidate.reasons)?candidate.reasons.filter(Boolean):[];
  return <article className="document-match-candidate">
    <div className="document-match-candidate-head">
      <div>
        <strong>{candidate.counterparty||candidate.concept||candidate.sourceId}</strong>
        <span>{dateLabel(candidate.date)} · {moneyLabel(candidate.amount)}</span>
      </div>
      <div className="document-match-score">
        <b>{score.toFixed(0)}%</b>
        <span className={`document-match-confidence confidence-${tier}`}>{confidenceLabel(candidate.confidenceTier,score)}</span>
      </div>
    </div>
    <div className="document-match-facts">
      {candidate.amountDiff!=null&&<span>Δ importe {formatEuro(candidate.amountDiff)}</span>}
      {candidate.daysDiff!=null&&<span>Δ fecha {formatInteger(candidate.daysDiff)} d</span>}
      {candidate.scoreMargin!=null&&candidate.candidateRank===1&&<span>Margen {Number(candidate.scoreMargin).toFixed(0)} pt</span>}
      {candidate.merchantMatch!=null&&<span>{candidate.merchantMatch?"Comercio confirmado":"Comercio no confirmado"}</span>}
      {candidate.matchMode==="installment"&&<span>Compra a plazos</span>}
      {candidate.autoEligible&&<span className="document-match-auto">Cumple autoenlace seguro</span>}
    </div>
    {reasons.length>0&&<ul className="document-match-reasons">{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
  </article>;
}

export function DocumentMatchingPanel({data}:{data:DocumentMatchingObservability}){
  const s=data.summary;
  return <section className="document-matching-panel" aria-labelledby="document-matching-title">
    <div className="matching-quality-head">
      <div>
        <p className="eyebrow">MATCHING DOCUMENTAL · EXPLICABLE</p>
        <h2 id="document-matching-title">Por qué un ticket encaja con un movimiento</h2>
        <p>El servidor clasifica todos los documentos activos sin vínculo con una única puntuación basada en importe, fecha y comercio. Este panel observa y prioriza; no crea vínculos.</p>
      </div>
      <a className="secondary-action button-link" href="/archivo">Revisar en Archivo</a>
    </div>

    <div className="document-matching-summary document-matching-summary-advanced">
      <div><span>Sin vínculo</span><strong>{formatInteger(s.activeUnlinked)}</strong></div>
      <div><span>Con candidatos</span><strong>{formatInteger(s.withCandidates)}</strong></div>
      <div><span>Autoenlace seguro</span><strong>{formatInteger(s.safeAuto)}</strong></div>
      <div><span>Ambiguos</span><strong>{formatInteger(s.ambiguous)}</strong></div>
      <div><span>Sin candidato</span><strong>{formatInteger(s.noCandidates)}</strong></div>
    </div>

    <p className="document-matching-policy">Autoenlace: score ≥ {formatInteger(data.rules.safeAutoMinimumScore)}, margen ≥ {formatInteger(data.rules.safeAutoMinimumMargin)} puntos y comercio confirmado. Los casos ambiguos nunca se consideran autoenlace seguro.</p>

    {data.documents.length===0?<div className="document-matching-empty"><strong>Sin coincidencias pendientes</strong><span>No hay documentos activos con candidatos que necesiten explicación o revisión.</span></div>:
      <div className="document-matching-list">{data.documents.map(document=><article className={`document-match-document priority-${document.priority}`} key={document.id}>
        <header>
          <div><strong>{document.merchant||document.fileName}</strong><span>{dateLabel(document.documentDate)} · {moneyLabel(document.amount)}</span></div>
          <span className={`document-match-priority priority-${document.priority}`}>{priorityLabel(document.priority)}</span>
        </header>
        <div className="document-match-candidates">{document.suggestions.map(candidate=><Candidate key={candidate.sourceId} candidate={candidate}/>)}</div>
      </article>)}</div>}
  </section>;
}
