"use client";

import {useEffect,useMemo,useRef,useState,type CSSProperties,type KeyboardEvent,type MouseEvent,type ReactNode} from "react";
import {formatEuro,formatPercent,formatSignedPercent} from "@/lib/format/es-es";
import type {AnalysisCategory,AnalysisDeviation,AnalysisMerchant,AnalysisMonth} from "@/lib/financial/analysis";
import type {AnalysisInsights} from "@/lib/financial/analysis-insights";

type ChartId=
  |"monthly-flow"|"net-trend"|"savings-rate"|"cumulative-net"|"category-donut"|"category-bars"|"merchant-bars"|"year-compare"|"deviations"|"monthly-heatmap"
  |"income-trend"|"expense-trend"|"income-prior"|"expense-prior"|"expense-ratio"|"net-diverging"|"expense-average"|"income-average"|"rolling-expenses"|"rolling-net"
  |"category-pareto"|"merchant-pareto"|"category-treemap"|"annual-waterfall";

type Props={months:AnalysisMonth[];categories:AnalysisCategory[];merchants:AnalysisMerchant[];deviations:AnalysisDeviation[];insights:AnalysisInsights;year:number;comparisonYear:number;income:number;expenses:number;net:number;priorIncome:number;priorExpenses:number;priorNet:number;periodStart:string;periodEnd:string};
type LegendTone="accent"|"success"|"muted"|"negative"|"warning"|"multi";
type LegendItem={label:string;tone:LegendTone};
type DetailRow={label:string;value:string};
type ChartDetail={title:string;rows:DetailRow[]};

const STORAGE_KEY="financial-app.analysis.visual-layout.v3";
const DEFAULT_ORDER:ChartId[]=[
  "monthly-flow","net-trend","income-trend","expense-trend","savings-rate","expense-ratio","cumulative-net","net-diverging",
  "income-prior","expense-prior","year-compare","annual-waterfall","rolling-expenses","rolling-net","expense-average","income-average",
  "category-donut","category-bars","category-treemap","category-pareto","merchant-bars","merchant-pareto","deviations","monthly-heatmap",
];
const LABELS:Record<ChartId,string>={
  "monthly-flow":"Ingresos y gastos por mes","net-trend":"Evolución del Cash Flow","income-trend":"Evolución de ingresos","expense-trend":"Evolución de gastos",
  "savings-rate":"Tasa de ahorro mensual","expense-ratio":"Peso del gasto sobre ingresos","cumulative-net":"Cash Flow acumulado","net-diverging":"Meses positivos y negativos",
  "income-prior":"Ingresos frente al mismo periodo anterior","expense-prior":"Gastos frente al mismo periodo anterior","year-compare":"Comparativa del periodo","annual-waterfall":"Puente ingresos → gastos → Cash Flow",
  "rolling-expenses":"Media móvil de gasto · 3 meses","rolling-net":"Media móvil de Cash Flow · 3 meses","expense-average":"Gasto frente a su media mensual","income-average":"Ingresos frente a su media mensual",
  "category-donut":"Distribución del gasto","category-bars":"Ranking de categorías","category-treemap":"Mapa de categorías","category-pareto":"Pareto de categorías",
  "merchant-bars":"Principales comercios","merchant-pareto":"Pareto de comercios","deviations":"Desviaciones de gasto","monthly-heatmap":"Mapa de intensidad mensual",
};
const MONTHS=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const avg=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const pct=(current:number,previous:number)=>previous>0?((current-previous)/previous)*100:null;
const available=(months:AnalysisMonth[])=>months.filter(month=>month.available);
const rolling=(values:number[],width=3)=>values.map((_,index)=>avg(values.slice(Math.max(0,index-width+1),index+1)));
const monthLabel=(value:string)=>{const [year,month]=value.split("-");return `${MONTHS[Math.max(0,Number(month)-1)]} ${year.slice(2)}`};
const rangeLabel=(from:string,to:string)=>`${from.split("-").reverse().join("/")} – ${to.split("-").reverse().join("/")}`;
const points=(values:number[],width:number,height:number,pad=26,domain?:{min:number;max:number})=>{
  if(!values.length)return "";
  const min=domain?.min??Math.min(0,...values),max=domain?.max??Math.max(0,...values);const span=Math.max(1,max-min);
  return values.map((value,index)=>{const x=pad+(index*(width-pad*2))/Math.max(1,values.length-1);const y=pad+((max-value)/span)*(height-pad*2);return `${x},${y}`}).join(" ");
};
const detailProps=(title:string,rows:DetailRow[])=>({
  "data-chart-detail":JSON.stringify({title,rows}),
  role:"button" as const,
  tabIndex:0,
  "aria-label":`${title}. ${rows.map(row=>`${row.label}: ${row.value}`).join(". ")}`,
});
function parseDetail(element:Element){const raw=element.getAttribute("data-chart-detail");if(!raw)return null;try{const parsed=JSON.parse(raw) as ChartDetail;return parsed&&typeof parsed.title==="string"&&Array.isArray(parsed.rows)?parsed:null}catch{return null}}

function legendFor(id:ChartId):LegendItem[]{
  switch(id){
    case "monthly-flow":return[{label:"Ingresos",tone:"success"},{label:"Gastos",tone:"accent"}];
    case "net-trend":case "income-prior":case "expense-prior":case "year-compare":return[{label:"Periodo seleccionado",tone:"accent"},{label:"Mismo periodo -1 año",tone:"muted"}];
    case "income-trend":return[{label:"Ingresos",tone:"success"}];
    case "expense-trend":return[{label:"Gastos",tone:"accent"}];
    case "savings-rate":return[{label:"Tasa de ahorro",tone:"accent"}];
    case "expense-ratio":return[{label:"Gasto / ingresos",tone:"warning"}];
    case "cumulative-net":return[{label:"Cash Flow acumulado",tone:"accent"}];
    case "net-diverging":return[{label:"Cash Flow positivo",tone:"success"},{label:"Cash Flow negativo",tone:"negative"}];
    case "annual-waterfall":return[{label:"Ingresos",tone:"success"},{label:"Gastos",tone:"negative"},{label:"Cash Flow",tone:"accent"}];
    case "rolling-expenses":return[{label:"Media móvil de gasto",tone:"accent"}];
    case "rolling-net":return[{label:"Media móvil de Cash Flow",tone:"accent"}];
    case "expense-average":case "income-average":return[{label:"Por encima de la media",tone:"accent"},{label:"Por debajo de la media",tone:"muted"}];
    case "category-donut":return[{label:"Cada color representa una categoría",tone:"multi"}];
    case "category-bars":return[{label:"Importe por categoría",tone:"accent"}];
    case "category-treemap":return[{label:"Tamaño = peso del gasto",tone:"multi"}];
    case "category-pareto":case "merchant-pareto":return[{label:"Importe",tone:"accent"},{label:"% acumulado",tone:"success"}];
    case "merchant-bars":return[{label:"Importe por comercio",tone:"success"}];
    case "deviations":return[{label:"Periodo actual",tone:"accent"},{label:"Media 3 meses",tone:"muted"}];
    case "monthly-heatmap":return[{label:"Menor intensidad",tone:"muted"},{label:"Mayor intensidad",tone:"accent"}];
  }
}

function ChartCard({id,title,subtitle,children,onMove,onHide,index,total}:{id:ChartId;title:string;subtitle:string;children:ReactNode;onMove:(id:ChartId,offset:number)=>void;onHide:(id:ChartId)=>void;index:number;total:number}){
  const [detail,setDetail]=useState<ChartDetail|null>(null);
  const [position,setPosition]=useState({x:18,y:92});
  const cardRef=useRef<HTMLElement|null>(null);
  const open=(target:EventTarget|null,clientX?:number,clientY?:number)=>{
    if(!(target instanceof Element))return;
    const mark=target.closest("[data-chart-detail]");if(!mark)return;
    const next=parseDetail(mark);if(!next)return;
    if(cardRef.current&&clientX!=null&&clientY!=null){const rect=cardRef.current.getBoundingClientRect();setPosition({x:clamp(clientX-rect.left+10,12,Math.max(12,rect.width-292)),y:clamp(clientY-rect.top+10,72,Math.max(72,rect.height-168))})}
    else setPosition({x:18,y:92});
    setDetail(next);
  };
  const click=(event:MouseEvent<HTMLElement>)=>open(event.target,event.clientX,event.clientY);
  const key=(event:KeyboardEvent<HTMLElement>)=>{if(event.key==="Escape"){setDetail(null);return}if(event.key!=="Enter"&&event.key!==" ")return;if(!(event.target instanceof Element)||!event.target.closest("[data-chart-detail]"))return;event.preventDefault();open(event.target)};
  const legend=legendFor(id);
  return <article ref={cardRef} className="analysis-viz-card" draggable onDragStart={event=>{const target=event.target;if(target instanceof Element&&target.closest("button,[data-chart-detail]")){event.preventDefault();return}event.dataTransfer.setData("text/plain",id)}} data-chart-id={id} onClick={click} onKeyDown={key}>
    <div className="analysis-viz-head"><div><span>{title}</span><small>{subtitle}</small></div><div className="analysis-viz-actions"><button className="icon-button" type="button" onClick={()=>onMove(id,-1)} disabled={index===0} aria-label={`Mover ${title} antes`}>←</button><button className="icon-button" type="button" onClick={()=>onMove(id,1)} disabled={index===total-1} aria-label={`Mover ${title} después`}>→</button><button className="icon-button" type="button" onClick={()=>onHide(id)} aria-label={`Ocultar ${title}`}>×</button></div></div>
    <div className="analysis-chart-legend" aria-label={`Leyenda de ${title}`}>{legend.map((item,itemIndex)=><span key={`${item.label}-${itemIndex}`}><i className={`legend-${item.tone}`}/>{item.label}</span>)}</div>
    <div className="analysis-viz-body">{children}</div>
    {detail&&<aside className="analysis-chart-popover" style={{left:position.x,top:position.y}} role="dialog" aria-label={`Detalle: ${detail.title}`}><div><strong>{detail.title}</strong><button className="icon-button" type="button" onClick={()=>setDetail(null)} aria-label="Cerrar detalle">×</button></div><dl>{detail.rows.map((row,rowIndex)=><div key={`${row.label}-${rowIndex}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></aside>}
  </article>;
}

function MonthlyFlowChart({months}:{months:AnalysisMonth[]}){const shown=available(months);const max=Math.max(1,...shown.flatMap(month=>[month.income,month.expenses]));return <div className="analysis-bar-chart" role="img" aria-label="Ingresos y gastos mensuales">{shown.map(month=><div className="analysis-bar-group" key={month.month}><div className="analysis-bar-pair"><i className="income" style={{height:`${clamp(month.income/max*100,2,100)}%`}} {...detailProps(monthLabel(month.month),[{label:"Serie",value:"Ingresos"},{label:"Importe",value:formatEuro(month.income)}])}/><i className="expense" style={{height:`${clamp(month.expenses/max*100,2,100)}%`}} {...detailProps(monthLabel(month.month),[{label:"Serie",value:"Gastos"},{label:"Importe",value:formatEuro(month.expenses)}])}/></div><span>{monthLabel(month.month)}</span></div>)}</div>}

function LineChart({values,secondary,labels,aria,percent=false,primaryLabel="Periodo seleccionado",secondaryLabel="Mismo periodo -1 año"}:{values:number[];secondary?:number[];labels:string[];aria:string;percent?:boolean;primaryLabel?:string;secondaryLabel?:string}){
  const width=720,height=230;const all=secondary?[...values,...secondary]:values;const domain={min:Math.min(0,...all),max:Math.max(0,...all)};const primary=points(values,width,height,26,domain);const second=secondary?points(secondary,width,height,26,domain):"";const zeroY=26+((domain.max-0)/Math.max(1,domain.max-domain.min))*(height-52);const format=(value:number)=>percent?formatPercent(value,1):formatEuro(value);
  return <div className="analysis-svg-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria}><line className="viz-zero" x1="26" x2={width-26} y1={zeroY} y2={zeroY}/>{secondary&&<polyline className="viz-line-secondary" points={second}/>}<polyline className="viz-line-primary" points={primary}/>{secondary&&secondary.map((value,index)=>{const [x,y]=(second.split(" ")[index]||"0,0").split(",");return <circle key={`${aria}-secondary-${index}`} className="viz-point viz-point-secondary" cx={x} cy={y} r="4" {...detailProps(labels[index],[{label:"Serie",value:secondaryLabel},{label:"Valor",value:format(value)}])}/>})}{values.map((value,index)=>{const [x,y]=(primary.split(" ")[index]||"0,0").split(",");return <circle key={`${aria}-primary-${index}`} className="viz-point" cx={x} cy={y} r="4" {...detailProps(labels[index],[{label:"Serie",value:primaryLabel},{label:"Valor",value:format(value)}])}/>})}</svg></div>;
}
function SavingsRateChart({months}:{months:AnalysisMonth[]}){const shown=available(months);const rates=shown.map(month=>month.income>0?month.net/month.income*100:0);return <LineChart values={rates} labels={shown.map(month=>monthLabel(month.month))} aria="Tasa de ahorro mensual" percent primaryLabel="Tasa de ahorro"/>}
function CumulativeNetChart({months}:{months:AnalysisMonth[]}){const shown=available(months);let total=0;const values=shown.map(month=>(total+=month.net));return <LineChart values={values} labels={shown.map(month=>monthLabel(month.month))} aria="Cash Flow acumulado" primaryLabel="Cash Flow acumulado"/>}
function MetricTrend({months,metric,prior=false}:{months:AnalysisMonth[];metric:"income"|"expenses";prior?:boolean}){const shown=available(months);const priorKey=metric==="income"?"priorIncome":"priorExpenses";const label=metric==="income"?"Ingresos":"Gastos";return <LineChart values={shown.map(month=>month[metric])} secondary={prior?shown.map(month=>Number(month[priorKey]||0)):undefined} labels={shown.map(month=>monthLabel(month.month))} aria={`${label}${prior?" frente al mismo periodo anterior":" mensuales"}`} primaryLabel={label} secondaryLabel={`${label} · mismo periodo -1 año`}/>}
function ExpenseRatio({months}:{months:AnalysisMonth[]}){const shown=available(months);const values=shown.map(month=>month.income>0?month.expenses/month.income*100:0);return <LineChart values={values} labels={shown.map(month=>monthLabel(month.month))} aria="Peso del gasto sobre ingresos" percent primaryLabel="Gasto / ingresos"/>}
function RollingMetric({months,metric}:{months:AnalysisMonth[];metric:"expenses"|"net"}){const shown=available(months);const label=metric==="expenses"?"Media móvil de gasto":"Media móvil de Cash Flow";return <LineChart values={rolling(shown.map(month=>month[metric]))} labels={shown.map(month=>monthLabel(month.month))} aria={`${label} de tres meses`} primaryLabel={label}/>}

function CategoryDonut({categories}:{categories:AnalysisCategory[]}){const shown=categories.slice(0,6);const total=shown.reduce((sum,category)=>sum+category.amount,0);let offset=0;return <div className="analysis-donut-layout"><svg className="analysis-donut" viewBox="0 0 42 42" role="img" aria-label="Distribución del gasto por categorías"><circle className="donut-base" cx="21" cy="21" r="15.9"/>{shown.map((category,index)=>{const share=total?category.amount/total*100:0;const dash=`${share} ${100-share}`;const node=<circle key={category.category} className={`donut-segment segment-${index+1}`} cx="21" cy="21" r="15.9" strokeDasharray={dash} strokeDashoffset={-offset} {...detailProps(category.category,[{label:"Importe",value:formatEuro(category.amount)},{label:"Peso",value:formatPercent(category.share,1)},{label:"Movimientos",value:String(category.movements)}])}/>;offset+=share;return node})}<text x="21" y="20.5" textAnchor="middle" className="donut-center-value">{formatPercent(shown.reduce((sum,category)=>sum+category.share,0),0)}</text><text x="21" y="24" textAnchor="middle" className="donut-center-label">top 6</text></svg><ol className="analysis-mini-legend">{shown.map((category,index)=><li key={category.category}><i className={`segment-${index+1}`}/><span>{category.category}</span><strong>{formatEuro(category.amount)}</strong></li>)}</ol></div>}
function RankingBars({items,kind}:{items:{label:string;value:number;meta:string}[];kind:"category"|"merchant"}){const max=Math.max(1,...items.map(item=>item.value));return <div className={`analysis-ranking-bars ${kind}`}>{items.map(item=><div key={item.label}><div><span>{item.label}</span><strong>{formatEuro(item.value)}</strong></div><div className="analysis-ranking-track"><i style={{width:`${clamp(item.value/max*100,1,100)}%`}} {...detailProps(item.label,[{label:"Importe",value:formatEuro(item.value)},{label:"Detalle",value:item.meta}])}/></div><small>{item.meta}</small></div>)}</div>}
function YearCompare({income,expenses,net,priorIncome,priorExpenses,priorNet}:Pick<Props,"income"|"expenses"|"net"|"priorIncome"|"priorExpenses"|"priorNet">){const rows=[{label:"Ingresos",current:income,prior:priorIncome},{label:"Gastos",current:expenses,prior:priorExpenses},{label:"Cash Flow",current:Math.abs(net),prior:Math.abs(priorNet)}];const max=Math.max(1,...rows.flatMap(row=>[row.current,row.prior]));return <div className="analysis-year-bars">{rows.map(row=><div key={row.label}><span>{row.label}</span><div className="analysis-year-pair"><i className="current" style={{width:`${row.current/max*100}%`}} {...detailProps(row.label,[{label:"Serie",value:"Periodo seleccionado"},{label:"Importe",value:formatEuro(row.current)}])}/><i className="prior" style={{width:`${row.prior/max*100}%`}} {...detailProps(row.label,[{label:"Serie",value:"Mismo periodo -1 año"},{label:"Importe",value:formatEuro(row.prior)}])}/></div><small>Actual {formatEuro(row.current)} · anterior {formatEuro(row.prior)}</small></div>)}</div>}
function DeviationsChart({deviations}:{deviations:AnalysisDeviation[]}){const shown=deviations.slice(0,8);const max=Math.max(1,...shown.flatMap(deviation=>[deviation.current,deviation.previous3MonthAverage]));return <div className="analysis-deviation-bars">{shown.map(deviation=><div key={deviation.category}><div><span>{deviation.category}</span><strong className={deviation.changePercent!=null&&deviation.changePercent>0?"negative":"positive"}>{deviation.changePercent==null?"Nuevo":formatSignedPercent(deviation.changePercent,1)}</strong></div><div className="analysis-deviation-pair"><i className="current" style={{width:`${deviation.current/max*100}%`}} {...detailProps(deviation.category,[{label:"Serie",value:"Periodo actual"},{label:"Gasto",value:formatEuro(deviation.current)},{label:"Cambio",value:deviation.changePercent==null?"Nuevo":formatSignedPercent(deviation.changePercent,1)}])}/><i className="baseline" style={{width:`${deviation.previous3MonthAverage/max*100}%`}} {...detailProps(deviation.category,[{label:"Serie",value:"Media comparable 3 meses"},{label:"Gasto",value:formatEuro(deviation.previous3MonthAverage)}])}/></div></div>)}</div>}
function Heatmap({months}:{months:AnalysisMonth[]}){const max=Math.max(1,...months.map(month=>month.expenses));return <div className="analysis-heatmap" role="img" aria-label="Intensidad de gasto por mes">{months.map(month=><div key={month.month} className={month.available?"available":"empty"} style={{"--heat":String(clamp(month.expenses/max,0,1))} as CSSProperties} {...detailProps(monthLabel(month.month),[{label:"Gasto",value:formatEuro(month.expenses)},{label:"Ingresos",value:formatEuro(month.income)},{label:"Cash Flow",value:formatEuro(month.net)}])}><span>{monthLabel(month.month)}</span><strong>{month.available?formatEuro(month.expenses):"—"}</strong></div>)}</div>}

function DivergingNet({months}:{months:AnalysisMonth[]}){const shown=available(months);const max=Math.max(1,...shown.map(month=>Math.abs(month.net)));return <div className="analysis-diverging">{shown.map(month=>{const width=clamp(Math.abs(month.net)/max*48,1,48);return <div key={month.month}><span>{monthLabel(month.month)}</span><div className="analysis-diverging-track"><i className={month.net>=0?"positive-bar":"negative-bar"} style={month.net>=0?{left:"50%",width:`${width}%`}:{right:"50%",width:`${width}%`}} {...detailProps(monthLabel(month.month),[{label:"Cash Flow",value:formatEuro(month.net)},{label:"Ingresos",value:formatEuro(month.income)},{label:"Gastos",value:formatEuro(month.expenses)}])}/></div><strong className={month.net<0?"negative":"positive"}>{formatEuro(month.net)}</strong></div>})}</div>}
function AverageDeviation({months,metric}:{months:AnalysisMonth[];metric:"expenses"|"income"}){const shown=available(months);const mean=avg(shown.map(month=>month[metric]));const deltas=shown.map(month=>mean>0?(month[metric]-mean)/mean*100:0);const max=Math.max(1,...deltas.map(Math.abs));const metricLabel=metric==="expenses"?"Gasto":"Ingresos";return <div className="analysis-average-deviation">{shown.map((month,index)=>{const delta=deltas[index];const width=clamp(Math.abs(delta)/max*48,1,48);return <div key={month.month}><span>{monthLabel(month.month)}</span><div><i className={delta>=0?"above":"below"} style={delta>=0?{left:"50%",width:`${width}%`}:{right:"50%",width:`${width}%`}} {...detailProps(monthLabel(month.month),[{label:metricLabel,value:formatEuro(month[metric])},{label:"Media del periodo",value:formatEuro(mean)},{label:"Desviación",value:formatSignedPercent(delta,1)}])}/></div><small>{formatSignedPercent(delta,1)}</small></div>})}</div>}
function Pareto({items,aria}:{items:{label:string;value:number}[];aria:string}){const shown=items.slice(0,8);const total=Math.max(1,shown.reduce((sum,item)=>sum+item.value,0));const max=Math.max(1,...shown.map(item=>item.value));let cumulative=0;const width=720,height=250,pad=30,innerW=width-pad*2,innerH=height-70,step=innerW/Math.max(1,shown.length),barW=Math.max(12,step*.45);const cumulativeValues=shown.map(item=>{cumulative+=item.value;return cumulative/total*100});const pts=cumulativeValues.map((value,index)=>`${pad+step*(index+.5)},${20+(1-value/100)*innerH}`).join(" ");return <div className="analysis-pareto"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria}>{shown.map((item,index)=>{const barHeight=item.value/max*innerH,x=pad+step*(index+.5)-barW/2;return <g key={item.label}><rect x={x} y={20+innerH-barHeight} width={barW} height={barHeight} rx="4" {...detailProps(item.label,[{label:"Importe",value:formatEuro(item.value)},{label:"Peso acumulado",value:formatPercent(cumulativeValues[index],1)}])}/><text x={pad+step*(index+.5)} y={height-12} textAnchor="middle">{item.label.slice(0,8)}</text></g>})}<polyline points={pts}/>{cumulativeValues.map((value,index)=>{const x=pad+step*(index+.5),y=20+(1-value/100)*innerH;return <circle key={`pareto-${index}`} className="pareto-point" cx={x} cy={y} r="4" {...detailProps(shown[index]?.label||"Acumulado",[{label:"Acumulado",value:formatPercent(value,1)},{label:"Importe",value:formatEuro(shown[index]?.value||0)}])}/>})}</svg></div>}
function CategoryTreemap({categories}:{categories:AnalysisCategory[]}){const shown=categories.slice(0,10);return <div className="analysis-treemap" role="img" aria-label="Mapa proporcional del gasto por categorías">{shown.map((category,index)=><div key={category.category} className={`segment-${(index%6)+1}`} style={{flexGrow:Math.max(1,category.share),flexBasis:`${Math.max(110,category.share*8)}px`}} {...detailProps(category.category,[{label:"Importe",value:formatEuro(category.amount)},{label:"Peso",value:formatPercent(category.share,1)},{label:"Movimientos",value:String(category.movements)}])}><span>{category.category}</span><strong>{formatPercent(category.share,1)}</strong></div>)}</div>}
function AnnualWaterfall({income,expenses,net}:{income:number;expenses:number;net:number}){const width=720,height=250,pad=34;const max=Math.max(1,income,expenses,Math.abs(net));const scale=(value:number)=>Math.abs(value)/max*(height-70);const incomeH=scale(income),expenseH=scale(expenses),netH=scale(net);const base=height-32;const expenseTop=base-incomeH;const expenseBottom=expenseTop+expenseH;return <div className="analysis-waterfall"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Puente del periodo desde ingresos hasta Cash Flow"><line x1={pad} x2={width-pad} y1={base} y2={base}/><rect className="wf-income" x="80" y={base-incomeH} width="120" height={incomeH} rx="6" {...detailProps("Ingresos",[{label:"Importe",value:formatEuro(income)}])}/><rect className="wf-expense" x="300" y={expenseTop} width="120" height={expenseH} rx="6" {...detailProps("Gastos",[{label:"Importe",value:formatEuro(expenses)}])}/><rect className={net>=0?"wf-net-positive":"wf-net-negative"} x="520" y={net>=0?base-netH:base} width="120" height={netH} rx="6" {...detailProps("Cash Flow",[{label:"Importe",value:formatEuro(net)},{label:"Resultado",value:net>=0?"Positivo":"Negativo"}])}/><line className="wf-bridge" x1="200" x2="300" y1={base-incomeH} y2={base-incomeH}/><line className="wf-bridge" x1="420" x2="520" y1={expenseBottom} y2={expenseBottom}/><text x="140" y={height-10} textAnchor="middle">Ingresos</text><text x="360" y={height-10} textAnchor="middle">Gastos</text><text x="580" y={height-10} textAnchor="middle">Cash Flow</text></svg></div>}

export function AnalysisVisualDashboard(props:Props){
  const [order,setOrder]=useState<ChartId[]>(DEFAULT_ORDER);const [hidden,setHidden]=useState<ChartId[]>([]);const [customizing,setCustomizing]=useState(false);const [status,setStatus]=useState("");const [hydrated,setHydrated]=useState(false);
  useEffect(()=>{try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const saved=JSON.parse(raw) as {order?:ChartId[];hidden?:ChartId[]};if(Array.isArray(saved.order)){const valid=saved.order.filter(id=>DEFAULT_ORDER.includes(id));setOrder([...valid,...DEFAULT_ORDER.filter(id=>!valid.includes(id))])}if(Array.isArray(saved.hidden))setHidden(saved.hidden.filter(id=>DEFAULT_ORDER.includes(id)))}}catch{setStatus("No se pudo recuperar la personalización guardada.")}finally{setHydrated(true)}},[]);
  useEffect(()=>{if(!hydrated)return;try{localStorage.setItem(STORAGE_KEY,JSON.stringify({order,hidden}))}catch{setStatus("La personalización no se pudo guardar en este dispositivo.")}},[hydrated,order,hidden]);
  const visible=order.filter(id=>!hidden.includes(id));
  const reports=useMemo(()=>{const complete=props.months.filter(month=>month.available&&month.complete&&!month.partial);const last=complete.at(-1);const last3=complete.slice(-3);const avg3=last3.length?last3.reduce((sum,month)=>sum+month.expenses,0)/last3.length:0;const incomeChange=pct(props.income,props.priorIncome);const expenseChange=pct(props.expenses,props.priorExpenses);return [
    {label:"Último mes cerrado",value:last?formatEuro(last.net):"—",detail:last?`${monthLabel(last.month)}: ${formatEuro(last.income)} ingresos · ${formatEuro(last.expenses)} gastos`:"Aún no hay un mes completo dentro del periodo."},
    {label:"Media últimos 3 meses",value:last3.length?formatEuro(avg3):"—",detail:"Gasto mensual medio de los últimos meses completos disponibles."},
    {label:"Ingresos vs -1 año",value:incomeChange==null?"—":formatSignedPercent(incomeChange,1),detail:"Mismo intervalo de fechas desplazado un año atrás."},
    {label:"Gastos vs -1 año",value:expenseChange==null?"—":formatSignedPercent(expenseChange,1),detail:"Mismo intervalo de fechas desplazado un año atrás."},
    {label:"Tasa de ahorro media",value:formatPercent(props.insights.savingsRatePercent,1),detail:`Calculada con ${props.insights.sampleMonths} meses comparables.`},
    {label:"Concentración top 3",value:formatPercent(props.insights.top3CategorySharePercent,1),detail:"Peso de las tres categorías de mayor gasto."},
  ]},[props]);
  const move=(id:ChartId,offset:number)=>setOrder(current=>{const from=current.indexOf(id),to=from+offset;if(from<0||to<0||to>=current.length)return current;const copy=[...current];copy.splice(from,1);copy.splice(to,0,id);setStatus("Orden de gráficos actualizado.");return copy});
  const hide=(id:ChartId)=>{setHidden(current=>current.includes(id)?current:[...current,id]);setStatus(`${LABELS[id]} ocultado.`)};
  const restore=(id:ChartId)=>{setHidden(current=>current.filter(value=>value!==id));setStatus(`${LABELS[id]} visible de nuevo.`)};
  const reset=()=>{setOrder([...DEFAULT_ORDER]);setHidden([]);setStatus("Diseño de Análisis restablecido.")};
  const drop=(target:ChartId,source:ChartId)=>{if(source===target)return;setOrder(current=>{const copy=current.filter(id=>id!==source);copy.splice(copy.indexOf(target),0,source);return copy});setStatus("Orden de gráficos actualizado.")};
  const render=(id:ChartId)=>{switch(id){
    case "monthly-flow":return <MonthlyFlowChart months={props.months}/>;
    case "net-trend":return <LineChart values={available(props.months).map(month=>month.net)} secondary={available(props.months).map(month=>month.priorNet||0)} labels={available(props.months).map(month=>monthLabel(month.month))} aria="Cash Flow del periodo frente al mismo periodo del año anterior" primaryLabel="Cash Flow · periodo seleccionado" secondaryLabel="Cash Flow · mismo periodo -1 año"/>;
    case "income-trend":return <MetricTrend months={props.months} metric="income"/>;
    case "expense-trend":return <MetricTrend months={props.months} metric="expenses"/>;
    case "savings-rate":return <SavingsRateChart months={props.months}/>;
    case "expense-ratio":return <ExpenseRatio months={props.months}/>;
    case "cumulative-net":return <CumulativeNetChart months={props.months}/>;
    case "net-diverging":return <DivergingNet months={props.months}/>;
    case "income-prior":return <MetricTrend months={props.months} metric="income" prior/>;
    case "expense-prior":return <MetricTrend months={props.months} metric="expenses" prior/>;
    case "year-compare":return <YearCompare {...props}/>;
    case "annual-waterfall":return <AnnualWaterfall income={props.income} expenses={props.expenses} net={props.net}/>;
    case "rolling-expenses":return <RollingMetric months={props.months} metric="expenses"/>;
    case "rolling-net":return <RollingMetric months={props.months} metric="net"/>;
    case "expense-average":return <AverageDeviation months={props.months} metric="expenses"/>;
    case "income-average":return <AverageDeviation months={props.months} metric="income"/>;
    case "category-donut":return <CategoryDonut categories={props.categories}/>;
    case "category-bars":return <RankingBars kind="category" items={props.categories.slice(0,8).map(category=>({label:category.category,value:category.amount,meta:`${formatPercent(category.share,1)} · ${category.movements} movimientos`}))}/>;
    case "category-treemap":return <CategoryTreemap categories={props.categories}/>;
    case "category-pareto":return <Pareto aria="Pareto de categorías" items={props.categories.map(category=>({label:category.category,value:category.amount}))}/>;
    case "merchant-bars":return <RankingBars kind="merchant" items={props.merchants.slice(0,8).map(merchant=>({label:merchant.merchant,value:merchant.amount,meta:`${merchant.movements} movimientos`}))}/>;
    case "merchant-pareto":return <Pareto aria="Pareto de comercios" items={props.merchants.map(merchant=>({label:merchant.merchant,value:merchant.amount}))}/>;
    case "deviations":return <DeviationsChart deviations={props.deviations}/>;
    case "monthly-heatmap":return <Heatmap months={props.months}/>;
  }};
  const selectedRange=rangeLabel(props.periodStart,props.periodEnd);
  return <section className="analysis-visual-section" aria-labelledby="analysis-visual-title">
    <div className="panel-head analysis-visual-toolbar"><div><p className="eyebrow">PANEL VISUAL</p><h2 id="analysis-visual-title">24 gráficos e informes rápidos</h2><p>Pulsa o toca cualquier barra, punto, segmento, celda o bloque para abrir su detalle flotante. Todos los gráficos muestran una leyenda y usan exactamente el periodo seleccionado: {selectedRange}.</p></div><div><button className="ghost" type="button" onClick={()=>setCustomizing(value=>!value)}>{customizing?"Cerrar personalización":"Personalizar gráficos"}</button><button className="ghost" type="button" onClick={reset}>Restablecer</button></div></div>
    {customizing&&<div className="analysis-viz-customizer" aria-label="Seleccionar gráficos">{DEFAULT_ORDER.map(id=><label key={id}><input type="checkbox" checked={!hidden.includes(id)} onChange={event=>event.target.checked?restore(id):hide(id)}/><span>{LABELS[id]}</span></label>)}</div>}
    <div className="analysis-quick-reports" aria-label="Informes rápidos">{reports.map(report=><article key={report.label}><span>{report.label}</span><strong>{report.value}</strong><small>{report.detail}</small></article>)}</div>
    <div className="analysis-viz-grid" onDragOver={event=>event.preventDefault()}>{visible.map((id,index)=><div key={id} onDrop={event=>{event.preventDefault();const source=event.dataTransfer.getData("text/plain") as ChartId;if(DEFAULT_ORDER.includes(source))drop(id,source)}}><ChartCard id={id} title={LABELS[id]} subtitle={id==="deviations"?"Actual frente a media comparable de 3 meses":id.startsWith("rolling")?`Media móvil · ${selectedRange}`:id.includes("prior")||id==="net-trend"||id==="year-compare"?"Periodo seleccionado frente al mismo intervalo -1 año":selectedRange} onMove={move} onHide={hide} index={index} total={visible.length}>{render(id)}</ChartCard></div>)}</div>
    {hidden.length>0&&<div className="analysis-hidden-note"><span>{hidden.length} gráfico{hidden.length===1?"":"s"} oculto{hidden.length===1?"":"s"}.</span><button className="ghost" type="button" onClick={()=>setHidden([])}>Mostrar todos</button></div>}
    <p className="sr-only" role="status" aria-live="polite">{status}</p>
  </section>;
}
