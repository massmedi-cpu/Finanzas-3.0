"use client";

import { formatEuro } from "@/lib/format/es-es";

import { useEffect, useMemo, useState } from "react";
import "./split-editor.css";

type Split = {
  id?: string;
  amount: number;
  category: string | null;
  subcategory: string | null;
  beneficiary: string | null;
  isPersonal: boolean;
  notes: string | null;
};
type SplitResponse = {
  ok: boolean;
  data?: { sourceAmount:number; splitTotal:number; personalTotal:number; splits:Split[] };
  error?: string;
};


const cents = (value:number) => Math.round((value + Number.EPSILON) * 100) / 100;
const blank = (amount:number):Split => ({ amount, category:null, subcategory:null, beneficiary:null, isPersonal:true, notes:null });

export function SplitEditor({transactionId,sourceAmount,categories}:{transactionId:string;sourceAmount:number;categories:string[]}) {
  const [rows,setRows] = useState<Split[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState<string|null>(null);
  const [error,setError] = useState<string|null>(null);

  const total = useMemo(()=>cents(rows.reduce((sum,row)=>sum+Number(row.amount||0),0)),[rows]);
  const difference = cents(sourceAmount-total);
  const valid = rows.length===0 || (rows.length>=2 && Math.abs(difference)<=0.01 && rows.every(row=>Number.isFinite(Number(row.amount)) && Number(row.amount)!==0 && Math.sign(Number(row.amount))===Math.sign(sourceAmount)));

  useEffect(()=>{void load();},[transactionId]);

  async function load(){
    setLoading(true);setError(null);
    try{
      const response=await fetch(`/api/movements/${transactionId}/splits`,{cache:"no-store"});
      const body=await response.json() as SplitResponse;
      if(!response.ok||!body.ok||!body.data) throw new Error(body.error||"No se pudieron cargar las divisiones");
      setRows(body.data.splits||[]);
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al cargar divisiones");}
    finally{setLoading(false);}
  }

  function startSplit(){
    const first=cents(sourceAmount/2);
    setRows([blank(first),blank(cents(sourceAmount-first))]);
    setMessage(null);setError(null);
  }
  function update(index:number,patch:Partial<Split>){setRows(current=>current.map((row,i)=>i===index?{...row,...patch}:row));}
  function addPart(){setRows(current=>[...current,blank(0)]);}
  function removePart(index:number){setRows(current=>current.filter((_,i)=>i!==index));}

  async function save(){
    if(!valid){setError(`Las partes deben sumar exactamente ${formatEuro(sourceAmount)} y mantener el mismo signo.`);return;}
    setSaving(true);setError(null);setMessage(null);
    try{
      const payload=rows.map(({amount,category,subcategory,beneficiary,isPersonal,notes})=>({amount:Number(amount),category:category?.trim()||null,subcategory:subcategory?.trim()||null,beneficiary:beneficiary?.trim()||null,isPersonal,notes:notes?.trim()||null}));
      const response=await fetch(`/api/movements/${transactionId}/splits`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({splits:payload})});
      const body=await response.json() as SplitResponse;
      if(!response.ok||!body.ok||!body.data) throw new Error(body.error||"No se pudieron guardar las divisiones");
      setRows(body.data.splits||[]);
      setMessage(rows.length?"División guardada y registrada en el historial.":"División eliminada; el movimiento original permanece intacto.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Error al guardar divisiones");}
    finally{setSaving(false);}
  }

  if(loading)return <section className="split-editor"><p className="muted-copy">Cargando división…</p></section>;
  return <section className="split-editor" aria-labelledby="split-editor-title">
    <div className="split-editor-head"><div><p className="eyebrow">MOVIMIENTO COMPARTIDO</p><h3 id="split-editor-title">Dividir movimiento</h3><p>El importe bancario original nunca se modifica. Las partes deben sumar {formatEuro(sourceAmount)}.</p></div>{rows.length===0?<button className="ghost" type="button" onClick={startSplit}>Crear división</button>:<button className="ghost" type="button" onClick={()=>setRows([])}>Quitar división</button>}</div>
    {error&&<div className="inline-alert error" role="alert">{error}</div>}
    {message&&<div className="inline-alert success" role="status">{message}</div>}
    {rows.length>0&&<>
      <datalist id="split-categories">{categories.map(value=><option key={value} value={value}/>)}</datalist>
      <div className="split-list">{rows.map((row,index)=><article className="split-row" key={row.id||index}>
        <div className="split-row-head"><strong>Parte {index+1}</strong><button className="split-remove" type="button" onClick={()=>removePart(index)} disabled={rows.length<=2} aria-label={`Eliminar parte ${index+1}`}>×</button></div>
        <div className="split-grid">
          <label>Importe<input type="number" step="0.01" inputMode="decimal" value={row.amount} onChange={e=>update(index,{amount:Number(e.target.value)})}/></label>
          <label>Categoría<input list="split-categories" value={row.category||""} onChange={e=>update(index,{category:e.target.value})}/></label>
          <label>Subcategoría<input value={row.subcategory||""} onChange={e=>update(index,{subcategory:e.target.value})}/></label>
          <label>Beneficiario<input value={row.beneficiary||""} onChange={e=>update(index,{beneficiary:e.target.value})}/></label>
          <label className="split-personal"><input type="checkbox" checked={row.isPersonal} onChange={e=>update(index,{isPersonal:e.target.checked})}/> Parte personal</label>
          <label className="split-notes">Notas<input value={row.notes||""} onChange={e=>update(index,{notes:e.target.value})}/></label>
        </div>
      </article>)}</div>
      <div className="split-totals"><span>Total partes <strong>{formatEuro(total)}</strong></span><span className={Math.abs(difference)<=0.01?"split-ok":"split-error"}>Diferencia <strong>{formatEuro(difference)}</strong></span></div>
      <div className="split-actions"><button className="ghost" type="button" onClick={addPart}>Añadir parte</button><button className="primary-action" type="button" onClick={save} disabled={saving||!valid}>{saving?"Guardando…":"Guardar división"}</button></div>
    </>}
    {rows.length===0&&<p className="muted-copy">Sin división. Puedes repartir el movimiento entre varias categorías o beneficiarios cuando sea un gasto compartido.</p>}
  </section>;
}
