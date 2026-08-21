import type { CashFlowMonth } from "@/lib/financial/cash-flow";

const monthFmt=new Intl.DateTimeFormat("es-ES",{month:"short"});
const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0});

export function CashFlowChart({months}:{months:CashFlowMonth[]}){
  const width=900,height=330,pad=38,base=205;
  const maxBar=Math.max(1,...months.flatMap(m=>[m.income,m.expenses]));
  const maxAcc=Math.max(1,...months.map(m=>Math.abs(m.accumulated)));
  const group=(width-pad*2)/Math.max(1,months.length);
  const bw=Math.max(8,Math.min(22,group*.25));
  const barH=(v:number)=>Math.max(0,(v/maxBar)*145);
  const accY=(v:number)=>base-(v/maxAcc)*100;
  const line=months.map((m,i)=>`${i===0?"M":"L"}${(pad+i*group+group/2).toFixed(1)},${accY(m.accumulated).toFixed(1)}`).join(" ");
  return <div className="cf-chart-wrap"><svg className="cf-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ingresos, gastos y Cash Flow acumulado por mes">
    <line className="cf-zero" x1={pad} x2={width-pad} y1={base} y2={base}/>
    {months.map((m,i)=>{const x=pad+i*group+group/2; const ih=barH(m.income),eh=barH(m.expenses);return <g key={m.month}>
      <rect className="cf-income" x={x-bw-2} y={base-ih} width={bw} height={ih} rx="3"><title>Ingresos {m.month}: {money.format(m.income)}</title></rect>
      <rect className="cf-expense" x={x+2} y={base-eh} width={bw} height={eh} rx="3"><title>Gastos {m.month}: {money.format(m.expenses)}</title></rect>
      <text className="cf-month" x={x} y={base+25} textAnchor="middle">{monthFmt.format(new Date(`${m.month}-01T12:00:00`)).replace(".","")}</text>
    </g>})}
    <path className="cf-acc-line" d={line}/>
    {months.map((m,i)=>{const x=pad+i*group+group/2,y=accY(m.accumulated);return <circle key={`${m.month}-a`} className="cf-acc-dot" cx={x} cy={y} r="4"><title>Acumulado {m.month}: {money.format(m.accumulated)}</title></circle>})}
  </svg><div className="cf-legend"><span><i className="income"/>Ingresos</span><span><i className="expense"/>Gastos</span><span><i className="acc"/>Acumulado</span></div></div>;
}
