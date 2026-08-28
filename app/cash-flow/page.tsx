import "../forecast.css";
import "../forecast-ledger.css";
import { formatEuro } from "@/lib/format/es-es";
import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getCashFlowRange, type CashFlowRange } from "@/lib/financial/cash-flow";
import { getForecastCalendar } from "@/lib/financial/forecast-calendar";
import { movementState, movementUrl } from "@/lib/financial/movement-query";
import { CashFlowChart } from "@/components/cash-flow-chart";
import { ForecastClient } from "@/app/prevision/forecast-client";

const dateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",year:"numeric"});
const allowedRanges=new Set<CashFlowRange>(["day","week","month","quarter","year","historical","custom"]);
const rangeLabels:Record<CashFlowRange,string>={day:"Día",week:"Semana",month:"Mes",quarter:"Trimestre",year:"Año",historical:"Histórico",custom:"Personalizado"};
export const dynamic="force-dynamic";

function madridToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function displayDate(value:string){return value?dateFmt.format(new Date(`${value}T12:00:00`)):"—"}
function safeRange(value?:string):CashFlowRange{return allowedRanges.has(value as CashFlowRange)?value as CashFlowRange:"year"}

export default async function CashFlowPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const today=madridToday();
  const range=safeRange(params.range);
  const anchor=/^\d{4}-\d{2}-\d{2}$/.test(params.anchor||"")?params.anchor!:today;
  const defaultFrom=`${today.slice(0,7)}-01`;
  const customFrom=/^\d{4}-\d{2}-\d{2}$/.test(params.from||"")?params.from!:defaultFrom;
  const customTo=/^\d{4}-\d{2}-\d{2}$/.test(params.to||"")?params.to!:today;
  const [data,forecast]=await Promise.all([
    getCashFlowRange({range,anchor,dateFrom:range==="custom"?customFrom:null,dateTo:range==="custom"?customTo:null,accountId:params.account||null,category:params.category||null,subcategory:params.subcategory||null,merchant:params.merchant||null,type:params.type||null}),
    getForecastCalendar(12),
  ]);
  const filterCount=[params.account,params.category,params.subcategory,params.merchant,params.type].filter(Boolean).length;
  const movementBase=movementState({from:data.dateFrom,to:data.dateTo,cashFlowOnly:true,account:params.account||"",category:params.category||"",subcategory:params.subcategory||"",merchant:params.merchant||"",type:params.type||""});
  const allMovementsUrl=movementUrl(movementBase);

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace cf-workspace">
    <header className="topbar"><div><p className="eyebrow">CASH FLOW · {data.version}</p><h1>Cash Flow</h1><p>Dinero real y previsto en un mismo lugar. Ahorro, traspasos internos y duplicados quedan fuera siempre.</p></div><Link className="secondary-action button-link" href={allMovementsUrl}>Ver movimientos</Link></header>

    <form className="cf-filter-panel" action="/cash-flow">
      <label><span>Periodo</span><select name="range" defaultValue={data.range}>{Object.entries(rangeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Referencia</span><input type="date" name="anchor" defaultValue={anchor}/></label>
      <label className="cf-custom-date"><span>Desde <small>personalizado</small></span><input type="date" name="from" defaultValue={customFrom}/></label>
      <label className="cf-custom-date"><span>Hasta <small>personalizado</small></span><input type="date" name="to" defaultValue={customTo}/></label>
      <label><span>Cuenta</span><select name="account" defaultValue={params.account||""}><option value="">Todas las operativas</option>{data.facets.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label><span>Categoría</span><select name="category" defaultValue={params.category||""}><option value="">Todas</option>{data.facets.categories.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label><span>Subcategoría</span><input name="subcategory" list="cf-subcategories" defaultValue={params.subcategory||""} placeholder="Todas"/><datalist id="cf-subcategories">{data.facets.subcategories.map(v=><option key={v} value={v}/>)}</datalist></label>
      <label><span>Comercio / contraparte</span><input name="merchant" list="cf-merchants" defaultValue={params.merchant||""} placeholder="Todos"/><datalist id="cf-merchants">{data.facets.merchants.map(v=><option key={v} value={v}/>)}</datalist></label>
      <label><span>Tipo</span><select name="type" defaultValue={params.type||""}><option value="">Todos</option>{data.facets.types.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <div className="cf-filter-actions"><button className="primary-action" type="submit">Aplicar</button><Link className="ghost button-link" href="/cash-flow">Limpiar {filterCount?`(${filterCount})`:""}</Link></div>
    </form>

    <section className="cf-summary" aria-label={`Resumen ${rangeLabels[data.range]} ${displayDate(data.dateFrom)} a ${displayDate(data.dateTo)}`}>
      <article><span>Ingresos reales</span><strong className="positive">{formatEuro(data.income)}</strong><small>{data.movements} movimientos computables</small></article>
      <article><span>Gastos reales</span><strong className="negative">{formatEuro(data.expenses)}</strong><small>Solo gasto personal real</small></article>
      <article className="net"><span>Resultado real</span><strong className={data.net<0?"negative":"positive"}>{formatEuro(data.net)}</strong><small>{data.positivePeriods} periodos positivos · {data.negativePeriods} negativos</small></article>
    </section>

    <article className="panel cf-main-panel"><div className="panel-head"><div><p className="eyebrow">REAL · {data.bucket.toUpperCase()}</p><h2>Ingresos, gastos y acumulado</h2><p>{displayDate(data.dateFrom)} — {displayDate(data.dateTo)}</p></div><span className="pill">{data.series.length} puntos</span></div><CashFlowChart points={data.series} drilldown={{bucket:data.bucket,dateFrom:data.dateFrom,dateTo:data.dateTo,account:params.account||"",type:params.type||"",category:params.category||"",subcategory:params.subcategory||"",merchant:params.merchant||""}}/></article>

    <section id="prevision" className="cf-forecast-zone" aria-labelledby="cf-forecast-title"><div className="cf-section-heading"><div><p className="eyebrow">PREVISTO</p><h2 id="cf-forecast-title">Calendario de próximos movimientos</h2><p>Fechas estimadas, confirmaciones reales y descartes. Un evento solo pasa a realizado cuando aparece en el banco.</p></div><Link className="ghost button-link" href="/prevision">Vista de previsión</Link></div><ForecastClient initialData={forecast}/></section>

    <div className="cf-lower-grid">
      <article className="panel cf-category-panel"><div className="panel-head"><div><p className="eyebrow">GASTO</p><h2>Principales categorías</h2></div></div><ol className="cf-categories">{data.topExpenseCategories.map((c,i)=><li key={c.category}><Link className="cf-drill-row" href={movementUrl({...movementBase,category:c.category,max:"-0.01"})}><span><b>{i+1}</b>{c.category}</span><strong>{formatEuro(c.amount)}</strong></Link></li>)}</ol>{!data.topExpenseCategories.length&&<p className="muted-copy">No hay gastos para estos filtros.</p>}</article>
      <article className="panel cf-category-panel"><div className="panel-head"><div><p className="eyebrow">COMERCIOS</p><h2>Principales contrapartes</h2></div></div><ol className="cf-categories">{data.topMerchants.map((m,i)=><li key={m.merchant}><Link className="cf-drill-row" href={movementUrl({...movementBase,merchant:m.merchant,max:"-0.01"})}><span><b>{i+1}</b>{m.merchant}</span><strong>{formatEuro(m.amount)}</strong></Link></li>)}</ol>{!data.topMerchants.length&&<p className="muted-copy">No hay gastos para estos filtros.</p>}</article>
    </div>

    <article className="panel cf-rules-panel"><div className="panel-head"><div><p className="eyebrow">INTEGRIDAD</p><h2>Exclusiones del periodo</h2></div></div><ul className="cf-rules"><li><span>Cuenta de ahorro</span><strong>{data.excluded.savings}</strong><small>Exclusión absoluta</small></li><li><span>Traspasos internos</span><strong>{data.excluded.internalTransfers}</strong><small>No son ingreso ni gasto real</small></li><li><span>Duplicados</span><strong>{data.excluded.duplicates}</strong><small>No computan</small></li><li><span>Exclusión manual</span><strong>{data.excluded.manual}</strong><small>Marcados expresamente</small></li><li><span>Origen ausente</span><strong>{data.excluded.sourceMissing}</strong><small>No computan</small></li></ul></article>
    <p className="cf-footnote">Las divisiones compartidas aplican únicamente tu parte personal y su categoría real. La cuenta de ahorro nunca entra en Cash Flow, ni mediante override manual.</p>
  </section></main>;
}
