"use client";

import { useState } from "react";
import type { ForecastSnapshot } from "../application/forecast/forecast-contract";
import { buildForecastTimeline } from "../application/forecast/forecast-chart-timeline";
import { formatMoneyCents } from "../core/money";
import styles from "./forecast-balance-chart.module.css";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00Z`));
}

export function ForecastBalanceChart({ snapshot }: { snapshot: ForecastSnapshot }) {
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const timeline = buildForecastTimeline(snapshot);
  if (!timeline) {
    return (
      <section className={styles.panel} aria-label="Curva de saldo prevista">
        <h2>Curva de saldo prevista</h2>
        <p role="alert">No se representa la curva: las fechas o los saldos recibidos no son coherentes con el periodo. Revisa las previsiones antes de interpretar su evolución.</p>
      </section>
    );
  }

  const points = timeline.points;
  const allPoints = [
    { date: snapshot.period.dateFrom, balanceCents: snapshot.summary.openingBalanceCents },
    ...snapshot.items.map((item) => ({ date: item.date, balanceCents: item.projectedBalanceAfterCents })),
  ];
  const { minimum, maximum } = allPoints.reduce(({ minimum, maximum }, point) => ({
    minimum: Math.min(minimum, point.balanceCents),
    maximum: Math.max(maximum, point.balanceCents),
  }), { minimum: Infinity, maximum: -Infinity });
  const flatDomain = minimum === maximum;
  const range = Math.max(1, maximum - minimum);
  const coordinateFor = (balanceCents: number) => flatDomain
    ? 50
    : 15 + ((maximum - balanceCents) / range) * 70;
  const zeroInDomain = minimum <= 0 && maximum >= 0;
  const zeroY = zeroInDomain ? coordinateFor(0) * 2.4 : null;
  const xFor = (index: number) => timeline.position(points[index].date);
  const polyline = points.map((point, index) => `${xFor(index) * 10},${coordinateFor(point.balanceCents) * 2.4}`).join(" ");
  const minimumPoint = allPoints.reduce((current, point) => point.balanceCents < current.balanceCents ? point : current, allPoints[0]);
  const firstNegative = allPoints.find((point) => point.balanceCents < 0) ?? null;
  const largestOutflow = snapshot.items
    .filter((item) => item.affectsProjection && item.projectionEffectCents < 0)
    .reduce<(typeof snapshot.items)[number] | null>((current, item) => {
      if (!current || item.projectionEffectCents < current.projectionEffectCents) return item;
      return current;
    }, null);

  return (
    <section className={styles.panel} aria-label="Curva de saldo prevista">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SALDO PROYECTADO</p>
          <h2>Curva de saldo prevista</h2>
        </div>
        <span className={styles.meta}>Saldos del motor de previsión · evolución por fechas reales</span>
      </div>

      <div className={styles.insights} role="region" aria-label="Radar de previsión">
        <article>
          <span>Saldo mínimo previsto</span>
          <strong className={minimumPoint.balanceCents < 0 ? styles.riskValue : undefined}>
            {formatMoneyCents(minimumPoint.balanceCents)}
          </strong>
          <small>{formatDate(minimumPoint.date)}</small>
        </article>
        <article>
          <span>Primera tensión de saldo</span>
          <strong className={firstNegative ? styles.riskValue : styles.safeValue}>
            {firstNegative ? formatDate(firstNegative.date) : "No prevista"}
          </strong>
          <small>{firstNegative ? formatMoneyCents(firstNegative.balanceCents) : "El saldo no baja de cero en el periodo"}</small>
        </article>
        <article>
          <span>Mayor salida prevista</span>
          <strong>{largestOutflow ? formatMoneyCents(Math.abs(largestOutflow.projectionEffectCents)) : "Sin salidas"}</strong>
          <small>{largestOutflow ? `${largestOutflow.concept} · ${formatDate(largestOutflow.date)}` : "No hay cargos que afecten a la proyección"}</small>
        </article>
      </div>

      <p className={styles.plotExplanation}>La posición horizontal corresponde al calendario, no al número de movimientos. La curva muestra el saldo al final de cada día; el saldo mínimo incluye también los hitos intermedios del mismo día.</p>
      {!timeline.closingReconciled ? (
        <p className={styles.warning} role="alert">El saldo final del motor no coincide con el último saldo por movimiento. No se prolonga artificialmente la curva hasta el cierre del periodo.</p>
      ) : null}
      <div className={styles.plotScroller}>
        <div className={styles.plot}>
          <svg viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true" className={styles.svg}>
            <defs>
              <linearGradient id="forecast-curve-gradient" x1="0" x2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".45" />
                <stop offset="100%" stopColor="currentColor" stopOpacity=".95" />
              </linearGradient>
            </defs>
            {zeroY !== null ? (
              <line
                className={styles.zeroLine}
                data-zero-line="true"
                x1="0"
                x2="1000"
                y1={zeroY}
                y2={zeroY}
              />
            ) : null}
            <polyline points={polyline} fill="none" stroke="url(#forecast-curve-gradient)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>

          {points.map((point, index) => {
            // Opening and first-day closing must not create overlapping 44px
            // buttons at the same date, but both remain in the line and table.
            if (point.kind === "opening" && points[1]?.date === point.date) return null;
            const id = `forecast-balance-${point.id}`;
            const label = `${point.label} · ${formatDate(point.date)} · ${formatMoneyCents(point.balanceCents)}`;
            return (
              <div
                key={point.id}
                className={styles.point}
                style={{ left: `${xFor(index)}%`, top: `${coordinateFor(point.balanceCents)}%` }}
              >
                <button
                  type="button"
                  className={styles.pointButton}
                  aria-label={label}
                  onFocus={() => setActivePoint(id)}
                  onBlur={() => setActivePoint((current) => current === id ? null : current)}
                  onMouseEnter={() => setActivePoint(id)}
                  onMouseLeave={() => setActivePoint((current) => current === id ? null : current)}
                />
                {activePoint === id ? (
                  <div role="tooltip" className={styles.tooltip}>
                    {point.label} · {formatMoneyCents(point.balanceCents)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.dateAxis} aria-label="Inicio y fin del periodo"><span>{formatDate(snapshot.period.dateFrom)}</span><span>{formatDate(snapshot.period.dateTo)}</span></div>

      <div className={styles.tableScroller}>
        <table aria-label="Datos de la curva de saldo" className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Hito</th>
              <th scope="col">Fecha</th>
              <th scope="col">Saldo previsto</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: "opening", label: "Saldo inicial", date: snapshot.period.dateFrom, balanceCents: snapshot.summary.openingBalanceCents },
              ...snapshot.items.map((item) => ({ id: item.id, label: item.concept, date: item.date, balanceCents: item.projectedBalanceAfterCents })),
            ].map((point) => (
              <tr key={point.id}>
                <th scope="row">{point.label}</th>
                <td>{formatDate(point.date)}</td>
                <td>{formatMoneyCents(point.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
