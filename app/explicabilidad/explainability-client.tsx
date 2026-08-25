"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEuro,formatInteger,formatPercent } from "@/lib/format/es-es";
import { suggestionRulePayload,type ExplainabilityOverview,type ExplainabilitySuggestion } from "@/lib/financial/explainability-shared";
import type { RulePreview } from "@/lib/financial/rules";

const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",year:"numeric"});
const directionLabel={income:"Ingreso",expense:"Gasto"} as const;
const movementLabel={income:"ingreso",expense:"gasto"} as const;

export function ExplainabilityClient({initialData}:{initialData:ExplainabilityOverview}){
  const [suggestions,setSuggestions]=useState(initialData.suggestions);
  const [preview,setPreview]=useState<RulePreview|null>(null);
  const [previewedId,setPreviewedId]=useState<string|null>(null);
  const [loadingId,setLoadingId]=useState<string|null>(null);
  const [feedback,setFeedback]=useState<string|null>(null);

  async function postRule(body:unknown){
    const response=await fetch("/api/rules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"No se ha podido completar la operación");
    return data;
  }

  async function previewSuggestion(suggestion:ExplainabilitySuggestion){
    setLoadingId(suggestion.id);setFeedback(null);setPreview(null);setPreviewedId(null);
    try{
      const data=await postRule({kind:"preview",rule:suggestionRulePayload(suggestion)});
      setPreview(data);setPreviewedId(suggestion.id);
      setFeedback(data.matched
        ?`Comprobación lista: la automatización reconocería ${formatInteger(data.matched)} movimientos con este patrón. No se ha modificado nada.`
        :"No hay movimientos actuales con este patrón. Si lo activas, solo se usará cuando aparezca uno nuevo que coincida.");
    }catch(error){setFeedback(error instanceof Error?error.message:"No se ha podido comprobar la automatización");}
    finally{setLoadingId(null);}
  }

  async function createRule(suggestion:ExplainabilitySuggestion){
    if(previewedId!==suggestion.id||!preview){setFeedback("Primero comprueba qué movimientos detectaría esta automatización.");return;}
    setLoadingId(suggestion.id);setFeedback(null);
    try{
      await postRule({kind:"save",id:null,rule:suggestionRulePayload(suggestion)});
      setSuggestions(current=>current.filter(item=>item.id!==suggestion.id));
      setPreview(null);setPreviewedId(null);
      setFeedback(`Automatización activada para ${suggestion.merchant}. Solo clasificará movimientos futuros; no se ha cambiado ningún movimiento anterior.`);
    }catch(error){setFeedback(error instanceof Error?error.message:"No se ha podido activar la automatización");}
    finally{setLoadingId(null);}
  }

  const p=initialData.provenance;
  return <div className="explainability-module">
    {feedback&&<div className="explainability-feedback" role="status" aria-live="polite">{feedback}</div>}

    <section className="explainability-summary" aria-label="Procedencia de las clasificaciones">
      <article><span>Fuente bancaria</span><strong>{formatInteger(p.source)}</strong><small>Sin capa privada</small></article>
      <article><span>Automatizaciones</span><strong>{formatInteger(p.rule)}</strong><small>Clasificación automática</small></article>
      <article><span>Edición manual</span><strong>{formatInteger(p.manual)}</strong><small>Siempre protegida</small></article>
      <article><span>Divisiones</span><strong>{formatInteger(p.split)}</strong><small>Máxima prioridad</small></article>
    </section>

    <section className="explainability-panel">
      <div className="explainability-panel-head"><div><p className="eyebrow">ORDEN DE DECISIÓN</p><h2>Qué valor tiene prioridad</h2></div><span className="pill">{formatInteger(p.total)} movimientos analizados</span></div>
      <ol className="precedence-list">{[...initialData.precedence].sort((a,b)=>a.priority-b.priority).map(item=><li key={item.key}><span>{item.priority}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div></li>)}</ol>
    </section>

    <section className="explainability-panel">
      <div className="explainability-panel-head"><div><p className="eyebrow">APRENDIZAJE A PARTIR DEL HISTORIAL</p><h2>Automatizaciones sugeridas</h2><p>Estas sugerencias no son previsiones ni cambian movimientos. Sirven para que Financial App aprenda cómo sueles clasificar un comercio y haga lo mismo automáticamente cuando llegue un movimiento nuevo.</p></div><Link className="ghost button-link" href="/reglas">Ver automatizaciones activas</Link></div>
      {!suggestions.length?<div className="explainability-empty"><strong>No hay automatizaciones pendientes con suficiente evidencia.</strong><p>Las automatizaciones existentes, ediciones manuales y divisiones quedan excluidas automáticamente.</p></div>:
      <div className="suggestion-list">{suggestions.map(suggestion=>{
        const activePreview=previewedId===suggestion.id?preview:null;const busy=loadingId===suggestion.id;
        return <article className="suggestion-card" key={suggestion.id}>
          <div className="suggestion-head"><div><span className="suggestion-direction">{directionLabel[suggestion.direction]}</span><h3>{suggestion.merchant}</h3><p>{suggestion.targetCategory}{suggestion.targetSubcategory?` · ${suggestion.targetSubcategory}`:""}</p></div><div className="suggestion-confidence"><strong>{formatPercent(suggestion.confidence*100,0)}</strong><span>consistencia histórica</span></div></div>
          <div className="suggestion-rule-explanation"><strong>Qué haría</strong><span>Cuando llegue un {movementLabel[suggestion.direction]} de “{suggestion.merchant}”, lo clasificará como <b>{suggestion.targetCategory}{suggestion.targetSubcategory?` · ${suggestion.targetSubcategory}`:""}</b>.</span></div>
          <div className="suggestion-metrics"><span>Basado en <strong>{formatInteger(suggestion.matched)}</strong> movimientos</span><span><strong>{formatInteger(suggestion.dominantMatches)}</strong> de {formatInteger(suggestion.matched)} tenían esta misma clasificación</span></div>
          <details><summary>Ver movimientos usados como evidencia</summary><div className="suggestion-samples">{suggestion.samples.map(sample=><div key={sample.sourceId}><span>{sample.date?dateFmt.format(new Date(`${sample.date}T12:00:00`)):"Sin fecha"}</span><strong>{formatEuro(sample.amount)}</strong></div>)}</div></details>
          {activePreview&&<div className="suggestion-preview"><strong>Comprobación completada</strong><span>Detecta {formatInteger(activePreview.matched)} coincidencias actuales · no se ha cambiado ninguna</span></div>}
          <div className="suggestion-actions"><button type="button" className="ghost" disabled={busy} aria-busy={busy||undefined} onClick={()=>previewSuggestion(suggestion)}>{busy?"Comprobando…":"Comprobar qué detectará"}</button><button type="button" className="primary-action" disabled={busy||!activePreview} onClick={()=>createRule(suggestion)}>Activar para futuros</button></div>
        </article>;
      })}</div>}
    </section>

    <aside className="explainability-guardrails"><strong>Qué ocurre al activarla</strong><p>Solo actuará sobre movimientos nuevos que coincidan exactamente con el comercio y el tipo de movimiento. No toca el dato bancario ni modifica el historial. Las ediciones manuales y divisiones siguen teniendo prioridad, y la automatización se puede desactivar o deshacer desde su pantalla.</p></aside>
  </div>;
}
