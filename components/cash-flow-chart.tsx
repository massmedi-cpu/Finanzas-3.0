"use client";

import { formatEuro } from "@/lib/format/es-es";
import { useId, useMemo, useState } from "react";
import type { CashFlowPoint, CashFlowRangeData } from "@/lib/financial/cash-flow";
import { bucketBounds, movementState, movementUrl } from "@/lib/financial/movement-query";

type SeriesKey="income"|"expenses"|"accumulated";
type DrilldownContext={
  bucket:CashFlowRangeData["bucket"];
  dateFrom:string;
  dateTo:string;
  account:string;
  type:string;
  category:string;
  subcategory:string;
  merchant:string;
};

export function CashFlowChart({points,drilldown}:{points:CashFlowPoint[];drilldown:DrilldownContext}){
  const [visible,setVisible]=useState<Record<SeriesKey,boolean>>({income:true,expenses:true,accumulated:true});
  const [active,setActive]=useState<number|null>(null);
  const helpId=useId();
  const width=980,height=360,padLeft=86,padRight=86,plotTop=34,plotBottom=252;
  const plotHeight=plotBottom-plotTop;
  const plotWidth=width-padLeft-padRight;
  const maxBar=Math.max(1,...points.flatMap(p=>[visible.income?p.income:0,visible.expenses?p.expenses:0]));
  const maxAcc=Math.max(1,...points.map(p=>Math.abs(p.accumulated)));
  const group=plotWidth/Math.max(1,points.length);
  const bw=Math.max(4,Math.min(20,group*.25));
  const barH=(v:number)=>Math.max(0,(v/maxBar)*plotHeight);
  const accMid=plotTop+plotHeight/2;
  const accY=(v:number)=>accMid-(v/maxAcc)*(plotHeight/2);
  const line=visible.accumulated?points.map((p,i)=>`${i===0?"M":"L"}${(padLeft+i*group+group/2).toFixed(1)},${accY(p.accumulated).toFixed(1)}`).join(" "):"";
  const current=active==null?null:points[active]||null;
  const labelEvery=Math.max(1,Math.ceil(points.length/10));
  const ariaLabel=useMemo(()=>`Cash Flow entre ${points[0]?.date||"sin datos"} y ${points.at(-1)?.date||"sin datos"}. Barras de ingresos y gastos en el eje izquierdo; acumulado en el eje derecho.`,[points]);
  const leftTicks=[1,.5,0];
  const rightTicks=[maxAcc,0,-maxAcc];

  function urlForPoint(point:CashFlowPoint){
    const bounds=bucketBounds(point.date,drilldown.bucket,drilldown.dateFrom,drilldown.dateTo);
    return movementUrl(movementState({
      from:bounds.from,to:bounds.to,cashFlowOnly:true,
      account:drilldown.account,type:drilldown.type,category:drilldown.category,subcategory:drilldown.subcategory,merchant:drilldown.merchant,
    }));
  }
  const currentMovementUrl=current?urlForPoint(current):null;
  function toggle(key:SeriesKey){setVisible(v=>({...v,[key]:!v[key]}))}
  function pointerIndex(clientX:number,target:SVGSVGElement){const rect=target.getBoundingClientRect();const x=(clientX-rect.left)/rect.width*width;return Math.max(0,Math.min(points.length-1,Math.floor((x-padLeft)/Math.max(group,1))))}

  if(!points.length)return <div className="cf-chart-empty" role="status">No hay datos para este periodo.</div>;
  return <div className="cf-chart-wrap interactive">
    <div className="cf-series-controls" role="group" aria-label="Series visibles del gráfico">
      <button type="button" aria-pressed={visible.income} onClick={()=>toggle("income")}><i className="income" aria-hidden="true"/>Ingresos</button>
      <button type="button" aria-pressed={visible.expenses} onClick={()=>toggle("expenses")}><i className="expense" aria-hidden="true"/>Gastos</button>
      <button type="button" aria-pressed={visible.accumulated} onClick={()=>toggle("accumulated")}><i className="acc" aria-hidden="true"/>Acumulado</button>
    </div>
    <div className="cf-chart-stage" onPointerLeave={()=>setActive(null)}>
      <svg className="cf-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} aria-describedby={helpId}
        onPointerMove={e=>setActive(pointerIndex(e.clientX,e.currentTarget))} onPointerDown={e=>setActive(pointerIndex(e.clientX,e.currentTarget))}>
        <g className="cf-grid" aria-hidden="true">
          {leftTicks.map(ratio=>{const y=plotBottom-ratio*plotHeight;return <line key={`grid-${ratio}`} x1={padLeft} x2={width-padRight} y1={y} y2={y}/>})}
        </g>
        <g className="cf-axis-labels" aria-hidden="true">
          <text className="cf-axis-title" x={padLeft} y={18}>Ingresos / gastos</text>
          <text className="cf-axis-title right" x={width-padRight} y={18} textAnchor="end">Acumulado</text>
          {leftTicks.map(ratio=>{const y=plotBottom-ratio*plotHeight;return <text key={`left-${ratio}`} className="cf-axis-text" x={padLeft-10} y={y+4} textAnchor="end">{formatEuro(maxBar*ratio)}</text>})}
          {rightTicks.map(value=><text key={`right-${value}`} className="cf-axis-text" x={width-padRight+10} y={accY(value)+4}>{formatEuro(value)}</text>)}
        </g>
        {visible.accumulated&&<line className="cf-acc-zero" x1={padLeft} x2={width-padRight} y1={accMid} y2={accMid}/>} 
        {points.map((p,i)=>{const x=padLeft+i*group+group/2,ih=barH(p.income),eh=barH(p.expenses);return <g key={`${p.date}-${i}`}>
          {visible.income&&<rect className="cf-income" x={x-bw-2} y={plotBottom-ih} width={bw} height={ih} rx="3"/>}
          {visible.expenses&&<rect className="cf-expense" x={x+2} y={plotBottom-eh} width={bw} height={eh} rx="3"/>}
          {(i%labelEvery===0||i===points.length-1)&&<text className="cf-month" x={x} y={plotBottom+27} textAnchor="middle">{p.label.slice(5)}</text>}
          {active===i&&<line className="cf-hover-line" x1={x} x2={x} y1={plotTop} y2={plotBottom+4}/>} 
        </g>})}
        {visible.accumulated&&<path className="cf-acc-line" d={line}/>} 
        {visible.accumulated&&points.map((p,i)=>{const x=padLeft+i*group+group/2,y=accY(p.accumulated);return <circle key={`${p.date}-a`} className="cf-acc-dot" cx={x} cy={y} r={active===i?6:4}/>})}
      </svg>
      {current&&<div className="cf-tooltip" role="status" aria-live="polite"><strong>{current.label}</strong><span>Ingresos <b>{formatEuro(current.income)}</b></span><span>Gastos <b>{formatEuro(current.expenses)}</b></span><span>Cash Flow <b>{formatEuro(current.net)}</b></span><span>Acumulado <b>{formatEuro(current.accumulated)}</b></span><small>{current.movements} movimiento{current.movements===1?"":"s"}</small>{currentMovementUrl&&<a href={currentMovementUrl}>Ver movimientos del periodo →</a>}</div>}
    </div>
    <p id={helpId} className="cf-chart-help">Ingresos y gastos usan el eje izquierdo; el acumulado usa el derecho y siempre se dibuja como línea sin relleno. Toca o mueve el puntero para ver el detalle. Con teclado o lector de pantalla, abre la tabla situada a continuación.</p>
    <details className="cf-chart-data">
      <summary>Ver datos del gráfico en tabla</summary>
      <div className="cf-chart-table-wrap">
        <table>
          <caption className="sr-only">Datos de Cash Flow y acceso a los movimientos de cada periodo</caption>
          <thead><tr><th scope="col">Periodo</th><th scope="col">Ingresos</th><th scope="col">Gastos</th><th scope="col">Cash Flow</th><th scope="col">Acumulado</th><th scope="col">Mov.</th><th scope="col">Detalle</th></tr></thead>
          <tbody>{points.map(point=><tr key={`table-${point.date}`}><th scope="row">{point.label}</th><td>{formatEuro(point.income)}</td><td>{formatEuro(point.expenses)}</td><td>{formatEuro(point.net)}</td><td>{formatEuro(point.accumulated)}</td><td>{point.movements}</td><td><a href={urlForPoint(point)}>Ver movimientos</a></td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </div>;
}
