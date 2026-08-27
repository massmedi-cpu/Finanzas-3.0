"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatEuro, formatInteger, formatNumber, formatPercent, formatSignedPercent } from "@/lib/format/es-es";
import type { ActionableIntelligence, ActionableState, AnomalySignal, OpportunitySignal, RecurringSignal, RisingSignal } from "@/lib/financial/actionable-intelligence";

const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
const fmtDate=(value:string)=>dateFmt.format(new Date(`${value}T12:00:00`));

type Action="resolved"|"dismissed"|"snoozed";

export function IntelligenceClient({initialData}:{initialData:ActionableIntelligence}){
  const router=useRouter();
  const [busy,setBusy]=useState<string|null>(null);
  const [feedback,setFeedback]=useState<string>("");

  async function act(key:string,action:Action){
    setBusy(key);setFeedback("");
    try{
      const response=await fetch("/api/control",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"alert",key,action,days:7})});
      if(!response.ok)throw new Error("No se pudo actualizar la señal");
      setFeedback(action==="snoozed"?"Señal pospuesta 7 días.":action==="resolved"?"Señal marcada como revisada.":"Señal ocultada.");
      router.refresh();
    }catch(error){setFeedback(error instanceof Error?error.message:"No se pudo actualizar la señal");}
    finally{setBusy(null);}
  }

  const Actions=({keyValue,state,resolve=false,dismiss=false}:{keyValue:string;state:ActionableState;resolve?:boolean;dismiss?:boolean})=><div className="intelligence-actions">
    <button className="ghost" type="button" disabled={busy===keyValue||state==="snoozed"} onClick={()=>act(keyValue,"snoozed")}>Posponer 7 días</button>
    {resolve&&<button className="ghost" type="button" disabled={busy===keyValue} onClick={()=>act(keyValue,"resolved")}>Marcar revisado</button>}
    {dismiss&&<button className="ghost" type="button" disabled={busy===keyValue} onClick={()=>act(keyValue,"dismissed")}>Ocultar</button>}
  </div>;

  const Empty=({children}:{children:string})=><div className="intelligence-empty"><strong>Sin señales.</strong><span>{children}</span></div>;

  return <div className="intelligence-sections">
    {feedback&&<p className="intelligence-feedback" role="status" aria-live="polite">{feedback}</p>}

    <section className="panel intelligence-section" aria-labelledby="intelligence-anomalies"><div className="panel-head"><div><p className="eyebrow">ANOMALÍAS</p><h2 id="intelligence-anomalies">Importes fuera de su patrón</h2></div><span className="pill">{formatInteger(initialData.anomalies.length)}</span></div>
      {initialData.anomalies.length?<div className="intelligence-list">{initialData.anomalies.map((item:AnomalySignal)=><article key={item.key} className={`intelligence-item severity-${item.severity}`}><div className="intelligence-item-main"><div><span>{item.category}</span><strong>{item.merchant}</strong><small>{fmtDate(item.date)} · {formatInteger(item.historyCount)} antecedentes comparables</small></div><div className="intelligence-value"><strong>{formatEuro(item.amount)}</strong><small>mediana previa {formatEuro(item.baselineMedian)} · {formatNumber(item.ratio,{maximumFractionDigits:2})}×</small></div></div><p>El cargo supera en {formatEuro(item.difference)} su mediana histórica y cumple simultáneamente el umbral relativo y el absoluto.</p><div className="intelligence-item-footer"><Link className="button-link ghost" href={item.href}>Ver movimiento</Link><Actions keyValue={item.key} state={item.state} resolve/></div></article>)}</div>:<Empty>Los cargos recientes están dentro de su rango histórico o todavía no tienen muestra suficiente.</Empty>}
    </section>

    <section className="panel intelligence-section" aria-labelledby="intelligence-recurring"><div className="panel-head"><div><p className="eyebrow">RECURRENCIAS</p><h2 id="intelligence-recurring">Cargos periódicos activos</h2></div><span className="pill">{formatInteger(initialData.recurring.length)}</span></div>
      {initialData.recurring.length?<div className="intelligence-list">{initialData.recurring.map((item:RecurringSignal)=><article key={item.key} className={`intelligence-item severity-${item.severity}`}><div className="intelligence-item-main"><div><span>{item.classification==="subscription_candidate"?"Posible suscripción":item.classification==="fixed_commitment"?"Compromiso fijo":"Cargo recurrente"}</span><strong>{item.merchant}</strong><small>{item.category}{item.subcategory?` · ${item.subcategory}`:""}</small></div><div className="intelligence-value"><strong>{formatEuro(item.monthlyAmount)}<small>/mes</small></strong><small>{formatEuro(item.annualizedAmount)} anualizados</small></div></div><p>{formatInteger(item.monthsObserved)} meses observados · estabilidad {formatPercent(item.stability*100,1)}{Math.abs(item.latestChangeRatio)>=.1?` · último cargo ${formatSignedPercent(item.latestChangeRatio*100,1)} frente a la mediana`:""}.</p><div className="intelligence-item-footer"><Link className="button-link ghost" href={item.href}>Ver movimientos</Link><Actions keyValue={item.key} state={item.state} dismiss/></div></article>)}</div>:<Empty>No hay cargos mensuales con al menos cuatro meses de evidencia y variación de importe suficientemente baja.</Empty>}
    </section>

    <section className="panel intelligence-section" aria-labelledby="intelligence-rising"><div className="panel-head"><div><p className="eyebrow">TENDENCIA</p><h2 id="intelligence-rising">Categorías que aceleran</h2></div><span className="pill">{formatInteger(initialData.rising.length)}</span></div>
      {initialData.rising.length?<div className="intelligence-list">{initialData.rising.map((item:RisingSignal)=><article key={item.key} className={`intelligence-item severity-${item.severity}`}><div className="intelligence-item-main"><div><span>2 meses completos vs. 2 anteriores</span><strong>{item.category}</strong><small>{formatInteger(item.recentTransactions)} movimientos recientes · {formatInteger(item.previousTransactions)} anteriores</small></div><div className="intelligence-value"><strong>{formatSignedPercent(item.changeRatio*100,1)}</strong><small>+{formatEuro(item.difference)}</small></div></div><p>El bloque reciente suma {formatEuro(item.recentSpend)} frente a {formatEuro(item.previousSpend)} en el bloque comparable anterior.</p><div className="intelligence-item-footer"><Link className="button-link ghost" href={item.href}>Ver categoría</Link><Actions keyValue={item.key} state={item.state}/></div></article>)}</div>:<Empty>No hay categorías con una subida material y suficientemente respaldada por dos periodos completos comparables.</Empty>}
    </section>

    <section className="panel intelligence-section" aria-labelledby="intelligence-opportunities"><div className="panel-head"><div><p className="eyebrow">ESCENARIOS DE AHORRO</p><h2 id="intelligence-opportunities">Qué supondría reducir un 10%</h2></div><span className="pill">{formatInteger(initialData.opportunities.length)}</span></div>
      {initialData.opportunities.length?<div className="intelligence-list">{initialData.opportunities.map((item:OpportunitySignal)=><article key={item.key} className="intelligence-item severity-low"><div className="intelligence-item-main"><div><span>Escenario, no objetivo automático</span><strong>{item.category}</strong><small>media de la ventana: {formatEuro(item.monthlyAverage)}/mes</small></div><div className="intelligence-value"><strong>{formatEuro(item.monthlyScenarioSavings)}<small>/mes</small></strong><small>{formatEuro(item.annualScenarioSavings)} al año</small></div></div><p>La cifra representa únicamente el {formatInteger(item.scenarioPercent)}% del gasto medio observado. No presupone que todo ese gasto sea prescindible.</p><div className="intelligence-item-footer"><Link className="button-link ghost" href={item.href}>Revisar gastos</Link><Actions keyValue={item.key} state={item.state} dismiss/></div></article>)}</div>:<Empty>No hay categorías discrecionales con muestra suficiente para construir un escenario útil.</Empty>}
    </section>
  </div>;
}
