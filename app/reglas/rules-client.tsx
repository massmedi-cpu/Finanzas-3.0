"use client";

import { formatEuro } from "@/lib/format/es-es";

import Link from "next/link";
import { useState } from "react";
import type { RuleDirection,RulePreview,RuleTextOperator,RulesOverview,TransactionRule } from "@/lib/financial/rules";


const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",year:"numeric"});
type RecurringChoice="unchanged"|"yes"|"no";
type Editor={
  id?:string;active:boolean;name:string;priority:string;counterparty:string;counterpartyOperator:RuleTextOperator;concept:string;conceptOperator:RuleTextOperator;
  type:string;categoryMatch:string;accountId:string;amountMin:string;amountMax:string;direction:RuleDirection;
  setCategory:string;setSubcategory:string;tags:string;recurring:RecurringChoice;stopProcessing:boolean;
};
const emptyEditor:Editor={active:true,name:"",priority:"100",counterparty:"",counterpartyOperator:"contains",concept:"",conceptOperator:"contains",type:"",categoryMatch:"",accountId:"",amountMin:"",amountMax:"",direction:"any",setCategory:"",setSubcategory:"",tags:"",recurring:"unchanged",stopProcessing:true};
const parseAmount=(value:string)=>value.trim()===""?null:Number(value.replace(/\s/g,"").replace(",","."));
const fmtDate=(value:string|null)=>value?dateFmt.format(new Date(value)):"Nunca";
const operatorLabel=(value:RuleTextOperator)=>value==="equals"?"es exactamente":"contiene";
const directionLabel:Record<RuleDirection,string>={any:"cualquier importe",income:"solo ingresos",expense:"solo gastos"};
const changeLabel:Record<string,string>={category:"categoría",subcategory:"subcategoría",tags:"etiquetas",isRecurring:"recurrente"};

function editorFromRule(rule:TransactionRule):Editor{return {
  id:rule.id,active:rule.active,name:rule.name,priority:String(rule.priority),counterparty:rule.conditions.counterparty||"",counterpartyOperator:rule.conditions.counterpartyOperator,
  concept:rule.conditions.concept||"",conceptOperator:rule.conditions.conceptOperator,type:rule.conditions.type||"",categoryMatch:rule.conditions.category||"",accountId:rule.conditions.accountId||"",
  amountMin:rule.conditions.amountMin==null?"":String(rule.conditions.amountMin).replace(".",","),amountMax:rule.conditions.amountMax==null?"":String(rule.conditions.amountMax).replace(".",","),direction:rule.conditions.direction,
  setCategory:rule.actions.category||"",setSubcategory:rule.actions.subcategory||"",tags:rule.actions.addTags.join(", "),recurring:rule.actions.recurring==null?"unchanged":rule.actions.recurring?"yes":"no",stopProcessing:rule.stopProcessing,
};}
function payload(editor:Editor){return {
  name:editor.name.trim(),priority:Number(editor.priority),active:editor.active,
  match_counterparty:editor.counterparty.trim()||null,counterparty_operator:editor.counterpartyOperator,match_concept:editor.concept.trim()||null,concept_operator:editor.conceptOperator,
  match_type:editor.type.trim()||null,match_category:editor.categoryMatch.trim()||null,match_account_id:editor.accountId||null,
  amount_min:parseAmount(editor.amountMin),amount_max:parseAmount(editor.amountMax),direction:editor.direction,
  set_category:editor.setCategory.trim()||null,set_subcategory:editor.setSubcategory.trim()||null,add_tags:editor.tags.split(",").map(x=>x.trim()).filter(Boolean),
  set_recurring:editor.recurring==="unchanged"?null:editor.recurring==="yes",stop_processing:editor.stopProcessing,
};}
function validate(editor:Editor){
  const p=payload(editor);if(!p.name)return "Pon un nombre a la regla.";
  if(!Number.isInteger(p.priority)||p.priority<1||p.priority>9999)return "La prioridad debe ser un número entre 1 y 9999.";
  const condition=Boolean(p.match_counterparty||p.match_concept||p.match_type||p.match_category||p.match_account_id||p.amount_min!=null||p.amount_max!=null||p.direction!=="any");
  if(!condition)return "Añade al menos una condición para evitar una regla que coincida con todo.";
  const action=Boolean(p.set_category||p.set_subcategory||p.add_tags.length||p.set_recurring!=null);if(!action)return "Añade al menos una acción.";
  if((p.amount_min!=null&&!Number.isFinite(p.amount_min))||(p.amount_max!=null&&!Number.isFinite(p.amount_max)))return "Revisa el rango de importe.";
  if((p.amount_min??0)<0||(p.amount_max??0)<0)return "Los límites de importe se indican en positivo.";
  if(p.amount_min!=null&&p.amount_max!=null&&p.amount_min>p.amount_max)return "El importe mínimo no puede superar al máximo.";
  return null;
}
function conditionSummary(rule:TransactionRule){const c=rule.conditions;const parts:string[]=[];if(c.counterparty)parts.push(`Contraparte ${operatorLabel(c.counterpartyOperator)} “${c.counterparty}”`);if(c.concept)parts.push(`Concepto ${operatorLabel(c.conceptOperator)} “${c.concept}”`);if(c.type)parts.push(`Tipo “${c.type}”`);if(c.category)parts.push(`Categoría actual “${c.category}”`);if(c.accountId)parts.push("Cuenta concreta");if(c.amountMin!=null||c.amountMax!=null)parts.push(`Importe ${c.amountMin!=null?`desde ${formatEuro(c.amountMin)}`:""}${c.amountMin!=null&&c.amountMax!=null?" ":""}${c.amountMax!=null?`hasta ${formatEuro(c.amountMax)}`:""}`);if(c.direction!=="any")parts.push(directionLabel[c.direction]);return parts.join(" · ");}
function actionSummary(rule:TransactionRule){const a=rule.actions;const parts:string[]=[];if(a.category)parts.push(`Categoría → ${a.category}`);if(a.subcategory)parts.push(`Subcategoría → ${a.subcategory}`);if(a.addTags.length)parts.push(`+ ${a.addTags.join(", ")}`);if(a.recurring!=null)parts.push(a.recurring?"Marcar recurrente":"Marcar no recurrente");return parts.join(" · ");}

export function RulesClient({initialData}:{initialData:RulesOverview}){
  const [data,setData]=useState(initialData);const [editor,setEditor]=useState<Editor|null>(null);const [preview,setPreview]=useState<RulePreview|null>(null);const [loading,setLoading]=useState(false);const [feedback,setFeedback]=useState<string|null>(null);
  async function post(body:unknown){const r=await fetch("/api/rules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se ha podido completar la operación");return j;}
  async function reload(){const r=await fetch("/api/rules",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se han podido actualizar las reglas");setData(j);}
  function openNew(){setEditor({...emptyEditor});setPreview(null);setFeedback(null);}
  function openEdit(rule:TransactionRule){setEditor(editorFromRule(rule));setPreview(null);setFeedback(null);}
  async function previewEditor(next=editor){if(!next)return;const error=validate(next);if(error){setFeedback(error);return;}setLoading(true);setFeedback(null);try{const j=await post({kind:"preview",rule:payload(next)});setPreview(j);if(!j.changeable)setFeedback(j.matched?"La regla coincide, pero no sobrescribiría ninguna edición ni valor ya equivalente.":"No hay movimientos actuales que coincidan. Sí se aplicará a movimientos nuevos que cumplan las condiciones.");}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido previsualizar");}finally{setLoading(false);}}
  async function saveRule(){if(!editor)return;const error=validate(editor);if(error){setFeedback(error);return;}setLoading(true);setFeedback(null);try{const j=await post({kind:"save",id:editor.id||null,rule:payload(editor)});if(j.overview)setData(j.overview);else await reload();setEditor(null);setPreview(null);setFeedback(editor.id?"Regla actualizada.":"Regla creada. Ya se aplicará automáticamente a los movimientos nuevos que coincidan.");}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido guardar la regla");}finally{setLoading(false);}}
  async function applyExisting(rule:TransactionRule){if(!rule.active)return;if(!window.confirm(`¿Aplicar “${rule.name}” a los movimientos existentes que coincidan? Solo escribirá en la capa editable y respetará campos editados manualmente.`))return;setLoading(true);setFeedback(null);try{const j=await post({kind:"apply",id:rule.id});if(j.overview)setData(j.overview);else await reload();setFeedback(`Regla aplicada: ${j.applied??0} movimientos modificados de ${j.matched??0} coincidencias${j.capped?" · límite de 5.000 alcanzado":""}.`);}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido aplicar la regla");}finally{setLoading(false);}}
  async function deactivate(rule:TransactionRule){if(!window.confirm(`¿Desactivar “${rule.name}”? Dejará de actuar sobre movimientos nuevos, pero sus cambios anteriores permanecerán hasta que uses “Deshacer”.`))return;setLoading(true);setFeedback(null);try{const j=await post({kind:"deactivate",id:rule.id});if(j.overview)setData(j.overview);else await reload();setFeedback("Regla desactivada.");}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido desactivar");}finally{setLoading(false);}}
  async function reactivate(rule:TransactionRule){const next={...editorFromRule(rule),active:true};setLoading(true);setFeedback(null);try{const j=await post({kind:"save",id:rule.id,rule:payload(next)});if(j.overview)setData(j.overview);else await reload();setFeedback("Regla reactivada.");}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido reactivar");}finally{setLoading(false);}}
  async function revert(rule:TransactionRule){if(!window.confirm(`¿Deshacer las aplicaciones activas de “${rule.name}”? Los campos modificados manualmente después de la regla se conservarán.`))return;setLoading(true);setFeedback(null);try{const j=await post({kind:"revert",id:rule.id});if(j.overview)setData(j.overview);else await reload();setFeedback(`Deshacer completado: ${j.applicationsReverted??0} aplicaciones revisadas y ${j.fieldsReverted??0} campos revertidos de forma segura.`);}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido deshacer");}finally{setLoading(false);}}
  async function openPreview(rule:TransactionRule){const next=editorFromRule(rule);setEditor(next);setPreview(null);await previewEditor(next);}

  return <div className={`rules-module ${loading?"is-loading":""}`}>
    <div className="rules-toolbar"><div><strong>{data.summary.activeRules} reglas activas</strong><span>{data.summary.totalApplications} aplicaciones vigentes sobre movimientos</span></div><button className="primary-action" type="button" onClick={openNew}>+ Nueva regla</button></div>
    {feedback&&<div className="rules-feedback" role="status" aria-live="polite">{feedback}</div>}

    <section className="rules-summary" aria-label="Resumen de reglas">
      <article><span>Reglas</span><strong>{data.summary.totalRules}</strong><small>{data.summary.activeRules} activas</small></article>
      <article><span>Aplicaciones vigentes</span><strong>{data.summary.totalApplications}</strong><small>Solo capa editable</small></article>
      <article className="good"><span>Origen bancario</span><strong>{data.guardrails.sourceUntouched?"Intacto":"Revisar"}</strong><small>Nunca se reescribe</small></article>
      <article className="good"><span>Edición manual</span><strong>{data.guardrails.manualOverridesProtected?"Protegida":"Revisar"}</strong><small>Una regla no la pisa</small></article>
    </section>

    <section className="rules-panel"><div className="rules-panel-head"><div><p className="eyebrow">AUTOMATIZACIÓN PRIVADA</p><h2>Reglas configuradas</h2></div><span className="pill">Prioridad menor = se evalúa antes</span></div>
      {!data.rules.length?<div className="rules-empty"><strong>Todavía no hay reglas automáticas.</strong><p>Crea una regla, previsualiza las coincidencias y decide si también quieres aplicarla a movimientos ya existentes. Los futuros se procesarán automáticamente.</p><button className="primary-action" type="button" onClick={openNew}>Crear primera regla</button></div>:
      <div className="rules-list">{data.rules.map(rule=><article className={`rule-card ${rule.active?"active":"inactive"}`} key={rule.id}>
        <div className="rule-card-head"><div><div className="rule-meta"><span className={`rule-status ${rule.active?"active":"inactive"}`}>{rule.active?"Activa":"Inactiva"}</span><span>Prioridad {rule.priority}</span>{rule.stopProcessing&&<span>Detiene reglas posteriores</span>}</div><h3>{rule.name}</h3></div><div className="rule-card-count"><strong>{rule.activeApplicationCount}</strong><span>aplicaciones vigentes</span></div></div>
        <div className="rule-definition"><div><span>SI</span><p>{conditionSummary(rule)}</p></div><div><span>ENTONCES</span><p>{actionSummary(rule)}</p></div></div>
        <div className="rule-card-foot"><span>{rule.applicationCount} aplicaciones históricas</span><span>Última: {fmtDate(rule.lastAppliedAt)}</span><div className="rule-actions"><button className="text-button" type="button" onClick={()=>openPreview(rule)} disabled={loading}>Previsualizar</button><button className="text-button" type="button" onClick={()=>openEdit(rule)} disabled={loading}>Editar</button>{rule.active?<button className="text-button" type="button" onClick={()=>applyExisting(rule)} disabled={loading}>Aplicar a existentes</button>:<button className="text-button" type="button" onClick={()=>reactivate(rule)} disabled={loading}>Reactivar</button>}{rule.active&&<button className="text-button muted" type="button" onClick={()=>deactivate(rule)} disabled={loading}>Desactivar</button>}{rule.activeApplicationCount>0&&<button className="text-button danger-text" type="button" onClick={()=>revert(rule)} disabled={loading}>Deshacer</button>}</div></div>
      </article>)}</div>}
    </section>

    <aside className="rules-guardrails"><strong>Protecciones permanentes</strong><p>Las reglas ignoran duplicados y movimientos cuyo origen haya desaparecido. Solo rellenan campos sin edición manual previa. “Deshacer” revierte únicamente el valor que la regla sigue controlando; una edición manual posterior siempre tiene prioridad.</p></aside>

    {editor&&<div className="rules-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!loading)setEditor(null)}}><section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rule-editor-title">
      <div className="rules-modal-head"><div><p className="eyebrow">{editor.id?"EDITAR REGLA":"NUEVA REGLA"}</p><h2 id="rule-editor-title">Automatización de movimientos</h2></div><button className="icon-button" type="button" onClick={()=>setEditor(null)} aria-label="Cerrar" disabled={loading}>×</button></div>
      <div className="rules-form">
        <div className="rules-form-grid"><label>Nombre<input value={editor.name} maxLength={120} onChange={e=>setEditor({...editor,name:e.target.value})} placeholder="Ej. Supermercado habitual"/></label><label>Prioridad<input type="number" min="1" max="9999" value={editor.priority} onChange={e=>setEditor({...editor,priority:e.target.value})}/><small>1 se evalúa antes que 100.</small></label></div>
        <fieldset><legend>Condiciones · SI</legend>
          <div className="rules-form-grid wide"><label>Contraparte o comercio<div className="rules-inline"><select aria-label="Operador de contraparte" value={editor.counterpartyOperator} onChange={e=>setEditor({...editor,counterpartyOperator:e.target.value as RuleTextOperator})}><option value="contains">Contiene</option><option value="equals">Es exactamente</option></select><input value={editor.counterparty} onChange={e=>setEditor({...editor,counterparty:e.target.value})} placeholder="Ej. Mercadona"/></div></label><label>Concepto<div className="rules-inline"><select aria-label="Operador de concepto" value={editor.conceptOperator} onChange={e=>setEditor({...editor,conceptOperator:e.target.value as RuleTextOperator})}><option value="contains">Contiene</option><option value="equals">Es exactamente</option></select><input value={editor.concept} onChange={e=>setEditor({...editor,concept:e.target.value})} placeholder="Texto del movimiento"/></div></label></div>
          <div className="rules-form-grid"><label>Tipo actual<input value={editor.type} onChange={e=>setEditor({...editor,type:e.target.value})} placeholder="Opcional"/></label><label>Categoría actual<input value={editor.categoryMatch} onChange={e=>setEditor({...editor,categoryMatch:e.target.value})} placeholder="Opcional"/></label></div>
          <div className="rules-form-grid"><label>Cuenta<select value={editor.accountId} onChange={e=>setEditor({...editor,accountId:e.target.value})}><option value="">Cualquier cuenta</option>{data.accounts.map(a=><option value={a.id} key={a.id}>{a.name}{a.identifier?` · ${a.identifier}`:""}</option>)}</select></label><label>Dirección<select value={editor.direction} onChange={e=>setEditor({...editor,direction:e.target.value as RuleDirection})}><option value="any">Ingresos y gastos</option><option value="expense">Solo gastos</option><option value="income">Solo ingresos</option></select></label></div>
          <div className="rules-form-grid"><label>Importe mínimo (€)<input inputMode="decimal" value={editor.amountMin} onChange={e=>setEditor({...editor,amountMin:e.target.value})} placeholder="Sin mínimo"/></label><label>Importe máximo (€)<input inputMode="decimal" value={editor.amountMax} onChange={e=>setEditor({...editor,amountMax:e.target.value})} placeholder="Sin máximo"/></label></div>
        </fieldset>
        <fieldset><legend>Acciones · ENTONCES</legend>
          <div className="rules-form-grid"><label>Asignar categoría<input value={editor.setCategory} onChange={e=>setEditor({...editor,setCategory:e.target.value})} placeholder="Opcional"/></label><label>Asignar subcategoría<input value={editor.setSubcategory} onChange={e=>setEditor({...editor,setSubcategory:e.target.value})} placeholder="Opcional"/></label></div>
          <div className="rules-form-grid"><label>Añadir etiquetas<input value={editor.tags} onChange={e=>setEditor({...editor,tags:e.target.value})} placeholder="hogar, fijo, suscripción"/><small>Separadas por comas; no elimina etiquetas existentes.</small></label><label>Recurrente<select value={editor.recurring} onChange={e=>setEditor({...editor,recurring:e.target.value as RecurringChoice})}><option value="unchanged">No cambiar</option><option value="yes">Marcar recurrente</option><option value="no">Marcar no recurrente</option></select></label></div>
          <label className="rules-check"><input type="checkbox" checked={editor.stopProcessing} onChange={e=>setEditor({...editor,stopProcessing:e.target.checked})}/><span><strong>Detener reglas posteriores si esta regla modifica el movimiento</strong><small>Útil para que una regla específica tenga prioridad sobre otras más generales.</small></span></label>
        </fieldset>
        {preview&&<section className="rule-preview" aria-label="Vista previa de la regla"><div className="rule-preview-head"><div><strong>{preview.matched} coincidencias</strong><span>{preview.changeable} movimientos cambiarían</span></div><span className="pill">Máximo 8 ejemplos</span></div>{!preview.samples.length?<p>No hay movimientos actuales que necesiten cambios con esta definición.</p>:<div className="rule-preview-list">{preview.samples.map(sample=><article key={sample.id}><div><strong>{sample.counterparty||sample.concept||"Movimiento"}</strong><span>{sample.date?dateFmt.format(new Date(`${sample.date}T12:00:00`)):"Sin fecha"} · {formatEuro(sample.amount)}</span></div><div className="preview-change-tags">{Object.keys(sample.changes||{}).map(key=><span key={key}>{changeLabel[key]||key}</span>)}</div><Link className="text-link" href={sample.counterparty?`/movimientos?search=${encodeURIComponent(sample.counterparty)}`:"/movimientos"}>Ver en movimientos →</Link></article>)}</div>}</section>}
      </div>
      <div className="rules-modal-actions"><span className="rules-modal-note">Guardar activa la regla para movimientos nuevos. Los históricos solo cambian al pulsar “Aplicar a existentes”.</span><button className="ghost" type="button" onClick={()=>setEditor(null)} disabled={loading}>Cancelar</button><button className="ghost" type="button" onClick={()=>previewEditor()} disabled={loading}>{loading?"Calculando…":"Previsualizar"}</button><button className="primary-action" type="button" onClick={saveRule} disabled={loading}>{loading?"Guardando…":"Guardar regla"}</button></div>
    </section></div>}
  </div>;
}
