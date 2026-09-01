"use client";

import { useMemo,useState } from "react";
import { formatEuro } from "@/lib/format/es-es";
import { madridToday } from "@/lib/time/madrid";
import type { ForecastLiquidityOverview } from "@/lib/financial/forecast-liquidity";
import type { ForecastScenarioOverview,ScenarioKind } from "@/lib/financial/forecast-scenario";

type Direction="expense"|"income";
type Draft={id:string;title:string;date:string;direction:Direction;kind:ScenarioKind;amount:string;count:number;intervalMonths:number};
type Feedback={tone:"error"|"warning"|"info";message:string};
const MAX_SCENARIO_DEFINITIONS=24;
const today=madridToday();
const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",year:"numeric"});
const newId=()=>globalThis.crypto?.randomUUID?.()??`scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function addDays(date:string,days:number){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function labelDate(value:string|null){return value?dateFmt.format(new Date(`${value}T12:00:00`)):"—";}
function draft(kind:ScenarioKind,direction:Direction):Draft{return{id:newId(),title:kind==="installments"?"Compra a plazos":kind==="monthly"?direction==="expense"?"Gasto mensual":"Ingreso mensual":direction==="expense"?"Gasto puntual":"Ingreso puntual",date:addDays(today,7),direction,kind,amount:"",count:kind==="once"?1:kind==="installments"?6:3,intervalMonths:1};}
function signedEuro(value:number){return `${value>0?"+":""}${formatEuro(value)}`;}
function deltaClass(value:number){return value<0?"negative":value>0?"positive":"";}

function ComparisonChart({data}:{data:ForecastScenarioOverview}){
  const chart=useMemo(()=>{
    if(!data.daily.length)return null;
    const width=920,height=270,padX=18,padY=22;
    const values=data.daily.flatMap(d=>[d.baselineBalance,d.scenarioBalance]);let min=Math.min(...values),max=Math.max(...values);
    if(min===max){min-=1;max+=1;}const span=max-min;min-=span*.08;max+=span*.08;
    const x=(i:number)=>padX+(i/Math.max(1,data.daily.length-1))*(width-padX*2);
    const y=(value:number)=>padY+((max-value)/(max-min))*(height-padY*2);
    const baseline=data.daily.map((d,i)=>`${x(i)},${y(d.baselineBalance)}`).join(" ");
    const scenario=data.daily.map((d,i)=>`${x(i)},${y(d.scenarioBalance)}`).join(" ");
    const zero=min<0&&max>0?y(0):null;
    return{width,height,baseline,scenario,zero,min,max};
  },[data]);
  if(!chart)return null;
  return <div className="scenario-chart-wrap"><div className="scenario-chart-legend"><span className="baseline">Previsión actual</span><span className="scenario">Con escenario</span></div><svg className="scenario-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Comparación del saldo previsto actual y el saldo con el escenario simulado"><line x1="18" x2="902" y1="22" y2="22" className="scenario-grid"/><line x1="18" x2="902" y1="248" y2="248" className="scenario-grid"/>{chart.zero!==null&&<line x1="18" x2="902" y1={chart.zero} y2={chart.zero} className="scenario-zero"/>}<polyline points={chart.baseline} className="scenario-line baseline"/><polyline points={chart.scenario} className="scenario-line simulated"/></svg><div className="scenario-chart-scale"><span>{formatEuro(chart.max)}</span><span>{formatEuro(chart.min)}</span></div></div>;
}

export function ScenarioLab({baseline}:{baseline:ForecastLiquidityOverview}){
  const[items,setItems]=useState<Draft[]>([]);
  const[result,setResult]=useState<ForecastScenarioOverview|null>(null);
  const[loading,setLoading]=useState(false);
  const[feedback,setFeedback]=useState<Feedback|null>(null);
  const atLimit=items.length>=MAX_SCENARIO_DEFINITIONS;

  function add(kind:ScenarioKind,direction:Direction){
    if(loading)return;
    if(items.length>=MAX_SCENARIO_DEFINITIONS){setFeedback({tone:"warning",message:`Puedes combinar como máximo ${MAX_SCENARIO_DEFINITIONS} hipótesis en una simulación.`});return;}
    setItems(current=>current.length>=MAX_SCENARIO_DEFINITIONS?current:[...current,draft(kind,direction)]);setResult(null);setFeedback(null);
  }
  function patch(id:string,next:Partial<Draft>){if(loading)return;setItems(current=>current.map(item=>item.id===id?{...item,...next}:item));setResult(null);setFeedback(null);}
  function remove(id:string){if(loading)return;setItems(current=>current.filter(item=>item.id!==id));setResult(null);setFeedback(null);}
  async function simulate(){
    if(!items.length){setFeedback({tone:"warning",message:"Añade al menos una hipótesis para simular."});return;}
    if(items.length>MAX_SCENARIO_DEFINITIONS){setFeedback({tone:"error",message:`El escenario supera el máximo de ${MAX_SCENARIO_DEFINITIONS} hipótesis.`});return;}
    const events=[];
    for(const item of items){
      const amount=Math.abs(Number(item.amount.replace(",",".")));
      if(!item.title.trim()||!item.date||!Number.isFinite(amount)||amount<=0){setFeedback({tone:"error",message:"Revisa nombre, fecha e importe de todas las hipótesis."});return;}
      events.push({id:item.id,title:item.title.trim(),date:item.date,amount:item.direction==="expense"?-amount:amount,kind:item.kind,count:item.kind==="once"?1:item.count,intervalMonths:item.kind==="once"?1:item.intervalMonths});
    }
    setLoading(true);setFeedback(null);
    try{
      const response=await fetch("/api/scenarios",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({days:90,events}),cache:"no-store"});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||"No se ha podido calcular el escenario.");
      setResult(json as ForecastScenarioOverview);
    }catch(error){setFeedback({tone:"error",message:error instanceof Error?error.message:"No se ha podido calcular el escenario."});}
    finally{setLoading(false);}
  }
  function reset(){if(loading)return;setItems([]);setResult(null);setFeedback(null);}

  return <div className="scenario-lab" aria-busy={loading||undefined}>
    <section className="scenario-baseline panel" aria-label="Situación de partida"><div><p className="eyebrow">PUNTO DE PARTIDA · 90 DÍAS</p><h2>Tu previsión real sigue intacta</h2><p>La simulación se superpone a la Agenda Financiera y desaparece al salir. No crea movimientos ni previsiones.</p></div><div className="decision-summary scenario-baseline-summary"><article className="decision-metric is-primary"><span>Saldo actual</span><strong>{formatEuro(baseline.summary.openingBalance)}</strong><small>Punto de partida real</small></article><article className={`decision-metric ${baseline.summary.minimumProjectedBalance<0?"is-negative":""}`}><span>Mínimo previsto</span><strong>{formatEuro(baseline.summary.minimumProjectedBalance)}</strong><small>Antes de simular</small></article><article className="decision-metric"><span>Final previsto</span><strong>{formatEuro(baseline.summary.projectedEndBalance)}</strong><small>A 90 días</small></article></div></section>

    <section className="scenario-builder panel" aria-labelledby="scenario-builder-title"><div className="panel-head"><div><p className="eyebrow">HIPÓTESIS</p><h2 id="scenario-builder-title">¿Qué quieres probar?</h2><p>Combina decisiones y comprueba su efecto antes de tomarlas.</p></div><span className={`status-badge ${atLimit?"warning":"info"}`}>{items.length}/{MAX_SCENARIO_DEFINITIONS}</span></div><div className="scenario-quick-actions"><button type="button" className="secondary-action" disabled={loading||atLimit} onClick={()=>add("once","expense")}>+ Gasto puntual</button><button type="button" className="secondary-action" disabled={loading||atLimit} onClick={()=>add("once","income")}>+ Ingreso puntual</button><button type="button" className="secondary-action" disabled={loading||atLimit} onClick={()=>add("installments","expense")}>+ Compra a plazos</button><button type="button" className="secondary-action" disabled={loading||atLimit} onClick={()=>add("monthly","expense")}>+ Gasto recurrente</button></div>
      {!items.length?<div className="empty-state scenario-empty"><strong>Aún no hay hipótesis.</strong><span>Prueba una compra, varias cuotas, un gasto recurrente o un ingreso extraordinario.</span></div>:<fieldset className="scenario-items" disabled={loading} aria-label="Hipótesis del escenario">{items.map((item,index)=><article key={item.id} className="scenario-item"><div className="scenario-item-index">{index+1}</div><div className="scenario-fields"><label className="wide"><span>Concepto</span><input value={item.title} onChange={e=>patch(item.id,{title:e.target.value})}/></label><label><span>Tipo</span><select value={item.direction} onChange={e=>patch(item.id,{direction:e.target.value as Direction})}><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label><label><span>Forma</span><select value={item.kind} onChange={e=>patch(item.id,{kind:e.target.value as ScenarioKind,count:e.target.value==="once"?1:Math.max(2,item.count)})}><option value="once">Una vez</option><option value="monthly">Recurrente</option><option value="installments">Cuotas</option></select></label><label><span>Primera fecha</span><input type="date" min={today} max={addDays(today,89)} value={item.date} onChange={e=>patch(item.id,{date:e.target.value})}/></label><label><span>{item.kind==="installments"?"Importe por cuota":"Importe"}</span><input inputMode="decimal" placeholder="0,00" value={item.amount} onChange={e=>patch(item.id,{amount:e.target.value})}/></label>{item.kind!=="once"&&<label><span>{item.kind==="installments"?"Número de cuotas":"Repeticiones"}</span><input type="number" min="1" max="24" value={item.count} onChange={e=>patch(item.id,{count:Math.max(1,Math.min(24,Number(e.target.value)||1))})}/></label>}{item.kind==="monthly"&&<label><span>Cada</span><select value={item.intervalMonths} onChange={e=>patch(item.id,{intervalMonths:Number(e.target.value)})}><option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option></select></label>}</div><button className="icon-button" type="button" onClick={()=>remove(item.id)} aria-label={`Eliminar hipótesis ${index+1}`}>×</button></article>)}</fieldset>}
      {feedback&&<div className={`inline-alert ${feedback.tone} scenario-feedback`} role={feedback.tone==="error"?"alert":"status"} aria-live="polite">{feedback.message}</div>}<div className="scenario-actions"><button type="button" className="ghost" onClick={reset} disabled={loading||(!items.length&&!result)}>Limpiar</button><button type="button" className="primary-action" aria-busy={loading||undefined} onClick={simulate} disabled={loading||!items.length}>{loading?"Calculando…":"Simular impacto"}</button></div>
    </section>

    {result&&<section className="scenario-results" aria-labelledby="scenario-results-title"><div className="scenario-results-head"><div><p className="eyebrow">RESULTADO SIMULADO</p><h2 id="scenario-results-title">Así cambiaría tu liquidez</h2><p>{result.summary.occurrences} impacto{result.summary.occurrences===1?"":"s"} hipotético{result.summary.occurrences===1?"":"s"} en los próximos {result.days} días.</p></div><span className={`status-badge ${result.summary.crossesZero?"error":"ok"}`}>{result.summary.crossesZero?"Cruza 0 €":"No cruza 0 €"}</span></div>
      <div className="decision-summary scenario-comparison-grid"><article className={`decision-metric ${result.summary.scenarioEndBalance<0?"is-negative":result.summary.endBalanceDelta>0?"is-positive":""}`}><span>Saldo final</span><strong>{formatEuro(result.summary.scenarioEndBalance)}</strong><small>Actual {formatEuro(result.summary.baselineEndBalance)} · cambio <b className={deltaClass(result.summary.endBalanceDelta)}>{signedEuro(result.summary.endBalanceDelta)}</b></small></article><article className={`decision-metric ${result.summary.scenarioMinimumBalance<0?"is-negative":""}`}><span>Saldo mínimo</span><strong>{formatEuro(result.summary.scenarioMinimumBalance)}</strong><small>{labelDate(result.summary.scenarioMinimumDate)} · cambio <b className={deltaClass(result.summary.minimumBalanceDelta)}>{signedEuro(result.summary.minimumBalanceDelta)}</b></small></article><article className={`decision-metric ${result.summary.scenarioDaysBelowZero>0?"is-negative":""}`}><span>Días bajo cero</span><strong>{result.summary.scenarioDaysBelowZero}</strong><small>Actual {result.summary.baselineDaysBelowZero}{result.summary.firstNegativeDate?` · primero ${labelDate(result.summary.firstNegativeDate)}`:""}</small></article></div>
      <p className="decision-note scenario-impact-note"><strong>Impacto neto de las hipótesis: <span className={deltaClass(result.summary.hypotheticalNet)}>{signedEuro(result.summary.hypotheticalNet)}</span>.</strong> No se ha guardado nada y tu previsión real no cambia.</p>
      <article className="panel scenario-chart-panel"><div className="panel-head"><div><p className="eyebrow">TRAYECTORIA</p><h2>Previsión actual vs. escenario</h2></div></div><ComparisonChart data={result}/><div className="scenario-horizons"><span><small>30 días</small><strong>{result.horizons.days30==null?"—":formatEuro(result.horizons.days30)}</strong></span><span><small>60 días</small><strong>{result.horizons.days60==null?"—":formatEuro(result.horizons.days60)}</strong></span><span><small>90 días</small><strong>{result.horizons.days90==null?"—":formatEuro(result.horizons.days90)}</strong></span></div><details className="decision-disclosure scenario-accessible-data"><summary>Ver datos diarios del cálculo</summary><div className="scenario-table-wrap"><table><thead><tr><th>Fecha</th><th>Previsión actual</th><th>Impacto escenario</th><th>Saldo escenario</th></tr></thead><tbody>{result.daily.map(day=><tr key={day.date}><td>{labelDate(day.date)}</td><td>{formatEuro(day.baselineBalance)}</td><td>{formatEuro(day.scenarioNet)}</td><td>{formatEuro(day.scenarioBalance)}</td></tr>)}</tbody></table></div></details></article>
      <details className="decision-disclosure scenario-occurrences"><summary>Ver calendario de {result.expandedEvents.length} impactos hipotéticos</summary><div className="scenario-occurrence-list">{result.expandedEvents.map(event=><div key={`${event.definitionId}-${event.occurrence}-${event.date}`}><span><strong>{event.title}</strong><small>{labelDate(event.date)}{event.occurrenceCount>1?` · ${event.occurrence}/${event.occurrenceCount}`:""}</small></span><b className={event.amount<0?"negative":"positive"}>{formatEuro(event.amount)}</b></div>)}</div></details>
      <p className="scenario-disclaimer">Este simulador compara hipótesis matemáticas con tu previsión actual. No modifica tus datos ni constituye asesoramiento financiero.</p>
    </section>}
  </div>;
}
