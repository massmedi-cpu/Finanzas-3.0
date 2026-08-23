import { formatEuroInteger } from "@/lib/format/es-es";
export type BalancePoint = { month: string; balance: number | null };


const month = new Intl.DateTimeFormat("es-ES", { month: "short", year: "2-digit" });

export function BalanceChart({ points, compact = false }: { points: BalancePoint[]; compact?: boolean }) {
  const valid = points.filter((point): point is { month: string; balance: number } => point.balance !== null && Number.isFinite(point.balance));
  if (!valid.length) return <div className="balance-chart-empty">Sin histórico de saldo disponible.</div>;

  const width = compact ? 420 : 760;
  const height = compact ? 120 : 240;
  const pad = compact ? 10 : 20;
  const values = valid.map(point => point.balance);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const x = (index: number) => valid.length === 1 ? width / 2 : pad + index * ((width - pad * 2) / (valid.length - 1));
  const y = (value: number) => pad + (max - value) * ((height - pad * 2) / (max - min));
  const path = valid.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.balance).toFixed(1)}`).join(" ");
  const first = valid[0];
  const last = valid[valid.length - 1];

  return <div className={`balance-chart ${compact ? "compact" : ""}`}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evolución del saldo desde ${first.month} hasta ${last.month}`} preserveAspectRatio="none">
      <path className="balance-chart-area" d={`${path} L${x(valid.length - 1)},${height - pad} L${x(0)},${height - pad} Z`} />
      <path className="balance-chart-line" d={path} />
      {!compact && valid.map((point,index)=><circle key={point.month} className="balance-chart-dot" cx={x(index)} cy={y(point.balance)} r="3.5"><title>{month.format(new Date(`${point.month}-01T12:00:00`))}: ${formatEuroInteger(point.balance)}</title></circle>)}
    </svg>
    {!compact && <div className="balance-chart-legend"><span>{month.format(new Date(`${first.month}-01T12:00:00`))} · {formatEuroInteger(first.balance)}</span><strong>{month.format(new Date(`${last.month}-01T12:00:00`))} · {formatEuroInteger(last.balance)}</strong></div>}
  </div>;
}
