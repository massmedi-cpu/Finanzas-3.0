"use client";

import { FormEvent,useState } from "react";
import type { TransactionDetail,TransactionDetailResponse } from "@/lib/financial/movements";
import { MovementDocuments } from "./movement-documents";
import { SplitEditor } from "./split-editor";

type EditState={
  date:string;type:string;category:string;subcategory:string;normalizedConcept:string;counterparty:string;description:string;
  cashFlow:"inherit"|"include"|"exclude";isInternalTransfer:boolean;isDuplicate:boolean;reconciled:"inherit"|"yes"|"no";
  needsReview:boolean;recurring:"inherit"|"yes"|"no";tags:string;notes:string;
};

type Props={
  transaction:TransactionDetail;
  categories:string[];
  types:string[];
  onClose:()=>void;
  onRefresh:()=>Promise<boolean>;
  onError:(message:string|null)=>void;
  onMessage:(message:string|null)=>void;
};

const yesValues=new Set(["sí","si","yes","true","1"]);
const noValues=new Set(["no","false","0"]);

function display(value:unknown){
  if(value===null||value===undefined||value==="")return "—";
  if(typeof value==="boolean")return value?"Sí":"No";
  if(Array.isArray(value))return value.length?value.join(", "):"—";
  if(typeof value==="object")return JSON.stringify(value);
  return String(value);
}
function tri(value:boolean|null|undefined):"inherit"|"yes"|"no"{return value==null?"inherit":value?"yes":"no"}
function editState(transaction:TransactionDetail):EditState{
  return{
    date:transaction.effective.date||"",
    type:transaction.effective.type||"",
    category:transaction.effective.category||"",
    subcategory:transaction.effective.subcategory||"",
    normalizedConcept:transaction.effective.normalizedConcept||"",
    counterparty:transaction.effective.counterparty||"",
    description:transaction.effective.description||"",
    cashFlow:transaction.effective.cashFlowOverride==null?"inherit":transaction.effective.cashFlowOverride?"include":"exclude",
    isInternalTransfer:transaction.effective.isInternalTransfer,
    isDuplicate:transaction.effective.isDuplicate,
    reconciled:tri(transaction.effective.isReconciled),
    needsReview:transaction.effective.needsReview,
    recurring:tri(transaction.effective.isRecurring),
    tags:(transaction.effective.tags||[]).join(", "),
    notes:transaction.effective.notes||"",
  };
}
function sourceBoolean(value:unknown):boolean|null{
  const normalized=String(value??"").trim().toLowerCase();
  if(yesValues.has(normalized))return true;
  if(noValues.has(normalized))return false;
  return null;
}

export function MovementDetailDrawer({transaction,categories,types,onClose,onRefresh,onError,onMessage}:Props){
  const [current,setCurrent]=useState(transaction);
  const [edit,setEdit]=useState<EditState>(()=>editState(transaction));
  const [saving,setSaving]=useState(false);

  function buildPatch():Record<string,unknown>{
    const patch:Record<string,unknown>={};
    if(edit.date!==(current.effective.date||""))patch.effectiveDate=edit.date||null;
    if(edit.type!==(current.effective.type||""))patch.type=edit.type.trim()||null;
    if(edit.category!==(current.effective.category||""))patch.category=edit.category.trim()||null;
    if(edit.subcategory!==(current.effective.subcategory||""))patch.subcategory=edit.subcategory.trim()||null;
    if(edit.normalizedConcept!==(current.effective.normalizedConcept||""))patch.normalizedConcept=edit.normalizedConcept.trim()||null;
    if(edit.counterparty!==(current.effective.counterparty||""))patch.counterparty=edit.counterparty.trim()||null;
    if(edit.description!==(current.effective.description||""))patch.description=edit.description.trim()||null;
    const currentCash=current.effective.cashFlowOverride==null?"inherit":current.effective.cashFlowOverride?"include":"exclude";
    if(edit.cashFlow!==currentCash)patch.cashFlowOverride=edit.cashFlow==="inherit"?null:edit.cashFlow==="include";
    if(edit.isInternalTransfer!==current.effective.isInternalTransfer)patch.isInternalTransfer=edit.isInternalTransfer;
    if(edit.isDuplicate!==current.effective.isDuplicate)patch.isDuplicate=edit.isDuplicate;
    if(edit.reconciled!==tri(current.effective.isReconciled))patch.isReconciled=edit.reconciled==="inherit"?null:edit.reconciled==="yes";
    if(edit.needsReview!==current.effective.needsReview)patch.needsReview=edit.needsReview;
    if(edit.recurring!==tri(current.effective.isRecurring))patch.isRecurring=edit.recurring==="inherit"?null:edit.recurring==="yes";
    const tags=edit.tags.split(",").map(tag=>tag.trim()).filter(Boolean);
    if(JSON.stringify(tags)!==JSON.stringify(current.effective.tags||[]))patch.tags=tags;
    if(edit.notes!==(current.effective.notes||""))patch.notes=edit.notes.trim()||null;
    return patch;
  }

  async function patchSelected(patch:Record<string,unknown>,successMessage:string){
    setSaving(true);onError(null);onMessage(null);
    try{
      const response=await fetch(`/api/movements/${current.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(patch)});
      const body=await response.json() as TransactionDetailResponse&{error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo guardar el movimiento");
      setCurrent(body.transaction);setEdit(editState(body.transaction));
      const refreshed=await onRefresh();
      if(!refreshed){onError("El cambio se guardó, pero no se pudo actualizar la lista. Cierra y vuelve a abrir la vista si necesitas confirmar el estado.");return;}
      onMessage(successMessage);
    }catch(cause){onError(cause instanceof Error?cause.message:"Error al guardar movimiento")}
    finally{setSaving(false)}
  }

  async function save(event:FormEvent){
    event.preventDefault();
    const patch=buildPatch();
    if(!Object.keys(patch).length){onError(null);onMessage("No hay cambios que guardar.");return;}
    await patchSelected(patch,"Cambios guardados y registrados en el historial.");
  }

  async function restoreSource(){
    const sourceType=String(current.source["Tipo de movimiento"]??"").trim().toLowerCase();
    const sourceReview=String(current.source["Revisar"]??"").trim().toLowerCase();
    const sourceReconciled=sourceBoolean(current.source["Conciliado"]);
    await patchSelected({
      category:null,subcategory:null,type:null,normalizedConcept:null,counterparty:null,description:null,effectiveDate:null,cashFlowOverride:null,
      isInternalTransfer:sourceType==="traspaso interno",isDuplicate:false,isReconciled:sourceReconciled,needsReview:yesValues.has(sourceReview),isRecurring:null,tags:[],notes:null,
    },"Ediciones restauradas al estado derivado del origen.");
  }

  return <div className="drawer-backdrop" role="presentation" onMouseDown={()=>!saving&&onClose()}><aside className="movement-drawer" role="dialog" aria-modal="true" aria-labelledby="movement-editor-title" aria-busy={saving||undefined} onMouseDown={event=>event.stopPropagation()}>
    <header className="drawer-head"><div><p className="eyebrow">{current.sourceId}</p><h2 id="movement-editor-title">Editar movimiento</h2><p>{display(current.source["Concepto original"])}</p></div><button className="icon-button" type="button" aria-label="Cerrar" disabled={saving} onClick={onClose}>×</button></header>
    <div className="source-lock"><strong>Origen protegido</strong><span>Los campos bancarios originales son de solo lectura. Tus cambios se guardan aparte y quedan trazados.</span></div>
    <form className="movement-editor" onSubmit={save}>
      <div className="editor-grid">
        <label><span>Fecha efectiva</span><input type="date" value={edit.date} onChange={e=>setEdit({...edit,date:e.target.value})}/></label>
        <label><span>Tipo</span><select value={edit.type} onChange={e=>setEdit({...edit,type:e.target.value})}>{!types.includes(edit.type)&&edit.type&&<option value={edit.type}>{edit.type}</option>}{types.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Categoría</span><input list="movement-categories" value={edit.category} onChange={e=>setEdit({...edit,category:e.target.value})}/><datalist id="movement-categories">{categories.map(value=><option key={value} value={value}/>)}</datalist></label>
        <label><span>Subcategoría</span><input value={edit.subcategory} onChange={e=>setEdit({...edit,subcategory:e.target.value})}/></label>
        <label className="wide"><span>Concepto normalizado</span><input value={edit.normalizedConcept} onChange={e=>setEdit({...edit,normalizedConcept:e.target.value})}/></label>
        <label className="wide"><span>Comercio o contraparte</span><input value={edit.counterparty} onChange={e=>setEdit({...edit,counterparty:e.target.value})}/></label>
        <label className="wide"><span>Descripción</span><textarea rows={2} value={edit.description} onChange={e=>setEdit({...edit,description:e.target.value})}/></label>
        <label><span>Cash Flow</span><select value={edit.cashFlow} onChange={e=>setEdit({...edit,cashFlow:e.target.value as EditState["cashFlow"]})}><option value="inherit">Automático según reglas</option><option value="include">Incluir manualmente</option><option value="exclude">Excluir manualmente</option></select></label>
        <label><span>Conciliado</span><select value={edit.reconciled} onChange={e=>setEdit({...edit,reconciled:e.target.value as EditState["reconciled"]})}><option value="inherit">Automático / según origen</option><option value="yes">Marcar como conciliado</option><option value="no">Marcar como no conciliado</option></select></label>
        <label><span>Recurrente</span><select value={edit.recurring} onChange={e=>setEdit({...edit,recurring:e.target.value as EditState["recurring"]})}><option value="inherit">No indicado</option><option value="yes">Sí, se repite</option><option value="no">No, es puntual</option></select></label>
        <label className="wide"><span>Etiquetas <small>separadas por comas</small></span><input value={edit.tags} onChange={e=>setEdit({...edit,tags:e.target.value})}/></label>
        <label className="wide"><span>Notas de Financial App</span><textarea rows={3} value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})}/></label>
      </div>
      <div className="flag-grid"><label><input type="checkbox" checked={edit.isInternalTransfer} onChange={e=>setEdit({...edit,isInternalTransfer:e.target.checked})}/> Traspaso interno</label><label><input type="checkbox" checked={edit.isDuplicate} onChange={e=>setEdit({...edit,isDuplicate:e.target.checked})}/> Duplicado</label><label><input type="checkbox" checked={edit.needsReview} onChange={e=>setEdit({...edit,needsReview:e.target.checked})}/> Pendiente de revisar</label></div>
      <div className="editor-actions"><button className="primary-action" type="submit" disabled={saving} aria-busy={saving||undefined}>{saving?"Guardando…":"Guardar cambios"}</button><button className="ghost" type="button" onClick={()=>void restoreSource()} disabled={saving}>Restaurar origen</button></div>
    </form>

    <SplitEditor transactionId={current.id} sourceAmount={Number(current.source["Importe (€)"]??0)} categories={categories}/>
    <MovementDocuments key={current.id} transaction={current} onChanged={()=>void onRefresh()}/>

    <details className="trace-panel"><summary>Dato original</summary><dl>{Object.entries(current.source).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{display(value)}</dd></div>)}</dl></details>
    <details className="trace-panel" open={current.history.length>0}><summary>Historial de cambios · {current.history.length}</summary>{current.history.length?<ol className="history-list">{current.history.map(entry=><li key={entry.id}><div><strong>{entry.field.replace(/^app\./,"App · ").replace(/^source\./,"Origen · ")}</strong><time>{new Date(entry.changedAt).toLocaleString("es-ES")}</time></div><p><span>{display(entry.before)}</span><b>→</b><span>{display(entry.after)}</span></p><small>{entry.changeOrigin==="source_sync"?"Cambio detectado en la fuente":`Edición · ${entry.changedBy||"usuario"}`}</small></li>)}</ol>:<p className="muted-copy">Este movimiento aún no tiene cambios registrados.</p>}</details>
  </aside></div>;
}
