"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MatchingPolicyDashboard } from "@/lib/financial/document-matching-policy";

const pct=(value:number)=>`${Math.round(value*100)}%`;
const n=(value:number)=>new Intl.NumberFormat("es-ES").format(value);
const sourceLabel=(value:string)=>value==="default"?"Base 6.1":value==="proposal"?"Propuesta aprobada":value==="rollback"?"Restaurada":"Manual";
const recommendationLabel=(value:string)=>value==="tighten_score"?"Subir score mínimo":value==="tighten_margin"?"Aumentar margen":value==="tighten_both"?"Endurecer score y margen":value==="keep"?"Mantener política":"Evidencia insuficiente";

export function DocumentMatchingPolicyPanel({data}:{data:MatchingPolicyDashboard}){
  const router=useRouter();
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const recommendation=data.recommendation;
  const actionable=["tighten_score","tighten_margin","tighten_both"].includes(recommendation.recommendation);
  const canRollback=data.policyHistory.length>1;

  async function act(action:"generate"|"apply"|"reject"|"rollback",proposalId?:number){
    setBusy(action);setMessage(null);setError(null);
    try{
      const response=await fetch("/api/control/document-matching-policy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,proposalId,days:recommendation.windowDays})});
      const body=await response.json() as {ok?:boolean;error?:string;created?:boolean;reason?:string};
      if(!response.ok)throw new Error(body.error||"No se pudo actualizar la política");
      if(action==="generate"&&body.created===false)setMessage(body.reason==="keep"?"La evidencia recomienda mantener la política actual.":"Aún no hay evidencia suficiente para proponer un cambio.");
      else setMessage(action==="apply"?"Política aprobada. Queda versionada y puede revertirse.":action==="reject"?"Propuesta rechazada. La política activa no cambia.":action==="rollback"?"Política anterior restaurada.":"Propuesta creada para revisión.");
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al actualizar la política");}
    finally{setBusy(null);}
  }

  return <section className="document-matching-policy" aria-labelledby="matching-policy-title">
    <div className="matching-quality-head">
      <div><p className="eyebrow">POLÍTICA SUPERVISADA</p><h2 id="matching-policy-title">El motor propone; tú decides</h2><p>La calibración convierte tus decisiones reales en evidencia. Financial App puede proponer endurecer el autoenlace, pero nunca aplica ni relaja umbrales por sí sola.</p></div>
      <span className="matching-policy-manual">Aprobación manual obligatoria</span>
    </div>

    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}

    <div className="matching-policy-current">
      <div><span>Score mínimo</span><strong>{data.activePolicy.minScore.toFixed(0)}</strong></div>
      <div><span>Margen mínimo</span><strong>{data.activePolicy.minMargin.toFixed(0)} pt</strong></div>
      <div><span>Comercio</span><strong>{data.activePolicy.requireMerchantMatch?"Obligatorio":"Opcional"}</strong></div>
      <div><span>Origen</span><strong>{sourceLabel(data.activePolicy.source)}</strong></div>
    </div>

    <div className="matching-policy-evidence">
      <div><span>Decisiones con sugerencias</span><strong>{n(recommendation.sampleWithSuggestions)}</strong><small>Mínimo recomendado: {n(recommendation.minimumSuggestedDecisions)}</small></div>
      <div><span>Casos autoelegibles</span><strong>{n(recommendation.autoEligibleCases)}</strong><small>Mínimo recomendado: {n(recommendation.minimumAutoEligibleCases)}</small></div>
      <div><span>Top elegido</span><strong>{pct(recommendation.topChoiceRate)}</strong><small>{n(recommendation.topChosen)} decisiones</small></div>
      <div><span>Autoelegible aceptado</span><strong>{pct(recommendation.autoAcceptanceRate)}</strong><small>{n(recommendation.autoEligibleRejected)} rechazados</small></div>
    </div>

    <article className={`matching-policy-recommendation recommendation-${recommendation.recommendation}`}>
      <div><span>Recomendación sobre {recommendation.windowDays} días</span><strong>{recommendationLabel(recommendation.recommendation)}</strong><p>{recommendation.evidenceNote}</p></div>
      {actionable&&!data.pendingProposal&&<button className="secondary-action" type="button" disabled={busy!==null} onClick={()=>act("generate")}>{busy==="generate"?"Generando…":"Crear propuesta"}</button>}
    </article>

    {data.pendingProposal&&<article className="matching-policy-proposal">
      <div><p className="eyebrow">PROPUESTA PENDIENTE</p><h3>{recommendationLabel(data.pendingProposal.recommendation)}</h3><p>{data.pendingProposal.evidenceNote}</p></div>
      <div className="matching-policy-change"><span>Score <b>{data.activePolicy.minScore.toFixed(0)} → {data.pendingProposal.proposedScore.toFixed(0)}</b></span><span>Margen <b>{data.activePolicy.minMargin.toFixed(0)} → {data.pendingProposal.proposedMargin.toFixed(0)} pt</b></span></div>
      <div className="matching-policy-actions"><button className="primary-action" type="button" disabled={busy!==null} onClick={()=>act("apply",data.pendingProposal!.proposalId)}>{busy==="apply"?"Aplicando…":"Aplicar política"}</button><button className="ghost" type="button" disabled={busy!==null} onClick={()=>act("reject",data.pendingProposal!.proposalId)}>{busy==="reject"?"Rechazando…":"Rechazar"}</button></div>
    </article>}

    <div className="matching-policy-history">
      <div><strong>Histórico de políticas</strong><span>{data.policyHistory.length} versión{data.policyHistory.length===1?"":"es"} conservada{data.policyHistory.length===1?"":"s"}</span></div>
      {canRollback&&<button className="ghost" type="button" disabled={busy!==null} onClick={()=>act("rollback")}>{busy==="rollback"?"Restaurando…":"Volver a política anterior"}</button>}
    </div>
    <p className="matching-policy-safety">La supervisión solo puede mantener o endurecer automáticamente una propuesta. Cualquier cambio requiere aprobación explícita y cada política puede rastrearse o revertirse.</p>
  </section>;
}
