"use client";

import { FormEvent, useState } from "react";
import { formatEuro } from "@/lib/format/es-es";
import type { MovementItem, MovementsResponse } from "@/lib/financial/movements";

const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
function formatDate(value:string|null){return value?dateFormat.format(new Date(`${value}T12:00:00`)):"—";}
function formatMoney(value:number|null){return value==null?"—":formatEuro(value);}

export function ArchiveMovementPicker({documentId,linkedSourceIds,onChanged}:{documentId:string;linkedSourceIds:string[];onChanged:()=>void|Promise<void>}){
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState("");
  const [items,setItems]=useState<MovementItem[]>([]);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  async function load(query=search){
    setLoading(true);setError(null);
    try{
      const params=new URLSearchParams({page:"1",pageSize:"25",sort:"date_desc",facets:"0"});
      if(query.trim())params.set("search",query.trim());
      const response=await fetch(`/api/movements?${params.toString()}`,{cache:"no-store"});
      const body=await response.json() as MovementsResponse & {error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudieron cargar los movimientos");
      const linked=new Set(linkedSourceIds);
      setItems(body.items.filter(item=>!linked.has(item.sourceId)));
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudieron cargar los movimientos");}
    finally{setLoading(false);}
  }

  async function toggle(){const next=!open;setOpen(next);if(next&&!items.length)await load("");}
  async function submit(event:FormEvent){event.preventDefault();await load();}
  async function link(item:MovementItem){
    setBusy(item.sourceId);setError(null);
    try{
      const response=await fetch(`/api/archive/${documentId}/links`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceId:item.sourceId})});
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo vincular el movimiento");
      await onChanged();setOpen(false);
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo vincular el movimiento");}
    finally{setBusy(null);}
  }

  return <div className="archive-manual-link">
    <button className="primary-action" type="button" onClick={toggle} disabled={busy!==null}>{open?"Cerrar selector":"Vincular a movimiento"}</button>
    {open&&<section className="manual-link-picker" aria-label="Elegir movimiento">
      <form className="link-picker-toolbar" onSubmit={submit}><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar movimiento por comercio, concepto, importe o ID"/><button className="ghost" type="submit" disabled={loading}>{loading?"Buscando…":"Buscar"}</button></form>
      <p className="muted-copy">Selecciona el movimiento real al que corresponde esta factura o ticket. Puedes desvincularlo después.</p>
      {error&&<div className="inline-alert error" role="alert">{error}</div>}
      <div className="link-picker-list">{items.map(item=><div key={item.id}><span><strong>{item.counterparty||item.concept||item.sourceOriginalConcept||item.sourceId}</strong><small>{formatDate(item.date)} · {formatMoney(item.personalAmount??item.amount)} · {item.sourceId}</small></span><button className="primary-action" type="button" onClick={()=>link(item)} disabled={busy!==null}>{busy===item.sourceId?"Vinculando…":"Vincular"}</button></div>)}{!loading&&!items.length&&<p className="muted-copy">No hay movimientos disponibles con esa búsqueda.</p>}</div>
    </section>}
  </div>;
}
