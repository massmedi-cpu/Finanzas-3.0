import type { NetWorthPoint } from '../../src/domain/net-worth-engine';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function NetWorthChart({ points }: { points: NetWorthPoint[] }) {
  if (!points.length) return <div className="empty compact-empty">No hay suficientes saldos históricos para representar el patrimonio.</div>;

  const width = 860;
  const height = 270;
  const left = 56;
  const right = 18;
  const top = 24;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = points.map((point) => point.netWorth);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = Math.max(1, (maxValue - minValue) * 0.12);
  const min = minValue - padding;
  const max = maxValue + padding;
  const range = Math.max(1, max - min);
  const step = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
  const x = (index: number) => points.length > 1 ? left + step * index : left + plotWidth / 2;
  const y = (value: number) => top + ((max - value) / range) * plotHeight;
  const polyline = points.map((point, index) => `${x(index)},${y(point.netWorth)}`).join(' ');
  const labelEvery = points.length > 12 ? 2 : 1;

  return (
    <div className="networth-chart-wrap">
      <svg className="networth-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución mensual del patrimonio conocido">
        {[0, .25, .5, .75, 1].map((factor) => {
          const value = max - range * factor;
          const lineY = top + plotHeight * factor;
          return (
            <g key={factor}>
              <line x1={left} y1={lineY} x2={width - right} y2={lineY} className="chart-grid-line" />
              <text x={left - 8} y={lineY + 4} textAnchor="end" className="chart-axis-label">{euro.format(value)}</text>
            </g>
          );
        })}
        <polyline points={polyline} fill="none" className="networth-line" />
        {points.map((point, index) => {
          const month = Number(point.month.slice(5, 7));
          return (
            <g key={point.month}>
              <circle cx={x(index)} cy={y(point.netWorth)} r="4" className="networth-dot"><title>{point.month}: {euro.format(point.netWorth)}</title></circle>
              {index % labelEvery === 0 && <text x={x(index)} y={height - 16} textAnchor="middle" className="chart-month-label">{monthNames[Math.max(0, month - 1)]}</text>}
            </g>
          );
        })}
      </svg>
      <p className="chart-note">Patrimonio conocido = suma de los últimos saldos disponibles por cuenta hasta el cierre de cada mes. No se inventan saldos cuando una cuenta aún no tiene histórico.</p>
    </div>
  );
}
