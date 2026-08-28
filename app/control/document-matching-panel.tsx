import { formatEuro, formatInteger } from "@/lib/format/es-es";
import type { ArchiveDocument, ArchiveMatchConfidence, ArchiveMovementRef } from "@/lib/financial/archive";

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

export function DocumentMatchingPanel({documents}:{documents:ArchiveDocument[]}){
  const unlinked=documents.filter(document=>document.links.length===0);
  const withCandidates=unlinked.filter(document=>document.suggestions.length>0);
  const safeAuto=withCandidates.filter(document=>Boolean(document.suggestions[0]?.autoEligible)).length;
  return <section className="document-matching-panel" aria-labelledby="document-matching-title">
    <div className="matching-quality-head">
      <div>
        <p className="eyebrow">MATCHING DOCUMENTAL · EXPLICABLE</p>
        <h2 id="document-matching-title">Por qué un ticket encaja con un movimiento</h2>
        <p>Una única puntuación combina importe, fecha y comercio. El mismo motor alimenta las sugerencias y el autoenlace conservador; aquí solo se observa y explica, nunca se crea un vínculo.</p>
      </div>
      <a className="secondary-action button-link" href="/archivo">Revisar en Archivo</a>
    </div>

    <div className="document-matching-summary">
      <div><span>Activos sin vínculo</span><strong>{formatInteger(unlinked.length)}</strong></div>
      <div><span>Con candidatos</span><strong>{formatInteger(withCandidates.length)}</strong></div>
      <div><span>Autoenlace seguro</span><strong>{formatInteger(safeAuto)}</strong></div>
    </div>

    {withCandidates.length===0?<div className="document-matching-empty"><strong>Sin coincidencias pendientes</strong><span>Si aparece un documento con candidatos, este panel mostrará el score y las razones exactas antes de revisarlo en Archivo.</span></div>:
      <div className="document-matching-list">{withCandidates.slice(0,8).map(document=><article className="document-match-document" key={document.id}>
        <header>
          <div><strong>{document.merchant||document.fileName}</strong><span>{dateLabel(document.documentDate)} · {moneyLabel(document.amount)}</span></div>
          <span>{formatInteger(document.suggestions.length)} candidato{document.suggestions.length===1?"":"s"}</span>
        </header>
        <div className="document-match-candidates">{document.suggestions.slice(0,3).map(candidate=><Candidate key={candidate.sourceId} candidate={candidate}/>)}</div>
      </article>)}</div>}
  </section>;
}
