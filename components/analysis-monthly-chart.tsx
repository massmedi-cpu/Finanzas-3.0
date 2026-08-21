import type { AnalysisMonth } from "@/lib/financial/analysis";

const monthNames=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const money=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0});

export function AnalysisMonthlyChart({months,year,previousYear}:{months:AnalysisMonth[];year:number;previousYear:number}){
  const observed=months.filter(m=>m.observed);
  const max=Math.max(1,...observed.flatMap(m=>[m.expenses||0,m.previousExpenses||0]));
  const width=960,height=300,left=52,right=18,top=22,bottom=44,plotH=height-top-bottom,plotW=width-left-right;
  const groupW=plotW/12,barW=Math.min(22,groupW*.28);
  const y=(v:number)=>top+plotH-(v/max)*plotH;
  return <div className="an-chart-wrap"><svg className="an-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Comparativa mensual de gastos ${year} y ${previousYear}`}>
    {[0,.25,.5,.75,1].map(r=><g key={r}><line className="an-grid-line" x1={left} x2={width-right} y1={top+plotH-r*plotH} y2={top+plotH-r*plotH}/><text className="an-axis" x={left-7} y={top+plotH-r*plotH+4} textAnchor="end">{money.format(max*r)}</text></g>)}
    {months.map((m,i)=>{const cx=left+groupW*i+groupW/2;const cur=m.observed?(m.expenses||0):0;const prev=m.observed?(m.previousExpenses||0):0;return <g key={m.month} opacity={m.observed?1:.28}><rect className="an-bar-current" x={cx-barW-2} y={y(cur)} width={barW} height={top+plotH-y(cur)} rx="2"><title>{monthNames[i]} {year}: {money.format(cur)}</title></rect><rect className="an-bar-prev" x={cx+2} y={y(prev)} width={barW} height={top+plotH-y(prev)} rx="2"><title>{monthNames[i]} {previousYear}: {money.format(prev)}</title></rect><text className="an-month" x={cx} y={height-15} textAnchor="middle">{monthNames[i]}</text></g>})}
  </svg><div className="an-legend"><span><i className="current"/>{year}</span><span><i className="previous"/>{previousYear}</span></div></div>;
}
