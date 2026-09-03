"use client";

import { formatEuro, formatInteger } from "@/lib/format/es-es";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { MovementItem, MovementsResponse, TransactionDetail, TransactionDetailResponse } from "@/lib/financial/movements";
import { EMPTY_MOVEMENT_FILTERS, movementSearchParams, movementSelectionScopeKey, movementUrl, type MovementFilterState, type TriFilter } from "@/lib/financial/movement-query";
import { BulkMovementEditor, MovementDetailDrawer } from "./movement-lazy-tools";

type Filters = MovementFilterState;
type MovementSelectionResponse={ok:boolean;ids:string[];total:number;limit:number;truncated:boolean;error?:string};

const MAX_BULK_MOVEMENTS=200;
const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});

function formatDate(value:string|null){if(!value)return "—";return dateFormat.format(new Date(`${value}T12:00:00`));}
function formatMoney(value:number|null){return value==null?"—":formatEuro(value);}

export function MovementsClient({initialData,initialFilters}:{initialData:MovementsResponse;initialFilters:MovementFilterState}){
  const [pageData,setPageData]=useState(initialData);
  const [filters,setFilters]=useState<Filters>(initialFilters);
  const [appliedFilters,setAppliedFilters]=useState<Filters>(initialFilters);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [selected,setSelected]=useState<TransactionDetail|null>(null);
  const [selectedIds,setSelectedIds]=useState<Set<string>>(()=>new Set());
  const [detailLoading,setDetailLoading]=useState(false);
  const [bulkSaving,setBulkSaving]=useState(false);
  const [selectingFiltered,setSelectingFiltered]=useState(false);
  const [bulkEditorOpen,setBulkEditorOpen]=useState(false);
  const openRequestRef=useRef(0);
  const listRequestRef=useRef(0);
  const listAbortRef=useRef<AbortController|null>(null);
  const selectionScopeRef=useRef(movementSelectionScopeKey(initialFilters));
  const pages=Math.max(1,Math.ceil(pageData.total/pageData.pageSize));
  const range=useMemo(()=>{if(!pageData.total)return "0 movimientos";const first=(pageData.page-1)*pageData.pageSize+1;const last=Math.min(pageData.total,pageData.page*pageData.pageSize);return `${formatInteger(first)}–${formatInteger(last)} de ${formatInteger(pageData.total)}`;},[pageData]);
  const visibleIds=useMemo(()=>pageData.items.map(item=>item.id),[pageData.items]);
  const allVisibleSelected=visibleIds.length>0&&visibleIds.every(id=>selectedIds.has(id));
  const visibleSelectedCount=visibleIds.filter(id=>selectedIds.has(id)).length;
  const hiddenSelectedCount=Math.max(0,selectedIds.size-visibleSelectedCount);
  const visibleReviewCount=useMemo(()=>pageData.items.filter(item=>item.needsReview).length,[pageData.items]);
  const visibleDocumentCount=useMemo(()=>pageData.items.filter(item=>item.hasDocuments).length,[pageData.items]);

  useEffect(()=>{if(!selectedIds.size)setBulkEditorOpen(false)},[selectedIds.size]);
  useEffect(()=>()=>{listAbortRef.current?.abort();openRequestRef.current+=1},[]);

  async function loadWith(next:Filters,page=1){
    const requestId=++listRequestRef.current;
    listAbortRef.current?.abort();
    const controller=new AbortController();
    listAbortRef.current=controller;
    setLoading(true);setError(null);
    const q=movementSearchParams(next);
    q.set("page",String(page));q.set("pageSize",String(pageData.pageSize));q.set("sort",next.sort);q.set("facets","0");
    const nextSelectionScope=movementSelectionScopeKey(next);
    const selectionScopeChanged=nextSelectionScope!==selectionScopeRef.current;
    try{
      const response=await fetch(`/api/movements?${q.toString()}`,{cache:"no-store",signal:controller.signal});
      const body=await response.json() as Omit<MovementsResponse,"facets">&{facets?:MovementsResponse["facets"];error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudieron cargar los movimientos");
      if(requestId!==listRequestRef.current)return true;
      setPageData({...body,facets:body.facets??pageData.facets} as MovementsResponse);
      setAppliedFilters({...next});selectionScopeRef.current=nextSelectionScope;
      if(selectionScopeChanged&&selectedIds.size){setSelectedIds(new Set());setBulkEditorOpen(false);setMessage("Selección reiniciada porque cambió el conjunto de filtros. Así no se editarán movimientos que hayan quedado ocultos.");}
      window.history.replaceState(null,"",movementUrl(next));
      return true;
    }catch(cause){
      if(cause instanceof Error&&cause.name==="AbortError")return requestId!==listRequestRef.current;
      if(requestId===listRequestRef.current)setError(cause instanceof Error?cause.message:"Error al cargar movimientos");
      return false;
    }finally{
      if(requestId===listRequestRef.current){setLoading(false);if(listAbortRef.current===controller)listAbortRef.current=null;}
    }
  }

  async function submitFilters(event:FormEvent){event.preventDefault();await loadWith(filters,1);}
  async function clearFilters(){const cleared={...EMPTY_MOVEMENT_FILTERS};setFilters(cleared);await loadWith(cleared,1);}

  function toggleSelection(id:string,checked:boolean){
    if(bulkSaving||selectingFiltered)return;
    setSelectedIds(current=>{const next=new Set(current);if(!checked){next.delete(id);return next;}if(next.has(id))return next;if(next.size>=MAX_BULK_MOVEMENTS){setError(`Puedes editar como máximo ${MAX_BULK_MOVEMENTS} movimientos por lote.`);return current;}next.add(id);setError(null);return next;});
  }
  function toggleVisible(){
    if(bulkSaving||selectingFiltered)return;
    setSelectedIds(current=>{const next=new Set(current);if(allVisibleSelected){visibleIds.forEach(id=>next.delete(id));return next;}const missing=visibleIds.filter(id=>!next.has(id));if(next.size+missing.length>MAX_BULK_MOVEMENTS){setError(`La selección superaría el máximo de ${MAX_BULK_MOVEMENTS} movimientos.`);return current;}missing.forEach(id=>next.add(id));setError(null);return next;});
  }
  async function selectFiltered(){
    if(bulkSaving||selectingFiltered||!pageData.total)return;
    setSelectingFiltered(true);setError(null);setMessage(null);
    const q=movementSearchParams(appliedFilters);q.set("limit",String(MAX_BULK_MOVEMENTS));q.set("sort",appliedFilters.sort);
    try{
      const response=await fetch(`/api/movements/selection?${q.toString()}`,{cache:"no-store"});
      const body=await response.json() as MovementSelectionResponse;
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo seleccionar el conjunto filtrado");
      const ids=body.ids.slice(0,MAX_BULK_MOVEMENTS);setSelectedIds(new Set(ids));
      setMessage(body.truncated?`Seleccionados los primeros ${MAX_BULK_MOVEMENTS} de ${formatInteger(body.total)} movimientos filtrados. El límite seguro por lote sigue siendo ${MAX_BULK_MOVEMENTS}.`:`Seleccionados los ${formatInteger(ids.length)} movimientos que cumplen los filtros aplicados, aunque estén repartidos en varias páginas.`);
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al seleccionar movimientos filtrados");}finally{setSelectingFiltered(false);}
  }
  function clearBulkSelection(){setSelectedIds(new Set());setBulkEditorOpen(false);}

  async function applyBulk(patch:Record<string,unknown>){
    if(!selectedIds.size||!Object.keys(patch).length)return false;
    setBulkSaving(true);setError(null);setMessage(null);
    try{
      const response=await fetch("/api/movements/bulk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ids:[...selectedIds],patch})});
      const body=await response.json() as {ok?:boolean;updated?:number;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo aplicar la edición masiva");
      const updated=Number(body.updated||selectedIds.size);setSelectedIds(new Set());setBulkEditorOpen(false);
      const refreshed=await loadWith(appliedFilters,pageData.page);
      if(!refreshed){setError("Los cambios se guardaron, pero no se pudo actualizar la lista. Recarga la vista para confirmar el estado.");return true;}
      setMessage(`${updated} movimiento${updated===1?"":"s"} actualizado${updated===1?"":"s"} en una sola operación.`);return true;
    }catch(cause){setError(cause instanceof Error?cause.message:"Error en la edición masiva");return false;}finally{setBulkSaving(false);}
  }

  async function openMovement(id:string){
    const requestId=++openRequestRef.current;setDetailLoading(true);setError(null);setMessage(null);
    try{
      const response=await fetch(`/api/movements/${id}`,{cache:"no-store"});
      const body=await response.json() as TransactionDetailResponse&{error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo abrir el movimiento");
      if(requestId!==openRequestRef.current)return;setSelected(body.transaction);
    }catch(cause){if(requestId===openRequestRef.current)setError(cause instanceof Error?cause.message:"Error al abrir movimiento");}
    finally{if(requestId===openRequestRef.current)setDetailLoading(false);}
  }

  return <div className="movements-module">
    <section className="movement-summary" aria-label="Resumen de la vista">
      <div><strong>{formatInteger(pageData.total)}</strong><span>movimientos con estos filtros</span></div>
      <div><strong>{formatInteger(visibleReviewCount)}</strong><span>por revisar en esta página</span></div>
      <div><strong>{formatInteger(visibleDocumentCount)}</strong><span>con documentos en esta página</span></div>
    </section>

    {appliedFilters.cashFlowOnly&&<div className="inline-alert info" role="status">Vista enlazada con Cash Flow: se excluyen ahorro, traspasos internos, duplicados, origen ausente y exclusiones manuales.</div>}

    <form className="movement-filters" onSubmit={submitFilters}>
      <label className="search-field"><span>Buscar</span><input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Concepto, comercio, ID, importe, etiquetas u OCR"/></label>
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
          <label><span>Etiqueta</span><select value={filters.tag} onChange={e=>setFilters({...filters,tag:e.target.value})}><option value="">Todas</option>{pageData.facets.tags.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
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
      <div className="filter-actions"><button className="primary-action" type="submit" disabled={loading||bulkSaving||selectingFiltered} aria-busy={loading||undefined}>{loading?"Cargando…":"Aplicar filtros"}</button><button className="ghost" type="button" onClick={clearFilters} disabled={loading||bulkSaving||selectingFiltered}>Limpiar</button></div>
    </form>

    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}

    <div className="movement-selection-toolbar" aria-busy={bulkSaving||selectingFiltered||undefined}>
      <div className="movement-selection-scope"><button className="ghost" type="button" onClick={toggleVisible} disabled={loading||bulkSaving||selectingFiltered||!visibleIds.length}>{allVisibleSelected?"Quitar visibles":"Seleccionar visibles"}</button><button className="ghost" type="button" onClick={()=>void selectFiltered()} disabled={loading||bulkSaving||selectingFiltered||!pageData.total}>{selectingFiltered?"Seleccionando…":pageData.total>MAX_BULK_MOVEMENTS?`Seleccionar primeros ${MAX_BULK_MOVEMENTS} filtrados`:"Seleccionar todos los filtrados"}</button></div>
      <span>{selectedIds.size?`${selectedIds.size} seleccionado${selectedIds.size===1?"":"s"}${hiddenSelectedCount?` · ${hiddenSelectedCount} fuera de esta página`:""} · máximo ${MAX_BULK_MOVEMENTS}`:"Selecciona esta página o todo el conjunto filtrado para resolverlo o editarlo junto"}</span>
      {selectedIds.size>0&&<div className="movement-selection-actions"><button className="text-button" type="button" onClick={()=>void applyBulk({needsReview:false})} disabled={bulkSaving||selectingFiltered}>Marcar revisados</button><button className="text-button" type="button" onClick={()=>void applyBulk({isReconciled:true})} disabled={bulkSaving||selectingFiltered}>Marcar conciliados</button><button className="secondary-action" type="button" onClick={()=>setBulkEditorOpen(open=>!open)} disabled={bulkSaving||selectingFiltered} aria-expanded={bulkEditorOpen} aria-controls="bulk-movement-editor">{bulkEditorOpen?"Ocultar editor":"Editar lote"}</button><button className="ghost" type="button" onClick={clearBulkSelection} disabled={bulkSaving||selectingFiltered}>Limpiar selección</button></div>}
    </div>

    {selectedIds.size>0&&bulkEditorOpen&&<BulkMovementEditor selectedCount={selectedIds.size} categories={pageData.facets.categories} types={pageData.facets.types} busy={bulkSaving||selectingFiltered} onApply={applyBulk} onClear={clearBulkSelection} onClose={()=>setBulkEditorOpen(false)}/>} 

    <div className={`movement-table-wrap ${loading?"is-loading":""}`} aria-busy={loading}>
      <table className="movement-table">
        <thead><tr><th className="selection-cell"><span className="sr-only">Seleccionar</span></th><th>Fecha</th><th>Movimiento</th><th>Categoría</th><th>Cuenta</th><th className="numeric">Importe</th><th>Estado</th></tr></thead>
        <tbody>{pageData.items.map(item=><MovementRow key={item.id} item={item} onOpen={openMovement} selected={selectedIds.has(item.id)} onToggle={toggleSelection} selectionDisabled={bulkSaving||selectingFiltered}/>)}</tbody>
      </table>
      {!pageData.items.length&&<div className="empty-state"><strong>No hay movimientos con estos filtros.</strong><span>Prueba a limpiar algún criterio de búsqueda.</span></div>}
    </div>

    <footer className="pagination"><span>{range}</span><div><button className="ghost" type="button" disabled={loading||bulkSaving||selectingFiltered||pageData.page<=1} onClick={()=>loadWith(appliedFilters,pageData.page-1)}>Anterior</button><span>Página {pageData.page} de {pages}</span><button className="ghost" type="button" disabled={loading||bulkSaving||selectingFiltered||pageData.page>=pages} onClick={()=>loadWith(appliedFilters,pageData.page+1)}>Siguiente</button></div></footer>

    {detailLoading&&<div className="detail-loading" role="status">Abriendo movimiento…</div>}
    {selected&&<MovementDetailDrawer key={selected.id} transaction={selected} categories={pageData.facets.categories} types={pageData.facets.types} onClose={()=>setSelected(null)} onRefresh={()=>loadWith(appliedFilters,pageData.page)} onError={setError} onMessage={setMessage}/>} 
  </div>;
}

function Status({item}:{item:MovementItem}){
  if(item.sourceMissing)return <span className="status-badge warning">Origen ausente</span>;
  if(item.status==="new")return <span className="status-badge info">Nuevo</span>;
  if(item.needsReview)return <span className="status-badge warning">Revisar</span>;
  if(item.hasOverrides)return <span className="status-badge edited">Editado</span>;
  if(item.isInternalTransfer)return <span className="status-badge muted">Traspaso</span>;
  return <span className="status-badge ok">Correcto</span>;
}

function MovementRow({item,onOpen,selected,onToggle,selectionDisabled}:{item:MovementItem;onOpen:(id:string)=>void;selected:boolean;onToggle:(id:string,checked:boolean)=>void;selectionDisabled:boolean}){
  return <tr className={selected?"is-selected":""}>
    <td className="selection-cell"><input type="checkbox" checked={selected} disabled={selectionDisabled} onChange={e=>onToggle(item.id,e.target.checked)} aria-label={`Seleccionar ${item.concept||item.counterparty||item.sourceId}`}/></td>
    <td className="movement-date-cell"><span className="date-main">{formatDate(item.date)}</span><small>{item.time?item.time.slice(0,5):""}</small></td>
    <td className="movement-main-cell"><button className="movement-open" type="button" onClick={()=>onOpen(item.id)}><strong>{item.concept||item.counterparty||"Movimiento sin concepto"}</strong><span>{item.counterparty&&item.counterparty!==item.concept?item.counterparty:item.sourceId}</span>{item.hasDocuments&&<small>{item.documentCount} documento{item.documentCount===1?"":"s"}</small>}</button></td>
    <td className="movement-category-cell"><span>{item.category||"Sin categoría"}</span>{item.subcategory&&<small>{item.subcategory}</small>}</td>
    <td className="movement-account-cell"><span>{item.account.name||"Sin cuenta"}</span><small>{item.account.identifier||""}</small></td>
    <td className={`movement-amount-cell numeric amount ${item.amount!=null&&item.amount<0?"negative":"positive"}`}>{formatMoney(item.amount)}{item.hasSplits&&item.personalAmount!=null&&<small>Parte personal {formatMoney(item.personalAmount)}</small>}{item.balance!=null&&<small>Saldo {formatMoney(item.balance)}</small>}</td>
    <td className="movement-status-cell"><Status item={item}/></td>
  </tr>;
}
