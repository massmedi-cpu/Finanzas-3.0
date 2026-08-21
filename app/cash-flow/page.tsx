import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getCashFlow } from "@/lib/financial/cash-flow";
import { AppSidebar } from "@/components/app-sidebar";
import { CashFlowChart } from "@/components/cash-flow-chart";

const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});
export const dynamic="force-dynamic";

export default async function CashFlowPage({searchParams}:{searchParams:Promise<{year?:string}>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const requested=Number(params.year||new Date().getFullYear());
  const year=Number.isInteger(requested)&&requested>=2000&&requested<=2100?requested:new Date().getFullYear();
  const data=await getCashFlow(year);
  return <main className="app-shell"><AppSidebar active="/cash-flow" status="Cash Flow · reglas centrales protegidas"/><section className="workspace cf-workspace">
    <header className="topbar"><div><p className="eyebrow">CASH FLOW · {data.version}</p><h1>Cash Flow {data.year}</h1><p>Ingresos y gastos reales computables. Ahorro, traspasos internos y duplicados quedan fuera siempre.</p></div><form className="year-picker" action="/cash-flow"><label>Año<select name="year" defaultValue={String(data.year)}>{data.years.map(y=><option key={y} value={y}>{y}</option>)}</select></label><button className="ghost" type="submit">Aplicar</button></form></header>

    <section className="cf-summary">
      <article><span>Ingresos</span><strong className="positive">{money.format(data.income)}</strong><small>Computables del año</small></article>
      <article><span>Gastos</span><strong className="negative">{money.format(data.expenses)}</strong><small>Computables del año</small></article>
      <article className="net"><span>Cash Flow</span><strong className={data.net<0?"negative":"positive"}>{money.format(data.net)}</strong><small>{data.positiveMonths} meses positivos · {data.negativeMonths} negativos</small></article>
    </section>

    <article className="panel cf-main-panel"><div className="panel-head"><div><p className="eyebrow">EVOLUCIÓN MENSUAL</p><h2>Ingresos, gastos y acumulado</h2></div><span className="pill">12 meses</span></div><CashFlowChart months={data.monthly}/><div className="cf-month-grid">{data.monthly.map(m=><div key={m.month}><span>{m.month}</span><strong className={m.net<0?"negative":"positive"}>{money.format(m.net)}</strong></div>)}</div></article>

    <div className="cf-lower-grid">
      <article className="panel cf-category-panel"><div className="panel-head"><div><p className="eyebrow">GASTO</p><h2>Principales categorías</h2></div></div><ol className="cf-categories">{data.topExpenseCategories.map((c,i)=><li key={c.category}><span><b>{i+1}</b>{c.category}</span><strong>{money.format(c.amount)}</strong></li>)}</ol></article>
      <article className="panel cf-rules-panel"><div className="panel-head"><div><p className="eyebrow">REGLAS</p><h2>Qué queda fuera</h2></div></div><ul className="cf-rules"><li><span>Cuenta de ahorro</span><strong>{data.excluded.savings}</strong><small>Exclusión absoluta</small></li><li><span>Traspasos internos</span><strong>{data.excluded.internalTransfers}</strong><small>No son ingreso ni gasto real</small></li><li><span>Duplicados</span><strong>{data.excluded.duplicates}</strong><small>No computan</small></li><li><span>Exclusión manual</span><strong>{data.excluded.manual}</strong><small>Marcados expresamente</small></li></ul></article>
    </div>
    <p className="cf-footnote">La cuenta de ahorro nunca entra en Cash Flow, ni siquiera mediante override manual. <Link href="/movimientos">Revisar movimientos →</Link></p>
  </section></main>;
}
