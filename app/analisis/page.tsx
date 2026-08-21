import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getAnalysisOverview } from "@/lib/financial/analysis";
import { AppSidebar } from "@/components/app-sidebar";
import { AnalysisTrendChart } from "@/components/analysis-trend-chart";

const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});
const pct=(v:number|null)=>v==null?"—":`${v>0?"+":""}${v.toLocaleString("es-ES",{maximumFractionDigits:1})} %`;
const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
export const dynamic="force-dynamic";

export default async function AnalysisPage({searchParams}:{searchParams:Promise<{year?:string}>}){
  await requireAuthorizedUser();
  const params=await searchParams;const y=Number(params.year);const requested=Number.isInteger(y)&&y>=2000&&y<=2100?y:undefined;
  const data=await getAnalysisOverview(requested);
  return <main className="app-shell"><AppSidebar active="/analisis" status="Análisis · reglas financieras protegidas"/><section className="workspace analysis-workspace">
    <header className="topbar"><div><p className="eyebrow">ANÁLISIS · {data.version}</p><h1>Análisis financiero</h1><p>{dateFmt.format(new Date(data.periodStart+"T12:00:00"))} – {dateFmt.format(new Date(data.periodEnd+"T12:00:00"))} · comparativa homogénea con {data.comparisonYear}</p></div><form className="analysis-year" action="/analisis"><label>Año<select name="year" defaultValue={String(data.year)}>{data.years.map(year=><option key={year} value={year}>{year}</option>)}</select></label><button className="ghost" type="submit">Aplicar</button></form></header>

    <section className="analysis-summary">
      <article><span>Ingresos</span><strong>{money.format(data.income)}</strong><small className={data.incomeChangePercent!=null&&data.incomeChangePercent<0?"negative":"positive"}>{pct(data.incomeChangePercent)} vs {data.comparisonYear}</small></article>
      <article><span>Gastos</span><strong>{money.format(data.expenses)}</strong><small className={data.expenseChangePercent!=null&&data.expenseChangePercent>0?"negative":"positive"}>{pct(data.expenseChangePercent)} vs {data.comparisonYear}</small></article>
      <article className="analysis-net"><span>Cash Flow</span><strong className={data.net<0?"negative":"positive"}>{money.format(data.net)}</strong><small>{money.format(data.netChange)} frente al periodo comparable</small></article>
      <article><span>Movimientos</span><strong>{data.movements.toLocaleString("es-ES")}</strong><small>{data.uncategorizedCount===0?"100 % de gastos con categoría":`${data.uncategorizedCount} sin categoría`}</small></article>
    </section>

    <article className="panel analysis-trend-panel"><div className="panel-head"><div><p className="eyebrow">EVOLUCIÓN</p><h2>{data.year} frente a {data.comparisonYear}</h2></div><span className="pill">Mismo periodo</span></div><AnalysisTrendChart months={data.monthly} year={data.year} comparisonYear={data.comparisonYear}/></article>

    <div className="analysis-grid">
      <article className="panel analysis-categories"><div className="panel-head"><div><p className="eyebrow">DISTRIBUCIÓN</p><h2>Gasto por categoría</h2></div><Link className="pill pill-link" href="/movimientos">Ver movimientos</Link></div><ol>{data.categories.map((c,i)=><li key={c.category}><div><span><b>{i+1}</b>{c.category}</span><strong>{money.format(c.amount)}</strong></div><div className="analysis-progress"><i style={{width:`${Math.min(100,c.share)}%`}}/></div><small>{c.share.toLocaleString("es-ES")} % · {c.movements} movimientos</small></li>)}</ol></article>
      <article className="panel analysis-deviations"><div className="panel-head"><div><p className="eyebrow">DESVIACIONES</p><h2>Qué está cambiando</h2></div></div>{data.deviations.length?<ul>{data.deviations.map(d=><li key={d.category}><div><strong>{d.category}</strong><span className={d.changePercent!=null&&d.changePercent>0?"negative":"positive"}>{d.changePercent==null?"Nuevo gasto":pct(d.changePercent)}</span></div><small>Periodo actual {money.format(d.current)} · media comparable 3 meses {money.format(d.previous3MonthAverage)}</small></li>)}</ul>:<p className="analysis-empty">No hay desviaciones relevantes en el periodo.</p>}<p className="analysis-note">En el mes en curso se comparan solo los mismos días transcurridos de los tres meses anteriores.</p></article>
    </div>

    <div className="analysis-grid lower">
      <article className="panel analysis-merchants"><div className="panel-head"><div><p className="eyebrow">COMERCIOS</p><h2>Principales destinos del gasto</h2></div></div><ol>{data.merchants.map((m,i)=><li key={`${m.merchant}-${i}`}><span><b>{i+1}</b><span>{m.merchant}</span></span><div><strong>{money.format(m.amount)}</strong><small>{m.movements} mov.</small></div></li>)}</ol></article>
      <article className="panel analysis-quality"><div className="panel-head"><div><p className="eyebrow">CALIDAD</p><h2>Base del análisis</h2></div></div><ul><li><span>Ahorro</span><strong>Excluido</strong></li><li><span>Traspasos internos</span><strong>Excluidos</strong></li><li><span>Duplicados</span><strong>Excluidos</strong></li><li><span>Gasto sin categoría</span><strong>{money.format(data.uncategorizedAmount)}</strong></li><li><span>Comparación</span><strong>Igual periodo</strong></li></ul><p className="analysis-note">Los datos editados en Financial App prevalecen en categoría, contraparte y tipo sin modificar nunca el origen bancario.</p></article>
    </div>
  </section></main>;
}
