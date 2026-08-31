import Link from "next/link";
import { formatEuro } from "@/lib/format/es-es";
import type { ForecastLiquidityCommitment,ForecastLiquidityOverview } from "@/lib/financial/forecast-liquidity";

const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short"});
const fullDateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"long",year:"numeric"});
const pctFmt=new Intl.NumberFormat("es-ES",{style:"percent",maximumFractionDigits:0});
function dateLabel(value:string|null,full=false){if(!value)return"—";const date=new Date(`${value}T12:00:00`);return(full?fullDateFmt:dateFmt).format(date);}
function confidenceLabel(value:ForecastLiquidityCommitment["confidenceLevel"]){return value==="high"?"Alta":value==="medium"?"Media":"Baja";}
function sourceLabel(item:ForecastLiquidityCommitment){
  if(item.source==="document"||item.explanation.source==="pending_invoice_document")return"Factura pendiente";
  if(item.source==="manual")return"Añadido por ti";
  const source=String(item.explanation.source||"");
  if(source==="annual_tax_insurance_history"||source==="previous_year_seasonal")return"Historial anual";
  return"Patrón detectado";
}
function balanceClass(value:number){return value<0?"negative":value>0?"positive":"";}

function LiquidityChart({data}:{data:ForecastLiquidityOverview}){
  const width=960,height=220,padX=18,padY=18;
  const values=data.daily.map(x=>x.projectedBalance);
  const min=Math.min(0,...values),max=Math.max(0,...values);
  const span=Math.max(1,max-min);
  const points=data.daily.map((item,index)=>{
    const x=padX+(index/Math.max(1,data.daily.length-1))*(width-padX*2);
    const y=padY+((max-item.projectedBalance)/span)*(height-padY*2);
    return{x,y,item};
  });
  const minPoint=points.reduce((best,current)=>current.item.projectedBalance<best.item.projectedBalance?current:best,points[0]);
  const zeroY=padY+((max-0)/span)*(height-padY*2);
  return <div className="liquidity-chart-wrap">
    <svg className="liquidity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Saldo operativo proyectado desde ${dateLabel(data.startDate,true)} hasta ${dateLabel(data.endDate,true)}. Mínimo ${formatEuro(data.summary.minimumProjectedBalance)} el ${dateLabel(data.summary.minimumBalanceDate,true)}.`}>
      <line className="liquidity-zero" x1={padX} x2={width-padX} y1={zeroY} y2={zeroY}/>
      <polyline className="liquidity-line" points={points.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}/>
      {minPoint&&<circle className="liquidity-min-dot" cx={minPoint.x} cy={minPoint.y} r="5"/>}
    </svg>
    <div className="liquidity-chart-axis" aria-hidden="true"><span>{dateLabel(data.startDate)}</span><span>{dateLabel(data.endDate)}</span></div>
  </div>;
}

export function ForecastLiquidityDashboard({data,compact=false,showCommitments=true}:{data:ForecastLiquidityOverview;compact?:boolean;showCommitments?:boolean}){
  const horizons=[{label:"30 días",value:data.horizons.days30},{label:"60 días",value:data.horizons.days60},{label:"90 días",value:data.horizons.days90}].filter(item=>item.value!==null);
  const commitments=data.commitments.slice(0,compact?4:8);
  const danger=data.summary.daysBelowZero>0;
  return <section className={`liquidity-dashboard ${compact?"compact":""}`} aria-labelledby={compact?"liquidity-title-compact":"liquidity-title"}>
    <div className="liquidity-head"><div><p className="eyebrow">AGENDA FINANCIERA · {data.days} DÍAS</p><h2 id={compact?"liquidity-title-compact":"liquidity-title"}>Saldo futuro y próximos compromisos</h2><p>Parte del último saldo de tus cuentas operativas y aplica movimientos todavía pendientes del motor canónico, incluidas facturas recientes cuyo cargo aún no ha aparecido.</p></div>{compact&&<Link className="ghost button-link" href="/prevision">Abrir agenda completa</Link>}</div>

    <div className="liquidity-kpis">
      <article><span>Saldo operativo hoy</span><strong>{formatEuro(data.summary.openingBalance)}</strong><small>Último saldo disponible de cuentas operativas.</small></article>
      <article className={danger?"risk":""}><span>Saldo mínimo previsto</span><strong className={balanceClass(data.summary.minimumProjectedBalance)}>{formatEuro(data.summary.minimumProjectedBalance)}</strong><small>{dateLabel(data.summary.minimumBalanceDate,true)}{danger?` · ${data.summary.daysBelowZero} días bajo cero`:""}</small></article>
      <article><span>Saldo al final del horizonte</span><strong className={balanceClass(data.summary.projectedEndBalance)}>{formatEuro(data.summary.projectedEndBalance)}</strong><small>{formatEuro(data.summary.pendingNet)} netos todavía previstos.</small></article>
      <article><span>Compromisos pendientes</span><strong className="negative">{formatEuro(data.summary.pendingExpenses)}</strong><small>{data.summary.pendingEvents} eventos · {formatEuro(data.summary.pendingIncome)} de ingresos previstos.</small></article>
    </div>

    <div className="liquidity-main-grid">
      <article className="liquidity-trajectory"><div className="liquidity-panel-head"><div><span>Trayectoria de liquidez</span><small>Saldo al cierre de cada día tras aplicar los eventos esperados.</small></div>{data.summary.overdueEvents>0&&<span className="pill warning">{data.summary.overdueEvents} vencidos</span>}</div><LiquidityChart data={data}/><div className="liquidity-horizons">{horizons.map(item=><div key={item.label}><span>{item.label}</span><strong className={balanceClass(item.value??0)}>{formatEuro(item.value??0)}</strong></div>)}</div></article>

      <article className="liquidity-confidence"><div className="liquidity-panel-head"><div><span>Confianza del horizonte</span><small>No todas las previsiones tienen la misma evidencia.</small></div></div><dl><div><dt>Alta</dt><dd><strong>{data.confidence.high}</strong><span>patrones sólidos o manuales</span></dd></div><div><dt>Media</dt><dd><strong>{data.confidence.medium}</strong><span>evidencia suficiente</span></dd></div><div><dt>Baja</dt><dd><strong>{data.confidence.low}</strong><span>conviene revisar</span></dd></div></dl><p>Las facturas sin cargo usan una confianza prudente y nunca crean por sí solas una asociación bancaria.</p></article>
    </div>

    {showCommitments&&<article className="liquidity-commitments"><div className="liquidity-panel-head"><div><span>Próximos compromisos</span><small>Ordenados por fecha; los vencidos se reflejan desde hoy para no ocultar su impacto.</small></div></div>{commitments.length?<div className="liquidity-commitment-list">{commitments.map(item=><div key={item.id} className="liquidity-commitment"><time dateTime={item.estimatedDate}>{dateLabel(item.estimatedDate)}</time><div><strong>{item.title}</strong><small>{sourceLabel(item)} · confianza {confidenceLabel(item.confidenceLevel)} ({pctFmt.format(item.confidence)}) · ± {item.toleranceDays} días</small></div><div className="liquidity-commitment-value"><strong className={item.estimatedAmount<0?"negative":"positive"}>{formatEuro(item.estimatedAmount)}</strong><small>Saldo del día {formatEuro(item.projectedDayBalance)}</small></div></div>)}</div>:<p className="liquidity-empty">No hay compromisos pendientes en este horizonte.</p>}</article>}

    {!compact&&<details className="liquidity-data"><summary>Ver proyección diaria accesible</summary><div className="liquidity-table-wrap"><table><thead><tr><th>Fecha</th><th>Ingresos previstos</th><th>Gastos previstos</th><th>Neto</th><th>Saldo proyectado</th></tr></thead><tbody>{data.daily.map(item=><tr key={item.date}><th>{dateLabel(item.date,true)}</th><td>{formatEuro(item.income)}</td><td>{formatEuro(item.expenses)}</td><td>{formatEuro(item.net)}</td><td>{formatEuro(item.projectedBalance)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
