import type { AnalysisMonth } from "@/lib/financial/analysis";

export function AnalysisTrendChart({months,year,comparisonYear}:{months:AnalysisMonth[];year:number;comparisonYear:number}){
  const shown=months.filter(m=>m.available);
  if(!shown.length) return <div className="analysis-empty">No hay datos para este periodo.</div>;
  const width=980,height=330,padX=48,padY=34,innerW=width-padX*2,innerH=height-padY*2;
  const max=Math.max(1,...shown.flatMap(m=>[m.income,m.expenses,m.priorIncome||0,m.priorExpenses||0,Math.abs(m.net),Math.abs(m.priorNet||0)]));
  const step=innerW/shown.length; const barW=Math.min(22,step*.2);
  const y=(v:number)=>padY+innerH-(v/max)*innerH;
  const netMax=Math.max(1,...shown.flatMap(m=>[Math.abs(m.net),Math.abs(m.priorNet||0)]));
  const netY=(v:number)=>padY+innerH/2-(v/netMax)*(innerH*.42);
  const points=(key:"net"|"priorNet")=>shown.map((m,i)=>`${padX+step*(i+.5)},${netY(Number(m[key]||0))}`).join(" ");
  return <div className="analysis-chart-wrap">
    <div className="analysis-legend"><span><i className="a-current"/>Gasto {year}</span><span><i className="a-prior"/>Gasto {comparisonYear}</span><span><i className="a-net"/>Neto {year}</span><span><i className="a-net-prior"/>Neto {comparisonYear}</span></div>
    <svg className="analysis-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Comparativa mensual ${year} frente a ${comparisonYear}`}>
      <line className="a-zero" x1={padX} y1={padY+innerH} x2={width-padX} y2={padY+innerH}/>
      <line className="a-mid" x1={padX} y1={padY+innerH/2} x2={width-padX} y2={padY+innerH/2}/>
      {shown.map((m,i)=>{const cx=padX+step*(i+.5);const h=(m.expenses/max)*innerH;const ph=((m.priorExpenses||0)/max)*innerH;return <g key={m.month}>
        <rect className="a-bar-current" x={cx-barW-2} y={padY+innerH-h} width={barW} height={h} rx="3"/>
        <rect className="a-bar-prior" x={cx+2} y={padY+innerH-ph} width={barW} height={ph} rx="3"/>
        <text className="a-month" x={cx} y={height-8} textAnchor="middle">{m.label}{m.partial?"*":""}</text>
      </g>})}
      <polyline className="a-line-current" points={points("net")}/>
      <polyline className="a-line-prior" points={points("priorNet")}/>
      {shown.map((m,i)=>{const cx=padX+step*(i+.5);return <g key={`dot-${m.month}`}><circle className="a-dot-current" cx={cx} cy={netY(m.net)} r="3.5"/>{m.priorNet!=null&&<circle className="a-dot-prior" cx={cx} cy={netY(m.priorNet)} r="3"/>}</g>})}
    </svg>
    {shown.some(m=>m.partial)&&<p className="analysis-chart-note">* Mes parcial: comparado con el mismo número de días del año anterior.</p>}
  </div>;
}
