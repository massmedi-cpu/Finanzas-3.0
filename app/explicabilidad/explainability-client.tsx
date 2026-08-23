"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEuro,formatInteger,formatPercent } from "@/lib/format/es-es";
import { suggestionRulePayload,type ExplainabilityOverview,type ExplainabilitySuggestion } from "@/lib/financial/explainability-shared";
import type { RulePreview } from "@/lib/financial/rules";

const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",year:"numeric"});
const directionLabel={income:"Ingreso",expense:"Gasto"} as const;

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
      setFeedback(data.matched?`Vista previa lista: ${formatInteger(data.changeable)} de ${formatInteger(data.matched)} coincidencias podrían recibir la clasificación.`:"La regla no coincide con movimientos actuales, pero puede servir para movimientos futuros.");
    }catch(error){setFeedback(error instanceof Error?error.message:"No se ha podido generar la vista previa");}
    finally{setLoadingId(null);}
  }

  async function createRule(suggestion:ExplainabilitySuggestion){
    if(previewedId!==suggestion.id||!preview){setFeedback("Previsualiza esta sugerencia antes de crear la regla.");return;}
    setLoadingId(suggestion.id);setFeedback(null);
    try{
      await postRule({kind:"save",id:null,rule:suggestionRulePayload(suggestion)});
      setSuggestions(current=>current.filter(item=>item.id!==suggestion.id));
      setPreview(null);setPreviewedId(null);
      setFeedback(`Regla creada para ${suggestion.merchant}. No se ha aplicado retroactivamente a ningún movimiento.`);
    }catch(error){setFeedback(error instanceof Error?error.message:"No se ha podido crear la regla");}
    finally{setLoadingId(null);}
  }

  const p=initialData.provenance;
  return <div className="explainability-module">
    {feedback&&<div className="explainability-feedback" role="status" aria-live="polite">{feedback}</div>}

    <section className="explainability-summary" aria-label="Procedencia de las clasificaciones">
      <article><span>Fuente bancaria</span><strong>{formatInteger(p.source)}</strong><small>Sin capa privada</small></article>
      <article><span>Reglas</span><strong>{formatInteger(p.rule)}</strong><small>Automatización trazable</small></article>
      <article><span>Edición manual</span><strong>{formatInteger(p.manual)}</strong><small>Siempre protegida</small></article>
      <article><span>Divisiones</span><strong>{formatInteger(p.split)}</strong><small>Máxima prioridad</small></article>
    </section>

    <section className="explainability-panel">
      <div className="explainability-panel-head"><div><p className="eyebrow">ORDEN DE DECISIÓN</p><h2>Qué valor tiene prioridad</h2></div><span className="pill">{formatInteger(p.total)} movimientos analizados</span></div>
      <ol className="precedence-list">{[...initialData.precedence].sort((a,b)=>a.priority-b.priority).map(item=><li key={item.key}><span>{item.priority}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div></li>)}</ol>
    </section>

    <section className="explainability-panel">
      <div className="explainability-panel-head"><div><p className="eyebrow">SUGERENCIAS · SOLO LECTURA</p><h2>Patrones que podrían convertirse en regla</h2><p>Se muestran únicamente patrones con al menos {initialData.guardrails.minSamples} movimientos y {formatPercent(initialData.guardrails.minDominance*100,0)} de consistencia.</p></div><Link className="secondary-action" href="/reglas">Ver reglas</Link></div>
      {!suggestions.length?<div className="explainability-empty"><strong>No hay sugerencias pendientes con suficiente evidencia.</strong><p>Las reglas existentes, ediciones manuales y divisiones quedan excluidas automáticamente.</p></div>:
      <div className="suggestion-list">{suggestions.map(suggestion=>{
        const activePreview=previewedId===suggestion.id?preview:null;const busy=loadingId===suggestion.id;
        return <article className="suggestion-card" key={suggestion.id}>
          <div className="suggestion-head"><div><span className="suggestion-direction">{directionLabel[suggestion.direction]}</span><h3>{suggestion.merchant}</h3><p>{suggestion.targetCategory}{suggestion.targetSubcategory?` · ${suggestion.targetSubcategory}`:""}</p></div><div className="suggestion-confidence"><strong>{formatPercent(suggestion.confidence*100,0)}</strong><span>confianza</span></div></div>
          <div className="suggestion-metrics"><span><strong>{formatInteger(suggestion.matched)}</strong> coincidencias</span><span><strong>{formatInteger(suggestion.dominantMatches)}</strong> con la clasificación dominante</span></div>
          <details><summary>Ver evidencia</summary><div className="suggestion-samples">{suggestion.samples.map(sample=><div key={sample.sourceId}><span>{sample.date?dateFmt.format(new Date(`${sample.date}T12:00:00`)):"Sin fecha"}</span><strong>{formatEuro(sample.amount)}</strong></div>)}</div></details>
          {activePreview&&<div className="suggestion-preview"><strong>Vista previa obligatoria superada</strong><span>{formatInteger(activePreview.matched)} coincidencias · {formatInteger(activePreview.changeable)} modificables</span></div>}
          <div className="suggestion-actions"><button type="button" className="secondary-action" disabled={busy} onClick={()=>previewSuggestion(suggestion)}>{busy?"Comprobando…":"Previsualizar regla"}</button><button type="button" className="primary-action" disabled={busy||!activePreview} onClick={()=>createRule(suggestion)}>Crear regla</button></div>
        </article>;
      })}</div>}
    </section>

    <aside className="explainability-guardrails"><strong>Protecciones permanentes</strong><p>Esta pantalla no modifica datos. Excluye movimientos divididos, ediciones manuales, duplicados, traspasos internos y aplicaciones de reglas existentes. Crear una regla exige una vista previa y tampoco la aplica retroactivamente.</p></aside>
  </div>;
}
