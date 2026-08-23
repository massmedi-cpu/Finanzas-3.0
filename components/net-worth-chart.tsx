import { formatEuroInteger } from "@/lib/format/es-es";
import type { NetWorthHistoryPoint } from "@/lib/financial/net-worth";



export function NetWorthChart({ points }: { points: NetWorthHistoryPoint[] }) {
  const complete = points.filter((point) => point.netWorth != null);
  if (complete.length < 2) return <div className="nw-chart-empty">Todavía no hay suficientes meses con cobertura patrimonial completa.</div>;

  const values = complete.map((point) => point.netWorth as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, Math.abs(max) * 0.02, 1);
  const width = 920;
  const height = 290;
  const left = 58;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const x = (index: number) => left + (index / Math.max(complete.length - 1, 1)) * plotW;
  const y = (value: number) => top + (1 - (value - min) / spread) * plotH;
  const path = complete.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.netWorth as number).toFixed(1)}`).join(" ");
  const grid = [0, .25, .5, .75, 1].map((ratio) => ({ value: min + spread * ratio, y: top + (1 - ratio) * plotH }));

  return <div className="nw-chart-wrap">
    <svg className="nw-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución del patrimonio neto">
      {grid.map((line) => <g key={line.y}><line className="nw-grid-line" x1={left} x2={width - right} y1={line.y} y2={line.y}/><text className="nw-axis-label" x={left - 8} y={line.y + 4} textAnchor="end">{formatEuroInteger(line.value)}</text></g>)}
      <path className="nw-area" d={`${path} L${x(complete.length - 1)},${top + plotH} L${x(0)},${top + plotH} Z`}/>
      <path className="nw-line" d={path}/>
      {complete.map((point, index) => <g key={point.month}><circle className="nw-dot" cx={x(index)} cy={y(point.netWorth as number)} r="4"/><text className="nw-month" x={x(index)} y={height - 14} textAnchor="middle">{point.month.slice(5)}/{point.month.slice(2,4)}</text><title>{point.month}: {formatEuroInteger(point.netWorth as number)}</title></g>)}
    </svg>
  </div>;
}
