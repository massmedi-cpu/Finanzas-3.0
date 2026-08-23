import { formatEuro, formatInteger, formatNumber, formatPercent, formatSignedPercent } from "@/lib/format/es-es";
import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { APP_VERSION } from "@/lib/app-version";
import { getAnalysisOverview } from "@/lib/financial/analysis";
import { buildAnalysisInsights } from "@/lib/financial/analysis-insights";
import { movementState, movementUrl } from "@/lib/financial/movement-query";
import { AnalysisTrendChart } from "@/components/analysis-trend-chart";


const pct=(v:number|null)=>formatSignedPercent(v,1);
const plainPct=(v:number|null)=>formatPercent(v,1);
const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
export const dynamic="force-dynamic";

function coverageCopy(value:"high"|"medium"|"low"){
  if(value==="high")return "Alta";
  if(value==="medium")return "Media";
  return "Limitada";
}

export default async function AnalysisPage({searchParams}:{searchParams:Promise<{year?:string}>}){
  await requireAuthorizedUser();
  const params=await searchParams;const y=Number(params.year);const requested=Number.isInteger(y)&&y>=2000&&y<=2100?y:undefined;
  const data=await getAnalysisOverview(requested);
  const insights=buildAnalysisInsights(data);
  const baseMovements=movementState({from:data.periodStart,to:data.periodEnd,cashFlowOnly:true});
  const allMovementsUrl=movementUrl(baseMovements);
  const incomeMovementsUrl=movementUrl({...baseMovements,min:"0.01"});
  const expenseMovementsUrl=movementUrl({...baseMovements,max:"-0.01"});
  const deviationFrom=`${data.periodEnd.slice(0,7)}-01`;

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace analysis-workspace">
    <header className="topbar"><div><p className="eyebrow">ANÁLISIS · {APP_VERSION}</p><h1>Análisis financiero</h1><p>{dateFmt.format(new Date(data.periodStart+"T12:00:00"))} – {dateFmt.format(new Date(data.periodEnd+"T12:00:00"))} · comparativa homogénea con {data.comparisonYear}</p></div><form className="analysis-year" action="/analisis"><label>Año<select name="year" defaultValue={String(data.year)}>{data.years.map(year=><option key={year} value={year}>{year}</option>)}</select></label><button className="ghost" type="submit">Aplicar</button></form></header>

    <section className="analysis-summary">
      <article><Link className="analysis-summary-link" href={incomeMovementsUrl}><span>Ingresos</span><strong>{formatEuro(data.income)}</strong><small className={data.incomeChangePercent!=null&&data.incomeChangePercent<0?"negative":"positive"}>{pct(data.incomeChangePercent)} vs {data.comparisonYear}</small></Link></article>
      <article><Link className="analysis-summary-link" href={expenseMovementsUrl}><span>Gastos</span><strong>{formatEuro(data.expenses)}</strong><small className={data.expenseChangePercent!=null&&data.expenseChangePercent>0?"negative":"positive"}>{pct(data.expenseChangePercent)} vs {data.comparisonYear}</small></Link></article>
      <article className="analysis-net"><Link className="analysis-summary-link" href={allMovementsUrl}><span>Cash Flow</span><strong className={data.net<0?"negative":"positive"}>{formatEuro(data.net)}</strong><small>{formatEuro(data.netChange)} frente al periodo comparable</small></Link></article>
      <article><Link className="analysis-summary-link" href={allMovementsUrl}><span>Movimientos</span><strong>{formatInteger(data.movements)}</strong><small>{data.uncategorizedCount===0?"100 % de gastos con categoría":`${data.uncategorizedCount} sin categoría`}</small></Link></article>
    </section>

    <section className="analysis-insight-grid" aria-label="Lectura analítica del periodo">
      <article><span>Tasa de ahorro media</span><strong className={insights.savingsRatePercent!=null&&insights.savingsRatePercent<0?"negative":"positive"}>{plainPct(insights.savingsRatePercent)}</strong><small>Sobre {insights.sampleMonths} meses cerrados comparables.</small></article>
      <article><span>Gasto mensual medio</span><strong>{formatEuro(insights.averageMonthlyExpenses)}</strong><small>Solo meses completos; el mes parcial no distorsiona la media.</small></article>
      <article><span>Variabilidad del gasto</span><strong>{plainPct(insights.expenseVolatilityPercent)}</strong><small>Desviación relativa entre meses completos. Menor implica mayor estabilidad.</small></article>
      <article><span>Referencia anual de gasto</span><strong>{insights.annualizedExpenses==null?"—":formatEuro(insights.annualizedExpenses)}</strong><small>Media mensual × 12. Es una referencia lineal, no una previsión bancaria.</small></article>
    </section>

    <article className="panel analysis-trend-panel"><div className="panel-head"><div><p className="eyebrow">EVOLUCIÓN</p><h2>{data.year} frente a {data.comparisonYear}</h2></div><span className="pill">Mismo periodo</span></div><AnalysisTrendChart months={data.monthly} year={data.year} comparisonYear={data.comparisonYear} periodStart={data.periodStart} periodEnd={data.periodEnd}/></article>

    <div className="analysis-grid analysis-diagnostic-grid">
      <article className="panel analysis-diagnostics"><div className="panel-head"><div><p className="eyebrow">DIAGNÓSTICO</p><h2>Cómo se está comportando tu año</h2></div><span className={`pill coverage-${insights.coverage}`}>Cobertura {coverageCopy(insights.coverage)}</span></div><dl>
        <div><dt>Mejor mes cerrado</dt><dd>{insights.bestMonth?<><strong>{insights.bestMonth.label}</strong><span className={insights.bestMonth.net<0?"negative":"positive"}>{formatEuro(insights.bestMonth.net)}</span></>:"—"}</dd></div>
        <div><dt>Mes cerrado más débil</dt><dd>{insights.worstMonth?<><strong>{insights.worstMonth.label}</strong><span className={insights.worstMonth.net<0?"negative":"positive"}>{formatEuro(insights.worstMonth.net)}</span></>:"—"}</dd></div>
        <div><dt>Tendencia reciente del gasto</dt><dd><strong className={insights.recentExpenseTrendPercent!=null&&insights.recentExpenseTrendPercent>0?"negative":"positive"}>{pct(insights.recentExpenseTrendPercent)}</strong><span>media reciente frente al bloque anterior comparable</span></dd></div>
        <div><dt>Mejora reciente del Cash Flow</dt><dd><strong className={insights.recentNetDelta!=null&&insights.recentNetDelta<0?"negative":"positive"}>{insights.recentNetDelta==null?"—":formatEuro(insights.recentNetDelta)}</strong><span>cambio de media entre los dos últimos bloques completos</span></dd></div>
      </dl></article>
      <article className="panel analysis-concentration"><div className="panel-head"><div><p className="eyebrow">CONCENTRACIÓN</p><h2>Dónde se concentra el gasto</h2></div></div><dl>
        <div><dt>Top 3 categorías</dt><dd><strong>{plainPct(insights.top3CategorySharePercent)}</strong><span>del gasto categorizado del periodo</span></dd></div>
        <div><dt>Principal comercio</dt><dd><strong>{plainPct(insights.topMerchantSharePercent)}</strong><span>del gasto total del periodo</span></dd></div>
        <div><dt>Gasto categorizado</dt><dd><strong>{plainPct(insights.categorizationRatePercent)}</strong><span>{formatEuro(data.uncategorizedAmount)} todavía sin categoría</span></dd></div>
        <div><dt>Referencia anual de Cash Flow</dt><dd><strong className={insights.annualizedNet!=null&&insights.annualizedNet<0?"negative":"positive"}>{insights.annualizedNet==null?"—":formatEuro(insights.annualizedNet)}</strong><span>media de meses completos × 12; no es una predicción</span></dd></div>
      </dl></article>
    </div>

    <div className="analysis-grid">
      <article className="panel analysis-categories"><div className="panel-head"><div><p className="eyebrow">DISTRIBUCIÓN</p><h2>Gasto por categoría</h2></div><Link className="pill pill-link" href={expenseMovementsUrl}>Ver movimientos</Link></div><ol>{data.categories.map((c,i)=><li key={c.category}><Link className="analysis-drill-row" href={movementUrl({...baseMovements,category:c.category,max:"-0.01"})}><div><span><b>{i+1}</b>{c.category}</span><strong>{formatEuro(c.amount)}</strong></div><div className="analysis-progress"><i style={{width:`${Math.min(100,c.share)}%`}}/></div><small>{c.share.toLocaleString("es-ES")} % · {c.movements} movimientos</small></Link></li>)}</ol></article>
      <article className="panel analysis-deviations"><div className="panel-head"><div><p className="eyebrow">DESVIACIONES</p><h2>Qué está cambiando</h2></div></div>{data.deviations.length?<ul>{data.deviations.map(d=><li key={d.category}><Link className="analysis-drill-row" href={movementUrl({...baseMovements,from:deviationFrom,to:data.periodEnd,category:d.category,max:"-0.01"})}><div><strong>{d.category}</strong><span className={d.changePercent!=null&&d.changePercent>0?"negative":"positive"}>{d.changePercent==null?"Nuevo gasto":pct(d.changePercent)}</span></div><small>Periodo actual {formatEuro(d.current)} · media comparable 3 meses {formatEuro(d.previous3MonthAverage)}</small></Link></li>)}</ul>:<p className="analysis-empty">No hay desviaciones relevantes en el periodo.</p>}<p className="analysis-note">En el mes en curso se comparan solo los mismos días transcurridos de los tres meses anteriores.</p></article>
    </div>

    <div className="analysis-grid lower">
      <article className="panel analysis-merchants"><div className="panel-head"><div><p className="eyebrow">COMERCIOS</p><h2>Principales destinos del gasto</h2></div></div><ol>{data.merchants.map((m,i)=><li key={`${m.merchant}-${i}`}><Link className="analysis-drill-row merchant" href={movementUrl({...baseMovements,merchant:m.merchant,max:"-0.01"})}><span><b>{i+1}</b><span>{m.merchant}</span></span><div><strong>{formatEuro(m.amount)}</strong><small>{m.movements} mov.</small></div></Link></li>)}</ol></article>
      <article className="panel analysis-quality"><div className="panel-head"><div><p className="eyebrow">CALIDAD</p><h2>Base del análisis</h2></div></div><ul><li><span>Ahorro</span><strong>Excluido</strong></li><li><span>Traspasos internos</span><strong>Excluidos</strong></li><li><span>Duplicados</span><strong>Excluidos</strong></li><li><span>Gasto sin categoría</span><strong>{formatEuro(data.uncategorizedAmount)}</strong></li><li><span>Meses completos usados</span><strong>{insights.completeMonths}</strong></li><li><span>Comparación</span><strong>Igual periodo</strong></li></ul><p className="analysis-note">Los datos editados en Financial App prevalecen en categoría, contraparte y tipo sin modificar nunca el origen bancario.</p></article>
    </div>
  </section></main>;
}
