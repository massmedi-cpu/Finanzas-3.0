"use client";

import { FormEvent, useMemo, useState } from "react";

type Choice = "unchanged" | "inherit" | "yes" | "no";
type CashChoice = "unchanged" | "inherit" | "include" | "exclude";

type Props = {
  selectedCount:number;
  categories:string[];
  types:string[];
  busy:boolean;
  onApply:(patch:Record<string,unknown>)=>Promise<boolean>;
  onClear:()=>void;
};

export function BulkMovementEditor({selectedCount,categories,types,busy,onApply,onClear}:Props){
  const [type,setType]=useState("__unchanged__");
  const [categoryEnabled,setCategoryEnabled]=useState(false);
  const [category,setCategory]=useState("");
  const [subcategoryEnabled,setSubcategoryEnabled]=useState(false);
  const [subcategory,setSubcategory]=useState("");
  const [cashFlow,setCashFlow]=useState<CashChoice>("unchanged");
  const [reconciled,setReconciled]=useState<Choice>("unchanged");
  const [recurring,setRecurring]=useState<Choice>("unchanged");
  const [review,setReview]=useState<Exclude<Choice,"inherit">>("unchanged");
  const [internalTransfer,setInternalTransfer]=useState<Exclude<Choice,"inherit">>("unchanged");
  const [duplicate,setDuplicate]=useState<Exclude<Choice,"inherit">>("unchanged");
  const [tagsEnabled,setTagsEnabled]=useState(false);
  const [tags,setTags]=useState("");

  const patch=useMemo(()=>{
    const next:Record<string,unknown>={};
    if(type!=="__unchanged__") next.type=type==="__clear__"?null:type;
    if(categoryEnabled) next.category=category.trim()||null;
    if(subcategoryEnabled) next.subcategory=subcategory.trim()||null;
    if(cashFlow!=="unchanged") next.cashFlowOverride=cashFlow==="inherit"?null:cashFlow==="include";
    if(reconciled!=="unchanged") next.isReconciled=reconciled==="inherit"?null:reconciled==="yes";
    if(recurring!=="unchanged") next.isRecurring=recurring==="inherit"?null:recurring==="yes";
    if(review!=="unchanged") next.needsReview=review==="yes";
    if(internalTransfer!=="unchanged") next.isInternalTransfer=internalTransfer==="yes";
    if(duplicate!=="unchanged") next.isDuplicate=duplicate==="yes";
    if(tagsEnabled) next.tags=tags.split(",").map(value=>value.trim()).filter(Boolean);
    return next;
  },[type,categoryEnabled,category,subcategoryEnabled,subcategory,cashFlow,reconciled,recurring,review,internalTransfer,duplicate,tagsEnabled,tags]);

  function reset(){
    setType("__unchanged__");setCategoryEnabled(false);setCategory("");setSubcategoryEnabled(false);setSubcategory("");
    setCashFlow("unchanged");setReconciled("unchanged");setRecurring("unchanged");setReview("unchanged");
    setInternalTransfer("unchanged");setDuplicate("unchanged");setTagsEnabled(false);setTags("");
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!Object.keys(patch).length)return;
    const applied=await onApply(patch);
    if(applied)reset();
  }

  async function markReviewed(){await onApply({needsReview:false});}

  return <form className="bulk-movement-editor" onSubmit={submit}>
    <div className="bulk-editor-head">
      <div><strong>{selectedCount} movimiento{selectedCount===1?"":"s"} seleccionado{selectedCount===1?"":"s"}</strong><span>Solo se ofrecen operaciones reversibles: los cambios se aplican juntos y quedan registrados en el historial de cada movimiento.</span></div>
      <button className="ghost" type="button" onClick={onClear} disabled={busy}>Quitar selección</button>
    </div>

    <div className="bulk-editor-grid">
      <label><span>Tipo</span><select value={type} onChange={e=>setType(e.target.value)}><option value="__unchanged__">No cambiar</option><option value="__clear__">Restaurar origen</option>{types.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <label className="bulk-enabled-field"><span><input type="checkbox" checked={categoryEnabled} onChange={e=>setCategoryEnabled(e.target.checked)}/> Cambiar categoría</span><input list="bulk-movement-categories" value={category} onChange={e=>setCategory(e.target.value)} disabled={!categoryEnabled} placeholder="Vacío = restaurar origen"/><datalist id="bulk-movement-categories">{categories.map(value=><option key={value} value={value}/>)}</datalist></label>
      <label className="bulk-enabled-field"><span><input type="checkbox" checked={subcategoryEnabled} onChange={e=>setSubcategoryEnabled(e.target.checked)}/> Cambiar subcategoría</span><input value={subcategory} onChange={e=>setSubcategory(e.target.value)} disabled={!subcategoryEnabled} placeholder="Vacío = restaurar origen"/></label>
      <label><span>Cash Flow</span><select value={cashFlow} onChange={e=>setCashFlow(e.target.value as CashChoice)}><option value="unchanged">No cambiar</option><option value="inherit">Automático según reglas</option><option value="include">Incluir manualmente</option><option value="exclude">Excluir manualmente</option></select></label>
      <label><span>Conciliado</span><select value={reconciled} onChange={e=>setReconciled(e.target.value as Choice)}><option value="unchanged">No cambiar</option><option value="inherit">Según origen</option><option value="yes">Sí</option><option value="no">No</option></select></label>
      <label><span>Recurrente</span><select value={recurring} onChange={e=>setRecurring(e.target.value as Choice)}><option value="unchanged">No cambiar</option><option value="inherit">No indicado</option><option value="yes">Sí</option><option value="no">No</option></select></label>
      <label><span>Pendiente de revisar</span><select value={review} onChange={e=>setReview(e.target.value as Exclude<Choice,"inherit">)}><option value="unchanged">No cambiar</option><option value="yes">Sí</option><option value="no">No</option></select></label>
      <label><span>Traspaso interno</span><select value={internalTransfer} onChange={e=>setInternalTransfer(e.target.value as Exclude<Choice,"inherit">)}><option value="unchanged">No cambiar</option><option value="yes">Sí</option><option value="no">No</option></select></label>
      <label><span>Duplicado</span><select value={duplicate} onChange={e=>setDuplicate(e.target.value as Exclude<Choice,"inherit">)}><option value="unchanged">No cambiar</option><option value="yes">Sí</option><option value="no">No</option></select></label>
      <label className="bulk-enabled-field wide"><span><input type="checkbox" checked={tagsEnabled} onChange={e=>setTagsEnabled(e.target.checked)}/> Sustituir etiquetas</span><input value={tags} onChange={e=>setTags(e.target.value)} disabled={!tagsEnabled} placeholder="Separadas por comas; vacío = quitar todas"/></label>
    </div>
    <div className="bulk-editor-actions">
      <span>Máximo 200 movimientos por operación. Puedes deshacer el último lote mientras ninguno de sus movimientos haya cambiado después.</span>
      <button className="ghost" type="button" onClick={markReviewed} disabled={busy}>{busy?"Procesando…":"Marcar revisados"}</button>
      <button className="primary-action" type="submit" disabled={busy||!Object.keys(patch).length}>{busy?"Aplicando…":`Aplicar cambios a ${selectedCount}`}</button>
    </div>
  </form>;
}
