"use client";

import { useEffect,useMemo,useState } from "react";
import { formatEuro,formatPercent,formatSignedPercent } from "@/lib/format/es-es";
import type { AnalysisCategory,AnalysisDeviation,AnalysisMerchant,AnalysisMonth } from "@/lib/financial/analysis";
import type { AnalysisInsights } from "@/lib/financial/analysis-insights";

type ChartId="monthly-flow"|"net-trend"|"savings-rate"|"cumulative-net"|"category-donut"|"category-bars"|"merchant-bars"|"year-compare"|"deviations"|"monthly-heatmap";
type Props={months:AnalysisMonth[];categories:AnalysisCategory[];merchants:AnalysisMerchant[];deviations:AnalysisDeviation[];insights:AnalysisInsights;year:number;comparisonYear:number;income:number;expenses:number;net:number;priorIncome:number;priorExpenses:number;priorNet:number};

const STORAGE_KEY="financial-app.analysis.visual-layout.v1";
const DEFAULT_ORDER:ChartId[]=["monthly-flow","net-trend","savings-rate","cumulative-net","category-donut","category-bars","merchant-bars","year-compare","deviations","monthly-heatmap"];
const LABELS:Record<ChartId,string>={
  "monthly-flow":"Ingresos y gastos por mes",
  "net-trend":"Evolución del Cash Flow",
  "savings-rate":"Tasa de ahorro mensual",
  "cumulative-net":"Cash Flow acumulado",
  "category-donut":"Distribución del gasto",
  "category-bars":"Ranking de categorías",
  "merchant-bars":"Principales comercios",
  "year-compare":"Comparativa con año anterior",
  "deviations":"Desviaciones de gasto",
  "monthly-heatmap":"Mapa de intensidad mensual",
};

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const pct=(current:number,previous:number)=>previous>0?((current-previous)/previous)*100:null;
const points=(values:number[],width:number,height:number,pad=26)=>{
  if(!values.length)return "";
  const min=Math.min(0,...values),max=Math.max(0,...values);const span=Math.max(1,max-min);
  return values.map((v,i)=>{const x=pad+(i*(width-pad*2))/Math.max(1,values.length-1);const y=pad+((max-v)/span)*(height-pad*2);return `${x},${y}`}).join(" ");
};

function ChartCard({id,title,subtitle,children,onMove,onHide,index,total}:{id:ChartId;title:string;subtitle:string;children:React.ReactNode;onMove:(id:ChartId,offset:number)=>void;onHide:(id:ChartId)=>void;index:number;total:number}){
  return <article className="analysis-viz-card" draggable onDragStart={e=>e.dataTransfer.setData("text/plain",id)} data-chart-id={id}>
    <div className="analysis-viz-head"><div><span>{title}</span><small>{subtitle}</small></div><div className="analysis-viz-actions"><button className="icon-button" type="button" onClick={()=>onMove(id,-1)} disabled={index===0} aria-label={`Mover ${title} antes`}>←</button><button className="icon-button" type="button" onClick={()=>onMove(id,1)} disabled={index===total-1} aria-label={`Mover ${title} después`}>→</button><button className="icon-button" type="button" onClick={()=>onHide(id)} aria-label={`Ocultar ${title}`}>×</button></div></div>
    <div className="analysis-viz-body">{children}</div>
  </article>;
}

function MonthlyFlowChart({months}:{months:AnalysisMonth[]}){
  const shown=months.filter(m=>m.available);const max=Math.max(1,...shown.flatMap(m=>[m.income,m.expenses]));
  return <div className="analysis-bar-chart" role="img" aria-label="Ingresos y gastos mensuales">{shown.map(m=><div className="analysis-bar-group" key={m.month}><div className="analysis-bar-pair"><i className="income" style={{height:`${clamp(m.income/max*100,2,100)}%`}} title={`${m.label}: ingresos ${formatEuro(m.income)}`}/><i className="expense" style={{height:`${clamp(m.expenses/max*100,2,100)}%`}} title={`${m.label}: gastos ${formatEuro(m.expenses)}`}/></div><span>{m.label.slice(0,3)}</span></div>)}</div>;
}

function LineChart({values,secondary,labels,aria}:{values:number[];secondary?:number[];labels:string[];aria:string}){
  const width=720,height=230;const primary=points(values,width,height);const second=secondary?points(secondary,width,height):"";
  return <div className="analysis-svg-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria}><line className="viz-zero" x1="26" x2={width-26} y1={height/2} y2={height/2}/>{secondary&&<polyline className="viz-line-secondary" points={second}/>}<polyline className="viz-line-primary" points={primary}/>{values.map((v,i)=>{const [x,y]=(primary.split(" ")[i]||"0,0").split(",");return <g key={i}><circle className="viz-point" cx={x} cy={y} r="4"><title>{`${labels[i]} · ${formatEuro(v)}`}</title></circle></g>})}</svg></div>;
}

function SavingsRateChart({months}:{months:AnalysisMonth[]}){
  const shown=months.filter(m=>m.available);const rates=shown.map(m=>m.income>0?(m.net/m.income)*100:0);const width=720,height=230;const line=points(rates,width,height);const poly=line?`26,${height-26} ${line} ${width-26},${height-26}`:"";
  return <div className="analysis-svg-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tasa de ahorro mensual"><polygon className="viz-area" points={poly}/><polyline className="viz-line-primary" points={line}/>{rates.map((v,i)=>{const [x,y]=(line.split(" ")[i]||"0,0").split(",");return <circle key={shown[i]?.month} className="viz-point" cx={x} cy={y} r="4"><title>{`${shown[i]?.label}: ${formatPercent(v,1)}`}</title></circle>})}</svg></div>;
}

function CumulativeNetChart({months}:{months:AnalysisMonth[]}){
  const shown=months.filter(m=>m.available);let total=0;const values=shown.map(m=>(total+=m.net));return <LineChart values={values} labels={shown.map(m=>m.label)} aria="Cash Flow acumulado"/>;
}

function CategoryDonut({categories}:{categories:AnalysisCategory[]}){
  const shown=categories.slice(0,6);const total=shown.reduce((s,c)=>s+c.amount,0);let offset=0;
  return <div className="analysis-donut-layout"><svg className="analysis-donut" viewBox="0 0 42 42" role="img" aria-label="Distribución del gasto por categorías"><circle className="donut-base" cx="21" cy="21" r="15.9"/>{shown.map((c,i)=>{const share=total?c.amount/total*100:0;const dash=`${share} ${100-share}`;const node=<circle key={c.category} className={`donut-segment segment-${i+1}`} cx="21" cy="21" r="15.9" strokeDasharray={dash} strokeDashoffset={-offset}><title>{`${c.category}: ${formatEuro(c.amount)} · ${formatPercent(c.share,1)}`}</title></circle>;offset+=share;return node;})}<text x="21" y="20.5" textAnchor="middle" className="donut-center-value">{formatPercent(shown.reduce((s,c)=>s+c.share,0),0)}</text><text x="21" y="24" textAnchor="middle" className="donut-center-label">top 6</text></svg><ol className="analysis-mini-legend">{shown.map((c,i)=><li key={c.category}><i className={`segment-${i+1}`}/><span>{c.category}</span><strong>{formatEuro(c.amount)}</strong></li>)}</ol></div>;
}

function RankingBars({items,kind}:{items:{label:string;value:number;meta:string}[];kind:"category"|"merchant"}){
  const max=Math.max(1,...items.map(i=>i.value));return <div className={`analysis-ranking-bars ${kind}`}>{items.map(item=><div key={item.label}><div><span>{item.label}</span><strong>{formatEuro(item.value)}</strong></div><div className="analysis-ranking-track"><i style={{width:`${clamp(item.value/max*100,1,100)}%`}}/></div><small>{item.meta}</small></div>)}</div>;
}

function YearCompare({year,comparisonYear,income,expenses,net,priorIncome,priorExpenses,priorNet}:Pick<Props,"year"|"comparisonYear"|"income"|"expenses"|"net"|"priorIncome"|"priorExpenses"|"priorNet">){
  const rows=[{label:"Ingresos",current:income,prior:priorIncome},{label:"Gastos",current:expenses,prior:priorExpenses},{label:"Cash Flow",current:Math.abs(net),prior:Math.abs(priorNet)}];const max=Math.max(1,...rows.flatMap(r=>[r.current,r.prior]));
  return <div className="analysis-year-bars">{rows.map(r=><div key={r.label}><span>{r.label}</span><div className="analysis-year-pair"><i className="current" style={{width:`${r.current/max*100}%`}} title={`${year}: ${formatEuro(r.current)}`}/><i className="prior" style={{width:`${r.prior/max*100}%`}} title={`${comparisonYear}: ${formatEuro(r.prior)}`}/></div><small>{year}: {formatEuro(r.current)} · {comparisonYear}: {formatEuro(r.prior)}</small></div>)}</div>;
}

function DeviationsChart({deviations}:{deviations:AnalysisDeviation[]}){
  const shown=deviations.slice(0,8);const max=Math.max(1,...shown.flatMap(d=>[d.current,d.previous3MonthAverage]));return <div className="analysis-deviation-bars">{shown.map(d=><div key={d.category}><div><span>{d.category}</span><strong className={d.changePercent!=null&&d.changePercent>0?"negative":"positive"}>{d.changePercent==null?"Nuevo":formatSignedPercent(d.changePercent,1)}</strong></div><div className="analysis-deviation-pair"><i className="current" style={{width:`${d.current/max*100}%`}} title={`Actual ${formatEuro(d.current)}`}/><i className="baseline" style={{width:`${d.previous3MonthAverage/max*100}%`}} title={`Media 3 meses ${formatEuro(d.previous3MonthAverage)}`}/></div></div>)}</div>;
}

function Heatmap({months}:{months:AnalysisMonth[]}){
  const max=Math.max(1,...months.map(m=>m.expenses));return <div className="analysis-heatmap" role="img" aria-label="Intensidad de gasto por mes">{months.map(m=><div key={m.month} className={m.available?"available":"empty"} style={{"--heat":String(clamp(m.expenses/max,0,1))} as React.CSSProperties} title={`${m.label}: ${formatEuro(m.expenses)}`}><span>{m.label.slice(0,3)}</span><strong>{m.available?formatEuro(m.expenses):"—"}</strong></div>)}</div>;
}

export function AnalysisVisualDashboard(props:Props){
  const [order,setOrder]=useState<ChartId[]>(DEFAULT_ORDER);const [hidden,setHidden]=useState<ChartId[]>([]);const [customizing,setCustomizing]=useState(false);const [status,setStatus]=useState("");
  useEffect(()=>{try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;const saved=JSON.parse(raw) as {order?:ChartId[];hidden?:ChartId[]};if(Array.isArray(saved.order)){const valid=saved.order.filter(id=>DEFAULT_ORDER.includes(id));setOrder([...valid,...DEFAULT_ORDER.filter(id=>!valid.includes(id))]);}if(Array.isArray(saved.hidden))setHidden(saved.hidden.filter(id=>DEFAULT_ORDER.includes(id)));}catch{}},[]);
  useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify({order,hidden}));}catch{}},[order,hidden]);
  const visible=order.filter(id=>!hidden.includes(id));
  const reports=useMemo(()=>{const complete=props.months.filter(m=>m.available&&m.complete&&!m.partial);const last=complete.at(-1);const last3=complete.slice(-3);const avg3=last3.length?last3.reduce((s,m)=>s+m.expenses,0)/last3.length:0;const incomeChange=pct(props.income,props.priorIncome);const expenseChange=pct(props.expenses,props.priorExpenses);return [
    {label:"Último mes cerrado",value:last?formatEuro(last.net):"—",detail:last?`${last.label}: ${formatEuro(last.income)} ingresos · ${formatEuro(last.expenses)} gastos`:"Aún no hay un mes completo."},
    {label:"Media últimos 3 meses",value:last3.length?formatEuro(avg3):"—",detail:"Gasto mensual medio de los últimos meses completos disponibles."},
    {label:"Ingresos vs año anterior",value:incomeChange==null?"—":formatSignedPercent(incomeChange,1),detail:`Periodo homogéneo frente a ${props.comparisonYear}.`},
    {label:"Gastos vs año anterior",value:expenseChange==null?"—":formatSignedPercent(expenseChange,1),detail:`Periodo homogéneo frente a ${props.comparisonYear}.`},
    {label:"Tasa de ahorro media",value:formatPercent(props.insights.savingsRatePercent,1),detail:`Calculada con ${props.insights.sampleMonths} meses comparables.`},
    {label:"Concentración top 3",value:formatPercent(props.insights.top3CategorySharePercent,1),detail:"Peso de las tres categorías de mayor gasto."},
  ];},[props]);
  const move=(id:ChartId,offset:number)=>setOrder(current=>{const from=current.indexOf(id),to=from+offset;if(from<0||to<0||to>=current.length)return current;const copy=[...current];copy.splice(from,1);copy.splice(to,0,id);setStatus("Orden de gráficos actualizado.");return copy;});
  const hide=(id:ChartId)=>{setHidden(v=>[...v,id]);setStatus(`${LABELS[id]} ocultado.`)};
  const restore=(id:ChartId)=>{setHidden(v=>v.filter(x=>x!==id));setStatus(`${LABELS[id]} visible de nuevo.`)};
  const reset=()=>{setOrder(DEFAULT_ORDER);setHidden([]);setStatus("Diseño de Análisis restablecido.");};
  const drop=(target:ChartId,source:ChartId)=>{if(source===target)return;setOrder(current=>{const copy=current.filter(id=>id!==source);copy.splice(copy.indexOf(target),0,source);return copy;});setStatus("Orden de gráficos actualizado.");};
  const render=(id:ChartId)=>{
    switch(id){
      case "monthly-flow":return <MonthlyFlowChart months={props.months}/>;
      case "net-trend":return <LineChart values={props.months.filter(m=>m.available).map(m=>m.net)} secondary={props.months.filter(m=>m.available).map(m=>m.priorNet||0)} labels={props.months.filter(m=>m.available).map(m=>m.label)} aria={`Cash Flow mensual ${props.year} frente a ${props.comparisonYear}`}/>;
      case "savings-rate":return <SavingsRateChart months={props.months}/>;
      case "cumulative-net":return <CumulativeNetChart months={props.months}/>;
      case "category-donut":return <CategoryDonut categories={props.categories}/>;
      case "category-bars":return <RankingBars kind="category" items={props.categories.slice(0,8).map(c=>({label:c.category,value:c.amount,meta:`${formatPercent(c.share,1)} · ${c.movements} movimientos`}))}/>;
      case "merchant-bars":return <RankingBars kind="merchant" items={props.merchants.slice(0,8).map(m=>({label:m.merchant,value:m.amount,meta:`${m.movements} movimientos`}))}/>;
      case "year-compare":return <YearCompare {...props}/>;
      case "deviations":return <DeviationsChart deviations={props.deviations}/>;
      case "monthly-heatmap":return <Heatmap months={props.months}/>;
    }
  };
  return <section className="analysis-visual-section" aria-labelledby="analysis-visual-title">
    <div className="panel-head analysis-visual-toolbar"><div><p className="eyebrow">PANEL VISUAL</p><h2 id="analysis-visual-title">Gráficos e informes rápidos</h2><p>Todos usan la misma base financiera validada del Análisis. Puedes ocultarlos y reordenarlos; tu diseño se conserva en este dispositivo.</p></div><div><button className="ghost" type="button" onClick={()=>setCustomizing(v=>!v)}>{customizing?"Cerrar personalización":"Personalizar gráficos"}</button><button className="ghost" type="button" onClick={reset}>Restablecer</button></div></div>
    {customizing&&<div className="analysis-viz-customizer" aria-label="Seleccionar gráficos">{DEFAULT_ORDER.map(id=><label key={id}><input type="checkbox" checked={!hidden.includes(id)} onChange={e=>e.target.checked?restore(id):hide(id)}/><span>{LABELS[id]}</span></label>)}</div>}
    <div className="analysis-quick-reports" aria-label="Informes rápidos">{reports.map(report=><article key={report.label}><span>{report.label}</span><strong>{report.value}</strong><small>{report.detail}</small></article>)}</div>
    <div className="analysis-viz-grid" onDragOver={e=>e.preventDefault()}>{visible.map((id,index)=><div key={id} onDrop={e=>{e.preventDefault();const source=e.dataTransfer.getData("text/plain") as ChartId;if(DEFAULT_ORDER.includes(source))drop(id,source)}}><ChartCard id={id} title={LABELS[id]} subtitle={id==="net-trend"?`${props.year} frente a ${props.comparisonYear}`:id==="deviations"?"Actual frente a media comparable de 3 meses":"Lectura visual del periodo seleccionado"} onMove={move} onHide={hide} index={index} total={visible.length}>{render(id)}</ChartCard></div>)}</div>
    {hidden.length>0&&<div className="analysis-hidden-note"><span>{hidden.length} gráfico{hidden.length===1?"":"s"} oculto{hidden.length===1?"":"s"}.</span><button className="ghost" type="button" onClick={()=>setHidden([])}>Mostrar todos</button></div>}
    <p className="sr-only" role="status" aria-live="polite">{status}</p>
  </section>;
}
