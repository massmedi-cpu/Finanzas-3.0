import Link from "next/link";
import type { CSSProperties } from "react";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import { formatBasisPoints, formatInteger } from "../../src/core/formatters";
import { formatMoneyCents as formatMoney } from "../../src/core/money";
import { CategoryIdentity } from "../category-identity";
import styles from "./analysis-axioma53-summary.module.css";

const compactDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});

function formatDate(value: string) {
  return compactDate.format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

function accumulatedRows(snapshot: AnalysisSnapshot) {
  let running = 0;
  return snapshot.dailySpend.map((row) => {
    running += row.expenseCents;
    return { ...row, accumulatedCents: running };
  });
}

function CumulativeSpend({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const rows = accumulatedRows(snapshot);
  if (rows.length === 0) {
    return (
      <article className={styles.card}>
        <div className={styles.cardHeading}>
          <div><span>ACUMULADO</span><h3>Gasto acumulado del periodo</h3></div>
        </div>
        <p className={styles.empty}>No hay gastos elegibles en el periodo seleccionado.</p>
      </article>
    );
  }

  const width = 680;
  const height = 220;
  const left = 54;
  const right = 18;
  const top = 22;
  const bottom = 34;
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
    <article className={styles.card}>
      <div className={styles.cardHeading}>
        <div><span>ACUMULADO</span><h3>Gasto acumulado del periodo</h3></div>
        <strong>{formatMoney(maximum)}</strong>
      </div>
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
              <circle className={styles.point} cx={x} cy={y} r="4">
                <title>{`${formatDate(row.date)} · acumulado ${formatMoney(row.accumulatedCents)}`}</title>
              </circle>
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
  );
}

function CategoryDonut({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const eligible = snapshot.categoryDrivers.filter((row) => row.expenseCents > 0);
  const total = snapshot.current.expenseCents;
  const top = eligible.slice(0, 6);
  const shown = top.reduce((sum, row) => sum + row.expenseCents, 0);
  const other = Math.max(0, total - shown);
  const slices = [
    ...top.map((row) => ({ id: row.id ?? row.name, label: row.name, cents: row.expenseCents, href: row.href })),
    ...(other > 0 ? [{ id: "other", label: "Resto", cents: other, href: null }] : []),
  ];
  let offset = 0;

  return (
    <article className={styles.card}>
      <div className={styles.cardHeading}>
        <div><span>COMPOSICIÓN</span><h3>Distribución del gasto por categorías</h3></div>
        <strong>{formatInteger(eligible.length)} categorías</strong>
      </div>
      {total <= 0 || slices.length === 0 ? (
        <p className={styles.empty}>No hay gasto elegible para distribuir.</p>
      ) : (
        <div className={styles.donutLayout}>
          <div className={styles.donutWrap}>
            <svg className={styles.donut} viewBox="0 0 120 120" role="img" aria-label={`Distribución de ${formatMoney(total)} de gasto`}>
              <circle className={styles.donutTrack} cx="60" cy="60" r="45" pathLength="100" />
              {slices.map((slice, index) => {
                const share = (slice.cents / total) * 100;
                const dashOffset = -offset;
                offset += share;
                return (
                  <circle
                    key={slice.id}
                    className={styles.donutSlice}
                    cx="60"
                    cy="60"
                    r="45"
                    pathLength="100"
                    strokeDasharray={`${share} ${100 - share}`}
                    strokeDashoffset={dashOffset}
                    style={{ "--slice-index": index } as CSSProperties}
                  >
                    <title>{`${slice.label}: ${formatMoney(slice.cents)} · ${formatBasisPoints(Math.round(share * 100))}`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className={styles.donutCenter} aria-hidden="true">
              <span>Total</span>
              <strong>{formatMoney(total)}</strong>
            </div>
          </div>
          <ol className={styles.legend}>
            {slices.map((slice, index) => {
              const shareBps = total > 0 ? Math.round((slice.cents * 10000) / total) : 0;
              const content = (
                <>
                  <span className={styles.legendDot} style={{ "--slice-index": index } as CSSProperties} aria-hidden="true" />
                  <span className={styles.legendName}>{slice.id === "other" ? slice.label : <CategoryIdentity categoryId={top[index]?.id ?? null} name={slice.label} />}</span>
                  <strong>{formatMoney(slice.cents)}</strong>
                  <small>{formatBasisPoints(shareBps)}</small>
                </>
              );
              return <li key={slice.id}>{slice.href ? <Link prefetch={false} href={slice.href}>{content}</Link> : <div>{content}</div>}</li>;
            })}
          </ol>
        </div>
      )}
    </article>
  );
}

export default function AnalysisAxioma53Summary({ snapshot }: { snapshot: AnalysisSnapshot }) {
  return (
    <section className={styles.shell} aria-labelledby="axioma53-visual-heading">
      <div className={styles.heading}>
        <div>
          <span>VISIÓN ANALÍTICA</span>
          <h2 id="axioma53-visual-heading">Acumulados y composición</h2>
        </div>
        <p>La lectura se reconcilia con Movimientos al céntimo antes de mostrarse.</p>
      </div>
      <div className={styles.gridCards}>
        <CumulativeSpend snapshot={snapshot} />
        <CategoryDonut snapshot={snapshot} />
      </div>
    </section>
  );
}
