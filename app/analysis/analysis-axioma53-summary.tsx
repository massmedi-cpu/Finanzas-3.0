import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import type { PeriodCoverage } from "../../src/application/data-coverage";
import { buildAccumulatedDailySpend } from "../../src/application/analysis/analysis-calendar-series";
import { formatMoneyCents as formatMoney } from "../../src/core/money";
import styles from "./analysis-axioma53-summary.module.css";

const compactDate = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function formatDate(value: string) {
  return compactDate.format(new Date(`${value}T12:00:00Z`));
}

export default function AnalysisAxioma53Summary({ snapshot, coverage }: { snapshot: AnalysisSnapshot; coverage: PeriodCoverage | null }) {
  const observed = coverage?.state === "covered" || coverage?.state === "partial";
  const partial = coverage?.state === "partial";
  // Never draw a flat zero into days beyond the last imported movement.
  const throughDate = observed && coverage?.throughDate ? coverage.throughDate : null;
  const chartEnd = throughDate && throughDate < snapshot.selection.dateTo
    ? throughDate
    : snapshot.selection.dateTo;
  const rows = observed && throughDate ? buildAccumulatedDailySpend(
    snapshot.dailySpend,
    snapshot.selection.dateFrom,
    chartEnd,
  ) : [];

  if (!observed || snapshot.dailySpend.length === 0 || rows.length === 0) {
    return (
      <section className={styles.shell} aria-labelledby="axioma53-accumulated-heading">
        <article className={styles.card}>
          <div className={styles.cardHeading}>
            <div>
              <span>ACUMULADO</span>
              <h2 id="axioma53-accumulated-heading">Gasto acumulado del periodo</h2>
            </div>
          </div>
          <p className={styles.empty}>{!observed
            ? "No hay cobertura bancaria confirmada: todavía no se puede calcular el gasto acumulado."
            : partial
              ? "No se han observado gastos elegibles en los datos disponibles. El periodo sigue incompleto."
              : "No hay gastos elegibles en el periodo seleccionado."}</p>
        </article>
      </section>
    );
  }

  const width = 820;
  const height = 240;
  const left = 58;
  const right = 18;
  const top = 22;
  const bottom = 36;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const maximum = Math.max(1, rows.at(-1)?.accumulatedCents ?? 0);
  const step = rows.length > 1 ? innerWidth / (rows.length - 1) : 0;
  const points = rows.map((row, index) => ({
    x: rows.length > 1 ? left + (step * index) : left + (innerWidth / 2),
    y: top + (1 - row.accumulatedCents / maximum) * innerHeight,
    row,
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = points.length > 1
    ? `${path} L ${points.at(-1)?.x} ${height - bottom} L ${points[0].x} ${height - bottom} Z`
    : "";
  const tickValues = [0, 0.5, 1].map((ratio) => Math.round(maximum * ratio));

  return (
    <section className={styles.shell} aria-labelledby="axioma53-accumulated-heading">
      <article className={styles.card}>
        <div className={styles.cardHeading}>
          <div>
            <span>VISIÓN GENERAL · ACUMULADO</span>
            <h2 id="axioma53-accumulated-heading">Gasto acumulado del periodo</h2>
          </div>
          <div className={styles.total}>
            <span>{partial ? "Gasto observado · parcial" : "Total reconciliado"}</span>
            <strong>{formatMoney(maximum)}</strong>
          </div>
        </div>
        <p className={styles.context}>Se construye con gasto diario elegible conciliado con Movimientos y no introduce un segundo cálculo financiero. {partial ? `Datos observados hasta el ${formatDate(chartEnd)}: el resto del periodo no se representa como cero.` : "Los días sin gasto permanecen planos cuando su cobertura bancaria está confirmada."}</p>
        <div className={styles.chartViewport} role="region" aria-label="Gráfica de gasto acumulado" tabIndex={0}>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Gasto acumulado: ${formatMoney(maximum)}`}>
            {tickValues.map((value) => {
              const y = top + (1 - value / maximum) * innerHeight;
              return (
                <g className={styles.grid} key={value}>
                  <line x1={left} x2={width - right} y1={y} y2={y} />
                  <text x={left - 8} y={y + 4} textAnchor="end">{formatMoney(value)}</text>
                </g>
              );
            })}
            {area && <path className={styles.area} d={area} />}
            <path className={styles.line} d={path} />
            {points.map(({ x, y, row }, index) => (
              <g key={row.date}>
                {row.hasActivity && (
                  <circle className={styles.point} cx={x} cy={y} r="4">
                    <title>{`${formatDate(row.date)} · acumulado ${formatMoney(row.accumulatedCents)}`}</title>
                  </circle>
                )}
                {(index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2)) && (
                  <text className={styles.axisLabel} x={x} y={height - 10} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>
                    {formatDate(row.date)}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
        <details className={styles.details}>
          <summary>Ver acumulado por día</summary>
          <div className={styles.tableViewport}>
            <table>
              <thead><tr><th>Fecha</th><th>Gasto diario</th><th>Acumulado</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.date}>
                    <td>{formatDate(row.date)}</td>
                    <td>{formatMoney(row.expenseCents)}</td>
                    <td>{formatMoney(row.accumulatedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </article>
    </section>
  );
}
