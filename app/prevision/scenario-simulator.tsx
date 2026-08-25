"use client";

import { formatEuro } from "@/lib/format/es-es";

import { FormEvent, useMemo, useState } from "react";
import type { ForecastScenarioFrequency, ForecastScenarioResult } from "@/lib/financial/forecast";


const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",year:"numeric"});
const formatDate=(v:string|null)=>v?dateFmt.format(new Date(`${v}T12:00:00`)):"—";

type FormState={title:string;date:string;direction:"expense"|"income";amount:string;frequency:ForecastScenarioFrequency;interval:string;occurrences:string;days:string};

export function ScenarioSimulator({startDate,initialDays}:{startDate:string;initialDays:number}){
  const [form,setForm]=useState<FormState>({title:"",date:startDate,direction:"expense",amount:"",frequency:"once",interval:"1",occurrences:"1",days:String(initialDays)});
  const [result,setResult]=useState<ForecastScenarioResult|null>(null);
  const [loading,setLoading]=useState(false);const [error,setError]=useState<string|null>(null);
  const amount=useMemo(()=>Math.abs(Number(form.amount.replace(",","."))),[form.amount]);
  const delta=result?.scenario.delta??0;

  async function simulate(event:FormEvent){
    event.preventDefault();setError(null);
    if(!form.date||!Number.isFinite(amount)||amount<=0){setError("Indica una fecha y un importe válidos.");return;}
    setLoading(true);
    try{
      const response=await fetch("/api/forecast/scenario",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({start:startDate,days:Number(form.days),title:form.title.trim()||"Escenario",date:form.date,amount:form.direction==="expense"?-amount:amount,frequency:form.frequency,interval:Number(form.interval),occurrences:Number(form.occurrences)})});
      const json=await response.json();if(!response.ok)throw new Error(json.error||"No se pudo calcular el escenario");setResult(json as ForecastScenarioResult);
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo calcular el escenario");}
    finally{setLoading(false);}
  }

  return <section className="forecast-panel scenario-panel" aria-labelledby="scenario-title">
    <div className="forecast-panel-head"><div><p className="eyebrow">SIMULADOR · NO GUARDA DATOS</p><h2 id="scenario-title">¿Qué pasa si…?</h2></div><span className="pill">solo lectura</span></div>
    <p className="scenario-intro">Superpone un ingreso o gasto hipotético a la previsión estimada, incluidos los patrones históricos. No crea movimientos, no guarda previsiones y no utiliza el ahorro para cubrir déficits.</p>
    <form className="scenario-form" onSubmit={simulate}>
      <label className="wide"><span>Escenario</span><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ej. Comprar un móvil" maxLength={120}/></label>
      <label><span>Fecha inicial</span><input type="date" min={startDate} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
      <label><span>Tipo</span><select value={form.direction} onChange={e=>setForm({...form,direction:e.target.value as FormState["direction"]})}><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
      <label><span>Importe (€)</span><input inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="500,00"/></label>
      <label><span>Frecuencia</span><select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value as ForecastScenarioFrequency})}><option value="once">Una vez</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option><option value="yearly">Anual</option></select></label>
      {form.frequency!=="once"&&<><label><span>Intervalo</span><input type="number" min="1" max="12" value={form.interval} onChange={e=>setForm({...form,interval:e.target.value})}/></label><label><span>N.º de veces</span><input type="number" min="1" max="60" value={form.occurrences} onChange={e=>setForm({...form,occurrences:e.target.value})}/></label></>}
      <label><span>Horizonte</span><select value={form.days} onChange={e=>setForm({...form,days:e.target.value})}><option value="30">30 días</option><option value="60">60 días</option><option value="90">90 días</option><option value="180">180 días</option><option value="365">365 días</option></select></label>
      <div className="scenario-actions"><button className="primary-action" type="submit" disabled={loading}>{loading?"Calculando…":"Simular"}</button>{result&&<button className="ghost" type="button" onClick={()=>setResult(null)}>Limpiar resultado</button>}</div>
    </form>
    {error&&<div className="forecast-feedback" role="alert">{error}</div>}
    {result&&<div className="scenario-result">
      <div className="scenario-comparison">
        <article><span>Saldo actual</span><strong>{formatEuro(result.currentBalance)}</strong><small>Ahorro aparte: {formatEuro(result.savingsBalance)}</small></article>
        <article><span>Base prevista</span><strong>{formatEuro(result.baseline.projectedBalance)}</strong><small>Mínimo {formatEuro(result.baseline.lowestBalance)}</small></article>
        <article className={delta<0?"warning":"good"}><span>Con escenario</span><strong>{formatEuro(result.scenario.projectedBalance)}</strong><small>Mínimo {formatEuro(result.scenario.lowestBalance)}</small></article>
        <article className={delta<0?"danger":"good"}><span>Impacto</span><strong className={delta<0?"negative":"positive"}>{formatEuro(delta)}</strong><small>{result.scenario.events.length} evento{result.scenario.events.length===1?"":"s"} hipotético{result.scenario.events.length===1?"":"s"}</small></article>
      </div>
      {result.scenario.firstNegativeDate&&<div className="scenario-warning" role="status"><strong>Riesgo de saldo negativo</strong><span>El escenario cruza por debajo de 0 € el {formatDate(result.scenario.firstNegativeDate)}. El ahorro no se usa automáticamente.</span></div>}
      <div className="scenario-events"><div className="panel-head"><div><p className="eyebrow">EVENTOS HIPOTÉTICOS</p><h3>{result.scenario.title}</h3></div><span className="pill">impacto {formatEuro(delta)}</span></div>{result.scenario.events.map(event=><div key={event.id}><span>{formatDate(event.date)}</span><strong className={event.amount<0?"negative":"positive"}>{formatEuro(event.amount)}</strong></div>)}</div>
      <p className="scenario-proof">Resultado temporal. `readOnly = {String(result.rules.readOnly)}` · ahorro usado = {result.rules.savingsUsed?"sí":"no"} · previsiones oficiales modificadas = {result.rules.officialForecastsModified?"sí":"no"}.</p>
    </div>}
  </section>;
}
