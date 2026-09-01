"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEuro,formatInteger,formatPercent } from "@/lib/format/es-es";
import { suggestionRulePayload,type ExplainabilityOverview,type ExplainabilitySuggestion } from "@/lib/financial/explainability-shared";
import type { RulePreview } from "@/lib/financial/rules";

const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",year:"numeric"});
const directionLabel={income:"Ingreso",expense:"Gasto"} as const;
const movementLabel={income:"ingreso",expense:"gasto"} as const;
type Feedback={tone:"success"|"error"|"warning"|"info";message:string};

export function ExplainabilityClient({initialData}:{initialData:ExplainabilityOverview}){
  const[suggestions,setSuggestions]=useState(initialData.suggestions);
  const[preview,setPreview]=useState<RulePreview|null>(null);
  const[previewedId,setPreviewedId]=useState<string|null>(null);
  const[loadingId,setLoadingId]=useState<string|null>(null);
  const[feedback,setFeedback]=useState<Feedback|null>(null);
  const moduleBusy=loadingId!==null;

  async function postRule(body:unknown){
    const response=await fetch("/api/rules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"No se ha podido completar la operación");
    return data;
  }

  async function previewSuggestion(suggestion:ExplainabilitySuggestion){
    if(moduleBusy)return;
    setLoadingId(suggestion.id);setFeedback(null);setPreview(null);setPreviewedId(null);
    try{
      const data=await postRule({kind:"preview",rule:suggestionRulePayload(suggestion)});
      setPreview(data);setPreviewedId(suggestion.id);
      setFeedback({tone:"info",message:data.matched
        ?`Comprobación lista: la automatización reconocería ${formatInteger(data.matched)} movimientos con este patrón. No se ha modificado nada.`
        :"No hay movimientos actuales con este patrón. Si la activas, solo actuará cuando aparezca uno nuevo que coincida."});
    }catch(error){setFeedback({tone:"error",message:error instanceof Error?error.message:"No se ha podido comprobar la automatización"});}
    finally{setLoadingId(null);}
  }

  async function createRule(suggestion:ExplainabilitySuggestion){
    if(moduleBusy)return;
    if(previewedId!==suggestion.id||!preview){setFeedback({tone:"warning",message:"Primero comprueba qué movimientos detectaría esta automatización."});return;}
    setLoadingId(suggestion.id);setFeedback(null);
    try{
      await postRule({kind:"save",id:null,rule:suggestionRulePayload(suggestion)});
      setSuggestions(current=>current.filter(item=>item.id!==suggestion.id));
      setPreview(null);setPreviewedId(null);
      setFeedback({tone:"success",message:`Automatización activada para ${suggestion.merchant}. Solo clasificará movimientos futuros; no se ha cambiado ningún movimiento anterior.`});
    }catch(error){setFeedback({tone:"error",message:error instanceof Error?error.message:"No se ha podido activar la automatización"});}
    finally{setLoadingId(null);}
  }

  const p=initialData.provenance;
  const protectedCount=p.manual+p.split;
  return <div className="explainability-module" aria-busy={moduleBusy||undefined}>
    {feedback&&<div className={`inline-alert ${feedback.tone} explainability-feedback`} role={feedback.tone==="error"?"alert":"status"} aria-live="polite">{feedback.message}</div>}

    <section className="decision-summary explainability-summary" aria-label="Procedencia de las clasificaciones">
      <article className="decision-metric is-primary"><span>Dato bancario directo</span><strong>{formatInteger(p.source)}</strong><small>Sin intervención de Financial App</small></article>
      <article className="decision-metric"><span>Automatizaciones</span><strong>{formatInteger(p.rule)}</strong><small>Patrones ya activos</small></article>
      <article className="decision-metric is-positive"><span>Decisiones protegidas</span><strong>{formatInteger(protectedCount)}</strong><small>{formatInteger(p.manual)} manuales · {formatInteger(p.split)} divisiones</small></article>
    </section>

    <details className="decision-disclosure explainability-precedence"><summary>Cómo se decide qué clasificación gana · {formatInteger(p.total)} movimientos analizados</summary><ol className="precedence-list">{[...initialData.precedence].sort((a,b)=>a.priority-b.priority).map(item=><li key={item.key}><span>{item.priority}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div></li>)}</ol></details>

    <section className="panel explainability-panel">
      <div className="panel-head"><div><p className="eyebrow">APRENDIZAJE A PARTIR DEL HISTORIAL</p><h2>Automatizaciones sugeridas</h2><p>Financial App solo propone patrones con evidencia suficiente. Tú decides si comprobarlos y activarlos.</p></div><Link className="ghost button-link" href="/reglas">Ver automatizaciones activas</Link></div>
      {!suggestions.length?<div className="empty-state explainability-empty"><strong>No hay automatizaciones pendientes con suficiente evidencia.</strong><span>Las reglas existentes, ediciones manuales y divisiones se excluyen automáticamente.</span></div>:
      <div className="suggestion-list">{suggestions.map(suggestion=>{
        const activePreview=previewedId===suggestion.id?preview:null;
        const busy=loadingId===suggestion.id;
        return <article className="suggestion-card" key={suggestion.id} aria-busy={busy||undefined}>
          <div className="suggestion-head"><div><span className="suggestion-direction">{directionLabel[suggestion.direction]}</span><h3>{suggestion.merchant}</h3><p>{suggestion.targetCategory}{suggestion.targetSubcategory?` · ${suggestion.targetSubcategory}`:""}</p></div><div className="suggestion-confidence"><strong>{formatPercent(suggestion.confidence*100,0)}</strong><span>consistencia</span></div></div>
          <div className="suggestion-rule-explanation"><strong>Qué haría</strong><span>Cuando llegue un {movementLabel[suggestion.direction]} de “{suggestion.merchant}”, lo clasificará como <b>{suggestion.targetCategory}{suggestion.targetSubcategory?` · ${suggestion.targetSubcategory}`:""}</b>.</span></div>
          <p className="suggestion-evidence"><strong>{formatInteger(suggestion.dominantMatches)} de {formatInteger(suggestion.matched)}</strong> movimientos comparables tenían esta misma clasificación.</p>
          <details className="decision-disclosure suggestion-evidence-detail"><summary>Ver movimientos usados como evidencia</summary><div className="suggestion-samples">{suggestion.samples.map(sample=><div key={sample.sourceId}><span>{sample.date?dateFmt.format(new Date(`${sample.date}T12:00:00`)):"Sin fecha"}</span><strong>{formatEuro(sample.amount)}</strong></div>)}</div></details>
          {activePreview&&<div className="inline-alert info suggestion-preview" role="status"><span><strong>Comprobación completada.</strong> Detecta {formatInteger(activePreview.matched)} coincidencias actuales y no ha cambiado ninguna.</span></div>}
          <div className="suggestion-actions"><button type="button" className="ghost" disabled={moduleBusy} aria-busy={busy||undefined} onClick={()=>previewSuggestion(suggestion)}>{busy?"Comprobando…":"Comprobar qué detectará"}</button><button type="button" className="primary-action" disabled={moduleBusy||!activePreview} aria-busy={busy||undefined} onClick={()=>createRule(suggestion)}>Activar para futuros</button></div>
        </article>;
      })}</div>}
    </section>

    <details className="decision-disclosure explainability-safety"><summary>Qué ocurre al activar una automatización</summary><p>Solo actuará sobre movimientos nuevos que coincidan con el comercio y el tipo de movimiento. No toca el dato bancario ni modifica el historial. Las ediciones manuales y divisiones siguen teniendo prioridad, y puedes desactivar o deshacer la automatización desde Reglas.</p></details>
  </div>;
}
