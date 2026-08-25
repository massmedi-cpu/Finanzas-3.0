"use client";

import {useState} from "react";
import type {AnalysisPeriodKey} from "@/lib/financial/analysis-period";

type Props={years:number[];year:number;period:AnalysisPeriodKey;from:string;to:string;maxDate:string};
const PERIODS:{value:AnalysisPeriodKey;label:string}[]=[
  {value:"year",label:"Año / año hasta hoy"},{value:"month",label:"Mes actual"},{value:"previous-month",label:"Mes anterior"},{value:"last30",label:"Últimos 30 días"},
  {value:"last3",label:"Últimos 3 meses"},{value:"last6",label:"Últimos 6 meses"},{value:"last12",label:"Últimos 12 meses"},{value:"q1",label:"1.er trimestre"},
  {value:"q2",label:"2.º trimestre"},{value:"q3",label:"3.er trimestre"},{value:"q4",label:"4.º trimestre"},{value:"custom",label:"Personalizado"},
];

export function AnalysisPeriodForm({years,year,period,from,to,maxDate}:Props){
  const [selected,setSelected]=useState<AnalysisPeriodKey>(period);const custom=selected==="custom";const rolling=selected==="month"||selected==="previous-month"||selected==="last30"||selected==="last3"||selected==="last6"||selected==="last12";
  return <form className="analysis-period-form" action="/analisis" method="get">
    <label>Periodo<select name="period" value={selected} onChange={event=>setSelected(event.target.value as AnalysisPeriodKey)}>{PERIODS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label>Año<select name="year" defaultValue={String(year)} disabled={rolling}>{years.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
    <label>Desde<input type="date" name="from" defaultValue={from} max={maxDate} disabled={!custom}/></label>
    <label>Hasta<input type="date" name="to" defaultValue={to} max={maxDate} disabled={!custom}/></label>
    <button className="primary-action" type="submit">Aplicar periodo</button>
    <small>{custom?"El periodo personalizado se aplica a cifras, gráficos, categorías, comercios y comparativas.":"El periodo elegido se aplica a todo el módulo de Análisis, no solo a las gráficas."}</small>
  </form>;
}
