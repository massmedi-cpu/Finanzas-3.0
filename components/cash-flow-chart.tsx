"use client";

import { useId, useMemo, useState } from "react";
import type { CashFlowPoint, CashFlowRangeData } from "@/lib/financial/cash-flow";
import { bucketBounds, movementState, movementUrl } from "@/lib/financial/movement-query";

const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});

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
  const width=980,height=360,padX=48,base=238,top=35;
  const maxBar=Math.max(1,...points.flatMap(p=>[visible.income?p.income:0,visible.expenses?p.expenses:0]));
  const maxAcc=Math.max(1,...points.map(p=>Math.abs(p.accumulated)));
  const group=(width-padX*2)/Math.max(1,points.length);
  const bw=Math.max(4,Math.min(20,group*.25));
  const barH=(v:number)=>Math.max(0,(v/maxBar)*(base-top-20));
  const accY=(v:number)=>base-(v/maxAcc)*125;
  const line=visible.accumulated?points.map((p,i)=>`${i===0?"M":"L"}${(padX+i*group+group/2).toFixed(1)},${accY(p.accumulated).toFixed(1)}`).join(" "):"";
  const current=active==null?null:points[active]||null;
  const labelEvery=Math.max(1,Math.ceil(points.length/10));
  const ariaLabel=useMemo(()=>`Cash Flow entre ${points[0]?.date||"sin datos"} y ${points.at(-1)?.date||"sin datos"}`, [points]);

  function urlForPoint(point:CashFlowPoint){
    const bounds=bucketBounds(point.date,drilldown.bucket,drilldown.dateFrom,drilldown.dateTo);
    return movementUrl(movementState({
      from:bounds.from,to:bounds.to,cashFlowOnly:true,
      account:drilldown.account,type:drilldown.type,category:drilldown.category,subcategory:drilldown.subcategory,merchant:drilldown.merchant,
    }));
  }
  const currentMovementUrl=current?urlForPoint(current):null;
  function toggle(key:SeriesKey){setVisible(v=>({...v,[key]:!v[key]}))}
  function pointerIndex(clientX:number,target:SVGSVGElement){const rect=target.getBoundingClientRect();const x=(clientX-rect.left)/rect.width*width;return Math.max(0,Math.min(points.length-1,Math.floor((x-padX)/Math.max(group,1))))}

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
        <line className="cf-zero" x1={padX} x2={width-padX} y1={base} y2={base}/>
        {points.map((p,i)=>{const x=padX+i*group+group/2,ih=barH(p.income),eh=barH(p.expenses);return <g key={`${p.date}-${i}`}>
          {visible.income&&<rect className="cf-income" x={x-bw-2} y={base-ih} width={bw} height={ih} rx="3"/>}
          {visible.expenses&&<rect className="cf-expense" x={x+2} y={base-eh} width={bw} height={eh} rx="3"/>}
          {(i%labelEvery===0||i===points.length-1)&&<text className="cf-month" x={x} y={base+27} textAnchor="middle">{p.label.slice(5)}</text>}
          {active===i&&<line className="cf-hover-line" x1={x} x2={x} y1={top} y2={base+4}/>} 
        </g>})}
        {visible.accumulated&&<path className="cf-acc-line" d={line}/>} 
        {visible.accumulated&&points.map((p,i)=>{const x=padX+i*group+group/2,y=accY(p.accumulated);return <circle key={`${p.date}-a`} className="cf-acc-dot" cx={x} cy={y} r={active===i?6:4}/>})}
      </svg>
      {current&&<div className="cf-tooltip" role="status" aria-live="polite"><strong>{current.label}</strong><span>Ingresos <b>{money.format(current.income)}</b></span><span>Gastos <b>{money.format(current.expenses)}</b></span><span>Cash Flow <b>{money.format(current.net)}</b></span><span>Acumulado <b>{money.format(current.accumulated)}</b></span><small>{current.movements} movimiento{current.movements===1?"":"s"}</small>{currentMovementUrl&&<a href={currentMovementUrl}>Ver movimientos del periodo →</a>}</div>}
    </div>
    <p id={helpId} className="cf-chart-help">Toca o mueve el puntero sobre el gráfico para ver el detalle. Con teclado o lector de pantalla, abre la tabla de datos situada a continuación. Puedes ocultar o mostrar cada serie.</p>
    <details className="cf-chart-data">
      <summary>Ver datos del gráfico en tabla</summary>
      <div className="cf-chart-table-wrap">
        <table>
          <caption className="sr-only">Datos de Cash Flow y acceso a los movimientos de cada periodo</caption>
          <thead><tr><th scope="col">Periodo</th><th scope="col">Ingresos</th><th scope="col">Gastos</th><th scope="col">Cash Flow</th><th scope="col">Acumulado</th><th scope="col">Mov.</th><th scope="col">Detalle</th></tr></thead>
          <tbody>{points.map(point=><tr key={`table-${point.date}`}><th scope="row">{point.label}</th><td>{money.format(point.income)}</td><td>{money.format(point.expenses)}</td><td>{money.format(point.net)}</td><td>{money.format(point.accumulated)}</td><td>{point.movements}</td><td><a href={urlForPoint(point)}>Ver movimientos</a></td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </div>;
}
