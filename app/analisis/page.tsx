import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { AppSidebar } from "@/components/app-sidebar";
import { getAnalysisOverview } from "@/lib/financial/analysis";
import { AnalysisMonthlyChart } from "@/components/analysis-monthly-chart";

const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});
const pct=(value:number|null)=>value==null?"—":`${value>0?"+":""}${value.toFixed(1)} %`;
const monthNames=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
export const dynamic="force-dynamic";

export default async function AnalysisPage({searchParams}:{searchParams:Promise<{year?:string}>}){
  await requireAuthorizedUser();
  const params=await searchParams;const requested=Number(params.year||new Date().getFullYear());
  const data=await getAnalysisOverview(Number.isInteger(requested)?requested:undefined);
  const maxCategory=Math.max(1,...data.categories.map(c=>c.amount));
  return <main className="app-shell"><AppSidebar active="/analisis" status="Análisis · comparativas sobre reglas Cash Flow"/><section className="workspace an-workspace">
    <header className="topbar"><div><p className="eyebrow">ANÁLISIS · {data.version}</p><h1>Análisis {data.year}</h1><p>Comparativa hasta {monthNames[Math.max(0,data.throughMonth-1)]} frente al mismo periodo de {data.previousYear}.</p></div><form className="an-year-picker" action="/analisis"><label>Año<select name="year" defaultValue={String(data.year)}>{data.years.map(y=><option key={y} value={y}>{y}</option>)}</select></label><button className="ghost" type="submit">Aplicar</button></form></header>

    <section className="an-summary">
      <article><span>Ingresos</span><strong>{money.format(data.income)}</strong><small className={(data.incomeChangePercent||0)<0?"negative":"positive"}>{pct(data.incomeChangePercent)} vs {data.previousYear}</small></article>
      <article><span>Gastos</span><strong>{money.format(data.expenses)}</strong><small className={(data.expenseChangePercent||0)>0?"negative":"positive"}>{pct(data.expenseChangePercent)} vs {data.previousYear}</small></article>
      <article className="an-net"><span>Balance</span><strong className={data.net<0?"negative":"positive"}>{money.format(data.net)}</strong><small>{money.format(data.netChange)} de diferencia interanual</small></article>
      <article><span>Tasa de ahorro</span><strong>{data.savingsRatePercent.toFixed(1)} %</strong><small>Promedio gasto: {money.format(data.averageMonthlyExpenses)}/mes</small></article>
    </section>

    <article className="panel an-chart-panel"><div className="panel-head"><div><p className="eyebrow">COMPARATIVA MENSUAL</p><h2>Gasto {data.year} frente a {data.previousYear}</h2></div><span className="pill">Mismo periodo</span></div><AnalysisMonthlyChart months={data.monthly} year={data.year} previousYear={data.previousYear}/><div className="an-net-strip">{data.monthly.map((m,i)=><div key={m.month} className={m.observed?"":"future"}><span>{monthNames[i].slice(0,3)}</span><strong className={(m.net||0)<0?"negative":"positive"}>{m.observed?money.format(m.net||0):"—"}</strong></div>)}</div></article>

    <div className="an-grid-main">
      <article className="panel an-category-panel"><div className="panel-head"><div><p className="eyebrow">CATEGORÍAS</p><h2>Dónde se concentra el gasto</h2></div></div><div className="an-category-list">{data.categories.map(c=><div className="an-category" key={c.category}><div className="an-category-head"><span><b>{c.category}</b><small>{c.movements} movimientos</small></span><span className="an-category-values"><strong>{money.format(c.amount)}</strong><small className={(c.changePercent||0)>0?"negative":"positive"}>{c.changePercent==null?"Sin base comparable":`${pct(c.changePercent)} vs ${data.previousYear}`}</small></span></div><div className="an-category-bar"><i style={{width:`${Math.max(2,c.amount/maxCategory*100)}%`}}/></div></div>)}</div></article>
      <article className="panel an-deviation-panel"><div className="panel-head"><div><p className="eyebrow">DESVIACIONES</p><h2>Meses por encima de tu media</h2></div></div>{data.highExpenseMonths.length===0?<p className="an-empty">No hay meses con gasto superior en más de un 20 % a la media observada.</p>:<ul className="an-simple-list">{data.highExpenseMonths.map(m=><li key={m.month}><span>{monthNames[Number(m.month)-1]}</span><div><strong>{money.format(m.expenses)}</strong><small className="negative">+{m.deviationPercent.toFixed(1)} % sobre la media</small></div></li>)}</ul>}<div className="an-average-box"><span>Media mensual</span><strong>{money.format(data.averageMonthlyExpenses)}</strong><small>{data.monthsObserved} meses observados</small></div></article>
    </div>

    <div className="an-grid-secondary">
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">COMERCIOS Y CONTRAPARTES</p><h2>Mayor gasto acumulado</h2></div></div><ol className="an-ranked">{data.merchants.map((m,i)=><li key={`${m.name}-${i}`}><b>{i+1}</b><span>{m.name}<small>{m.movements} movimientos</small></span><strong>{money.format(m.amount)}</strong></li>)}</ol></article>
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">FUENTES DE INGRESO</p><h2>Ingresos acumulados</h2></div></div><ol className="an-ranked">{data.incomeSources.map((m,i)=><li key={`${m.name}-${i}`}><b>{i+1}</b><span>{m.name}<small>{m.movements} movimientos</small></span><strong>{money.format(m.amount)}</strong></li>)}</ol></article>
    </div>
    <p className="an-footnote">Análisis calculado con las mismas reglas del Cash Flow: ahorro, traspasos internos, duplicados y exclusiones manuales quedan fuera. La comparación interanual usa siempre el mismo número de meses.</p>
  </section></main>;
}
