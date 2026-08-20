import type { MonthlyReportRow } from '../../src/domain/report-engine';

const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function CashFlowChart({ rows }: { rows: MonthlyReportRow[] }) {
  if (!rows.length) return <div className="empty compact-empty">No hay meses disponibles para representar.</div>;

  const width = 840;
  const height = 300;
  const left = 46;
  const right = 20;
  const top = 24;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxBar = Math.max(1, ...rows.flatMap((row) => [row.income, row.expenses]));
  const cumulativeValues = rows.map((row) => row.cumulativeNet);
  const cumulativeMin = Math.min(0, ...cumulativeValues);
  const cumulativeMax = Math.max(0, ...cumulativeValues);
  const cumulativeRange = Math.max(1, cumulativeMax - cumulativeMin);
  const slot = plotWidth / rows.length;
  const barWidth = Math.max(7, Math.min(18, slot * 0.28));

  const cumulativeY = (value: number) => top + ((cumulativeMax - value) / cumulativeRange) * plotHeight;
  const points = rows.map((row, index) => {
    const x = left + slot * index + slot / 2;
    return `${x},${cumulativeY(row.cumulativeNet)}`;
  }).join(' ');

  return (
    <div className="cashflow-chart-wrap">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="legend-income" />Ingresos</span>
        <span><i className="legend-expense" />Gastos</span>
        <span><i className="legend-line" />Acumulado</span>
      </div>
      <svg className="cashflow-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ingresos, gastos y cash flow acumulado por mes">
        <line x1={left} y1={top + plotHeight} x2={width - right} y2={top + plotHeight} className="chart-axis" />
        {[0.25, 0.5, 0.75].map((factor) => (
          <line key={factor} x1={left} y1={top + plotHeight * factor} x2={width - right} y2={top + plotHeight * factor} className="chart-grid-line" />
        ))}

        {rows.map((row, index) => {
          const center = left + slot * index + slot / 2;
          const incomeHeight = (row.income / maxBar) * plotHeight;
          const expenseHeight = (row.expenses / maxBar) * plotHeight;
          const monthIndex = Math.max(0, Number(row.month.slice(5, 7)) - 1);
          return (
            <g key={row.month}>
              <rect x={center - barWidth - 2} y={top + plotHeight - incomeHeight} width={barWidth} height={incomeHeight} rx="3" className="chart-income-bar" />
              <rect x={center + 2} y={top + plotHeight - expenseHeight} width={barWidth} height={expenseHeight} rx="3" className="chart-expense-bar" />
              <text x={center} y={height - 16} textAnchor="middle" className="chart-month-label">{monthNames[monthIndex]}</text>
            </g>
          );
        })}

        <polyline points={points} fill="none" className="chart-cumulative-line" />
        {rows.map((row, index) => {
          const x = left + slot * index + slot / 2;
          return <circle key={`dot-${row.month}`} cx={x} cy={cumulativeY(row.cumulativeNet)} r="4" className="chart-cumulative-dot" />;
        })}
      </svg>
      <p className="chart-note">Las barras comparten escala anual. La línea muestra la evolución del cash flow acumulado del periodo seleccionado.</p>
    </div>
  );
}
