"use client";

import { formatEuro, formatInteger } from "@/lib/format/es-es";

import { FormEvent, useMemo, useState } from "react";
import type { MovementItem, MovementsResponse, TransactionDetail, TransactionDetailResponse } from "@/lib/financial/movements";
import { EMPTY_MOVEMENT_FILTERS, movementSearchParams, movementUrl, type MovementFilterState, type TriFilter } from "@/lib/financial/movement-query";
import { SplitEditor } from "./split-editor";
import { MovementDocuments } from "./movement-documents";

type Filters = MovementFilterState;
type EditState = {
  date:string; type:string; category:string; subcategory:string; normalizedConcept:string; counterparty:string; description:string;
  cashFlow:"inherit"|"include"|"exclude"; isInternalTransfer:boolean; isDuplicate:boolean; reconciled:"inherit"|"yes"|"no";
  needsReview:boolean; recurring:"inherit"|"yes"|"no"; tags:string; notes:string;
};


const dateFormat = new Intl.DateTimeFormat("es-ES", { day:"2-digit", month:"2-digit", year:"numeric" });
const yesValues = new Set(["sí","si","yes","true","1"]);
const noValues = new Set(["no","false","0"]);

function formatDate(value:string|null) {
  if (!value) return "—";
  return dateFormat.format(new Date(`${value}T12:00:00`));
}
function formatMoney(value:number|null) { return value == null ? "—" : formatEuro(value); }
function display(value:unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function tri(value:boolean|null|undefined):"inherit"|"yes"|"no" { return value == null ? "inherit" : value ? "yes" : "no"; }
function editState(transaction:TransactionDetail):EditState {
  return {
    date: transaction.effective.date || "",
    type: transaction.effective.type || "",
    category: transaction.effective.category || "",
    subcategory: transaction.effective.subcategory || "",
    normalizedConcept: transaction.effective.normalizedConcept || "",
    counterparty: transaction.effective.counterparty || "",
    description: transaction.effective.description || "",
    cashFlow: transaction.effective.cashFlowOverride == null ? "inherit" : transaction.effective.cashFlowOverride ? "include" : "exclude",
    isInternalTransfer: transaction.effective.isInternalTransfer,
    isDuplicate: transaction.effective.isDuplicate,
    reconciled: tri(transaction.effective.isReconciled),
    needsReview: transaction.effective.needsReview,
    recurring: tri(transaction.effective.isRecurring),
    tags: (transaction.effective.tags || []).join(", "),
    notes: transaction.effective.notes || "",
  };
}
function sourceBoolean(value:unknown):boolean|null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (yesValues.has(normalized)) return true;
  if (noValues.has(normalized)) return false;
  return null;
}

export function MovementsClient({ initialData, initialFilters }:{ initialData:MovementsResponse; initialFilters:MovementFilterState }) {
  const [pageData,setPageData] = useState(initialData);
  const [filters,setFilters] = useState<Filters>(initialFilters);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [message,setMessage] = useState<string|null>(null);
  const [selected,setSelected] = useState<TransactionDetail|null>(null);
  const [edit,setEdit] = useState<EditState|null>(null);
  const [detailLoading,setDetailLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const pages = Math.max(1, Math.ceil(pageData.total / pageData.pageSize));
  const range = useMemo(() => {
    if (!pageData.total) return "0 movimientos";
    const first=(pageData.page-1)*pageData.pageSize+1;
    const last=Math.min(pageData.total,pageData.page*pageData.pageSize);
    return `${formatInteger(first)}–${formatInteger(last)} de ${formatInteger(pageData.total)}`;
  },[pageData]);

  async function loadWith(next:Filters,page=1) {
    setLoading(true); setError(null);
    const q=movementSearchParams(next);
    q.set("page",String(page));
    q.set("pageSize",String(pageData.pageSize));
    q.set("sort",next.sort);
    q.set("facets","0");
    try {
      const response=await fetch(`/api/movements?${q.toString()}`,{cache:"no-store"});
      const body=await response.json() as Omit<MovementsResponse,"facets"> & {facets?:MovementsResponse["facets"];error?:string};
      if(!response.ok||!body.ok) throw new Error(body.error||"No se pudieron cargar los movimientos");
      setPageData({...body,facets:body.facets??pageData.facets} as MovementsResponse);
      window.history.replaceState(null,"",movementUrl(next));
    } catch(cause) { setError(cause instanceof Error?cause.message:"Error al cargar movimientos"); }
    finally { setLoading(false); }
  }

  async function submitFilters(event:FormEvent) { event.preventDefault(); await loadWith(filters,1); }
  async function clearFilters() {
    const cleared={...EMPTY_MOVEMENT_FILTERS};
    setFilters(cleared);
    await loadWith(cleared,1);
  }

  async function openMovement(id:string) {
    setDetailLoading(true); setError(null); setMessage(null);
    try {
      const response=await fetch(`/api/movements/${id}`,{cache:"no-store"});
      const body=await response.json() as TransactionDetailResponse & {error?:string};
      if(!response.ok||!body.ok) throw new Error(body.error||"No se pudo abrir el movimiento");
      setSelected(body.transaction); setEdit(editState(body.transaction));
    } catch(cause) { setError(cause instanceof Error?cause.message:"Error al abrir movimiento"); }
    finally { setDetailLoading(false); }
  }

  function buildPatch():Record<string,unknown> {
    if(!selected||!edit) return {};
    const patch:Record<string,unknown>={};
    if(edit.date!==(selected.effective.date||"")) patch.effectiveDate=edit.date||null;
    if(edit.type!==(selected.effective.type||"")) patch.type=edit.type.trim()||null;
    if(edit.category!==(selected.effective.category||"")) patch.category=edit.category.trim()||null;
    if(edit.subcategory!==(selected.effective.subcategory||"")) patch.subcategory=edit.subcategory.trim()||null;
    if(edit.normalizedConcept!==(selected.effective.normalizedConcept||"")) patch.normalizedConcept=edit.normalizedConcept.trim()||null;
    if(edit.counterparty!==(selected.effective.counterparty||"")) patch.counterparty=edit.counterparty.trim()||null;
    if(edit.description!==(selected.effective.description||"")) patch.description=edit.description.trim()||null;
    const currentCash=selected.effective.cashFlowOverride==null?"inherit":selected.effective.cashFlowOverride?"include":"exclude";
    if(edit.cashFlow!==currentCash) patch.cashFlowOverride=edit.cashFlow==="inherit"?null:edit.cashFlow==="include";
    if(edit.isInternalTransfer!==selected.effective.isInternalTransfer) patch.isInternalTransfer=edit.isInternalTransfer;
    if(edit.isDuplicate!==selected.effective.isDuplicate) patch.isDuplicate=edit.isDuplicate;
    if(edit.reconciled!==tri(selected.effective.isReconciled)) patch.isReconciled=edit.reconciled==="inherit"?null:edit.reconciled==="yes";
    if(edit.needsReview!==selected.effective.needsReview) patch.needsReview=edit.needsReview;
    if(edit.recurring!==tri(selected.effective.isRecurring)) patch.isRecurring=edit.recurring==="inherit"?null:edit.recurring==="yes";
    const tags=edit.tags.split(",").map(tag=>tag.trim()).filter(Boolean);
    if(JSON.stringify(tags)!==JSON.stringify(selected.effective.tags||[])) patch.tags=tags;
    if(edit.notes!==(selected.effective.notes||"")) patch.notes=edit.notes.trim()||null;
    return patch;
  }

  async function patchSelected(patch:Record<string,unknown>, successMessage:string) {
    if(!selected) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response=await fetch(`/api/movements/${selected.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(patch)});
      const body=await response.json() as TransactionDetailResponse & {error?:string};
      if(!response.ok||!body.ok) throw new Error(body.error||"No se pudo guardar el movimiento");
      setSelected(body.transaction); setEdit(editState(body.transaction)); setMessage(successMessage);
      await loadWith(filters,pageData.page);
    } catch(cause) { setError(cause instanceof Error?cause.message:"Error al guardar movimiento"); }
    finally { setSaving(false); }
  }

  async function save(event:FormEvent) {
    event.preventDefault();
    const patch=buildPatch();
    if(!Object.keys(patch).length){setMessage("No hay cambios que guardar.");return;}
    await patchSelected(patch,"Cambios guardados y registrados en el historial.");
  }

  async function restoreSource() {
    if(!selected) return;
    const sourceType=String(selected.source["Tipo de movimiento"]??"").trim().toLowerCase();
    const sourceReview=String(selected.source["Revisar"]??"").trim().toLowerCase();
    const sourceReconciled=sourceBoolean(selected.source["Conciliado"]);
    await patchSelected({
      category:null,subcategory:null,type:null,normalizedConcept:null,counterparty:null,description:null,effectiveDate:null,cashFlowOverride:null,
      isInternalTransfer:sourceType==="traspaso interno",isDuplicate:false,isReconciled:sourceReconciled,needsReview:yesValues.has(sourceReview),isRecurring:null,tags:[],notes:null,
    },"Ediciones restauradas al estado derivado del origen.");
  }

  return <div className="movements-module">
    <section className="movement-summary" aria-label="Resumen de movimientos">
      <div><strong>{formatInteger(pageData.total)}</strong><span>movimientos</span></div>
      <div><strong>{pageData.items.filter(item=>item.needsReview).length}</strong><span>visibles por revisar</span></div>
      <div><strong>{pageData.items.filter(item=>item.hasOverrides).length}</strong><span>visibles editados</span></div>
      <div><strong>{pageData.items.filter(item=>item.hasDocuments).length}</strong><span>visibles con documentos</span></div>
    </section>

    {filters.cashFlowOnly&&<div className="inline-alert info" role="status">Vista enlazada con Cash Flow: se excluyen ahorro, traspasos internos, duplicados, origen ausente y exclusiones manuales.</div>}

    <form className="movement-filters" onSubmit={submitFilters}>
      <label className="search-field"><span>Buscar</span><input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Concepto, comercio, ID, importe, etiquetas u OCR" /></label>
      <label><span>Cuenta</span><select value={filters.account} onChange={e=>setFilters({...filters,account:e.target.value})}><option value="">Todas</option>{pageData.facets.accounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label><span>Tipo</span><select value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})}><option value="">Todos</option>{pageData.facets.types.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <label><span>Categoría</span><select value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})}><option value="">Todas</option>{pageData.facets.categories.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <label><span>Orden</span><select value={filters.sort} onChange={e=>setFilters({...filters,sort:e.target.value as Filters["sort"]})}><option value="date_desc">Más recientes</option><option value="date_asc">Más antiguos</option><option value="amount_desc">Mayor importe</option><option value="amount_asc">Menor importe</option></select></label>
      <details className="advanced-filter-panel" open={Boolean(filters.merchant||filters.subcategory||filters.channel||filters.tag||filters.duplicate||filters.recurring||filters.internalTransfer||filters.reconciled||filters.documents||filters.splits||filters.from||filters.to||filters.min||filters.max)}>
        <summary>Filtros avanzados</summary>
        <div className="advanced-filter-grid">
          <label><span>Subcategoría</span><select value={filters.subcategory} onChange={e=>setFilters({...filters,subcategory:e.target.value})}><option value="">Todas</option>{pageData.facets.subcategories.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Comercio / contraparte</span><input list="movement-merchants" value={filters.merchant} onChange={e=>setFilters({...filters,merchant:e.target.value})} placeholder="Todos"/><datalist id="movement-merchants">{pageData.facets.merchants.map(value=><option key={value} value={value}/>)}</datalist></label>
          <label><span>Canal</span><select value={filters.channel} onChange={e=>setFilters({...filters,channel:e.target.value})}><option value="">Todos</option>{pageData.facets.channels.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Etiqueta</span><select value={filters.tag} onChange={e=>setFilters({...filters,tag:e.target.value})}><option value="">Todas</option>{pageData.facets.tags.map(value=><option key={value} value={value}/>)}</select></label>
          <label><span>Recurrente</span><select value={filters.recurring} onChange={e=>setFilters({...filters,recurring:e.target.value as TriFilter})}><option value="">Todos</option><option value="1">Sí</option><option value="0">No</option></select></label>
          <label><span>Duplicado</span><select value={filters.duplicate} onChange={e=>setFilters({...filters,duplicate:e.target.value as TriFilter})}><option value="">Todos</option><option value="1">Solo duplicados</option><option value="0">Excluir duplicados</option></select></label>
          <label><span>Entre cuentas</span><select value={filters.internalTransfer} onChange={e=>setFilters({...filters,internalTransfer:e.target.value as TriFilter})}><option value="">Todos</option><option value="1">Solo traspasos</option><option value="0">Excluir traspasos</option></select></label>
          <label><span>Conciliación</span><select value={filters.reconciled} onChange={e=>setFilters({...filters,reconciled:e.target.value as TriFilter})}><option value="">Todos</option><option value="1">Conciliados</option><option value="0">No conciliados</option></select></label>
          <label><span>Documentos</span><select value={filters.documents} onChange={e=>setFilters({...filters,documents:e.target.value as TriFilter})}><option value="">Todos</option><option value="1">Con documentos</option><option value="0">Sin documentos</option></select></label>
          <label><span>Divisiones</span><select value={filters.splits} onChange={e=>setFilters({...filters,splits:e.target.value as TriFilter})}><option value="">Todos</option><option value="1">Divididos</option><option value="0">Sin dividir</option></select></label>
          <label><span>Desde</span><input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/></label>
          <label><span>Hasta</span><input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></label>
          <label><span>Importe mínimo</span><input inputMode="decimal" value={filters.min} onChange={e=>setFilters({...filters,min:e.target.value})} placeholder="-100,00"/></label>
          <label><span>Importe máximo</span><input inputMode="decimal" value={filters.max} onChange={e=>setFilters({...filters,max:e.target.value})} placeholder="100,00"/></label>
        </div>
      </details>
      <label className="check-filter"><input type="checkbox" checked={filters.review} onChange={e=>setFilters({...filters,review:e.target.checked})}/><span>Solo pendientes de revisar</span></label>
      <label className="check-filter"><input type="checkbox" checked={filters.cashFlowOnly} onChange={e=>setFilters({...filters,cashFlowOnly:e.target.checked})}/><span>Solo movimientos computables en Cash Flow</span></label>
      <div className="filter-actions"><button className="primary-action" type="submit" disabled={loading}>{loading?"Cargando…":"Aplicar filtros"}</button><button className="ghost" type="button" onClick={clearFilters} disabled={loading}>Limpiar</button></div>
    </form>

    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}

    <div className={`movement-table-wrap ${loading?"is-loading":""}`} aria-busy={loading}>
      <table className="movement-table">
        <thead><tr><th>Fecha</th><th>Movimiento</th><th>Categoría</th><th>Cuenta</th><th className="numeric">Importe</th><th>Estado</th></tr></thead>
        <tbody>{pageData.items.map(item=><MovementRow key={item.id} item={item} onOpen={openMovement}/>)}</tbody>
      </table>
      {!pageData.items.length&&<div className="empty-state"><strong>No hay movimientos con estos filtros.</strong><span>Prueba a limpiar algún criterio de búsqueda.</span></div>}
    </div>

    <div className="movement-cards">{pageData.items.map(item=><button key={item.id} className="movement-card" type="button" onClick={()=>openMovement(item.id)}><div><span>{formatDate(item.date)}</span><strong>{item.concept||item.counterparty||"Movimiento sin concepto"}</strong><small>{item.category||"Sin categoría"} · {item.account.name||"Sin cuenta"}</small>{item.hasDocuments&&<small>{item.documentCount} documento{item.documentCount===1?"":"s"}</small>}{item.hasSplits&&item.personalAmount!=null&&<small>Parte personal {formatMoney(item.personalAmount)}</small>}</div><div className="card-side"><b className={item.amount!=null&&item.amount<0?"negative":"positive"}>{formatMoney(item.amount)}</b><Status item={item}/></div></button>)}</div>

    <footer className="pagination"><span>{range}</span><div><button className="ghost" type="button" disabled={loading||pageData.page<=1} onClick={()=>loadWith(filters,pageData.page-1)}>Anterior</button><span>Página {pageData.page} de {pages}</span><button className="ghost" type="button" disabled={loading||pageData.page>=pages} onClick={()=>loadWith(filters,pageData.page+1)}>Siguiente</button></div></footer>

    {detailLoading&&<div className="detail-loading" role="status">Abriendo movimiento…</div>}
    {selected&&edit&&<div className="drawer-backdrop" role="presentation" onMouseDown={()=>!saving&&setSelected(null)}><aside className="movement-drawer" role="dialog" aria-modal="true" aria-labelledby="movement-editor-title" onMouseDown={event=>event.stopPropagation()}>
      <header className="drawer-head"><div><p className="eyebrow">{selected.sourceId}</p><h2 id="movement-editor-title">Editar movimiento</h2><p>{display(selected.source["Concepto original"])}</p></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={()=>setSelected(null)}>×</button></header>
      <div className="source-lock"><strong>Origen protegido</strong><span>Los campos bancarios originales son de solo lectura. Tus cambios se guardan aparte y quedan trazados.</span></div>
      <form className="movement-editor" onSubmit={save}>
        <div className="editor-grid">
          <label><span>Fecha efectiva</span><input type="date" value={edit.date} onChange={e=>setEdit({...edit,date:e.target.value})}/></label>
          <label><span>Tipo</span><select value={edit.type} onChange={e=>setEdit({...edit,type:e.target.value})}>{!pageData.facets.types.includes(edit.type)&&edit.type&&<option value={edit.type}>{edit.type}</option>}{pageData.facets.types.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Categoría</span><input list="movement-categories" value={edit.category} onChange={e=>setEdit({...edit,category:e.target.value})}/><datalist id="movement-categories">{pageData.facets.categories.map(value=><option key={value} value={value}/>)}</datalist></label>
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
        <div className="editor-actions"><button className="primary-action" type="submit" disabled={saving}>{saving?"Guardando…":"Guardar cambios"}</button><button className="ghost" type="button" onClick={restoreSource} disabled={saving}>Restaurar origen</button></div>
      </form>

      <SplitEditor transactionId={selected.id} sourceAmount={Number(selected.source["Importe (€)"]??0)} categories={pageData.facets.categories}/>
      <MovementDocuments key={selected.id} transaction={selected} onChanged={()=>loadWith(filters,pageData.page)}/>

      <details className="trace-panel"><summary>Dato original</summary><dl>{Object.entries(selected.source).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{display(value)}</dd></div>)}</dl></details>
      <details className="trace-panel" open={selected.history.length>0}><summary>Historial de cambios · {selected.history.length}</summary>{selected.history.length?<ol className="history-list">{selected.history.map(entry=><li key={entry.id}><div><strong>{entry.field.replace(/^app\./,"App · ").replace(/^source\./,"Origen · ")}</strong><time>{new Date(entry.changedAt).toLocaleString("es-ES")}</time></div><p><span>{display(entry.before)}</span><b>→</b><span>{display(entry.after)}</span></p><small>{entry.changeOrigin==="source_sync"?"Cambio detectado en la fuente":`Edición · ${entry.changedBy||"usuario"}`}</small></li>)}</ol>:<p className="muted-copy">Este movimiento aún no tiene cambios registrados.</p>}</details>
    </aside></div>}
  </div>;
}

function Status({item}:{item:MovementItem}) {
  if(item.sourceMissing) return <span className="status-badge warning">Origen ausente</span>;
  if(item.status==="new") return <span className="status-badge new">Nuevo</span>;
  if(item.needsReview) return <span className="status-badge warning">Revisar</span>;
  if(item.hasOverrides) return <span className="status-badge edited">Editado</span>;
  if(item.isInternalTransfer) return <span className="status-badge muted">Traspaso</span>;
  return <span className="status-badge ok">Correcto</span>;
}

function MovementRow({item,onOpen}:{item:MovementItem;onOpen:(id:string)=>void}) {
  return <tr>
    <td><span className="date-main">{formatDate(item.date)}</span><small>{item.time?item.time.slice(0,5):""}</small></td>
    <td><button className="movement-open" type="button" onClick={()=>onOpen(item.id)}><strong>{item.concept||item.counterparty||"Movimiento sin concepto"}</strong><span>{item.counterparty&&item.counterparty!==item.concept?item.counterparty:item.sourceId}</span>{item.hasDocuments&&<small>{item.documentCount} documento{item.documentCount===1?"":"s"}</small>}</button></td>
    <td><span>{item.category||"Sin categoría"}</span>{item.subcategory&&<small>{item.subcategory}</small>}</td>
    <td><span>{item.account.name||"Sin cuenta"}</span><small>{item.account.identifier||""}</small></td>
    <td className={`numeric amount ${item.amount!=null&&item.amount<0?"negative":"positive"}`}>{formatMoney(item.amount)}{item.hasSplits&&item.personalAmount!=null&&<small>Parte personal {formatMoney(item.personalAmount)}</small>}{item.balance!=null&&<small>Saldo {formatMoney(item.balance)}</small>}</td>
    <td><Status item={item}/></td>
  </tr>;
}