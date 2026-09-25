"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CashFlowEvolutionPoint } from "../../src/application/cash-flow/cash-flow-model";
import { formatMoneyCents } from "../../src/core/money";
import styles from "./cash-flow.module.css";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

type SeriesKey = "realCumulativeCents" | "plannedCumulativeCents" | "combinedCumulativeCents";

const series: Array<{ key: SeriesKey; label: string; className: string }> = [
  { key: "realCumulativeCents", label: "Real acumulado", className: styles.evolutionReal },
  { key: "plannedCumulativeCents", label: "Previsto pendiente acumulado", className: styles.evolutionPlanned },
  { key: "combinedCumulativeCents", label: "Resultado potencial acumulado", className: styles.evolutionCombined },
];

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00Z`));
}

function stateLabel(value: number | null) {
  return value === null ? "No disponible" : formatMoneyCents(value);
}

export function CashFlowEvolution({
  points,
  onInspectDate,
}: {
  points: CashFlowEvolutionPoint[];
  onInspectDate: (date: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(Math.max(0, points.length - 1));
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, points.length - 1));
  const active = points[safeActiveIndex] ?? null;

  const chart = useMemo(() => {
    const width = 1_000;
    const height = 300;
    const left = 82;
    const right = 22;
    const top = 24;
    const bottom = 42;
    const values = points.flatMap((point) => series.flatMap(({ key }) => {
      const value = point[key];
      return value === null ? [] : [value];
    }));
    if (values.length === 0 || points.length === 0) return null;
    const maximum = Math.max(0, ...values);
    const minimum = Math.min(0, ...values);
    const span = Math.max(1, maximum - minimum);
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const x = (index: number) => points.length === 1
      ? left + innerWidth / 2
      : left + (index / (points.length - 1)) * innerWidth;
    const y = (value: number) => top + ((maximum - value) / span) * innerHeight;
    const paths = Object.fromEntries(series.map(({ key }) => {
      let started = false;
      const commands = points.flatMap((point, index) => {
        if (point[key] === null) return [];
        const command = `${started ? "L" : "M"} ${x(index)} ${y(point[key])}`;
        started = true;
        return [command];
      });
      return [key, commands.join(" ")];
    })) as Record<SeriesKey, string>;
    const ticks = Array.from({ length: 5 }, (_, index) => maximum - (span * index) / 4);
    return { width, height, left, right, bottom, x, y, paths, ticks, zeroY: y(0) };
  }, [points]);

  if (!chart || !active) {
    return (
      <section className={styles.evolution} aria-labelledby="cash-flow-evolution-title">
        <div className={styles.sectionTitle}>
          <div><p className={styles.eyebrow}>EVOLUCIÓN</p><h2 id="cash-flow-evolution-title">Flujo acumulado del mes</h2></div>
        </div>
        <p className={styles.empty}>La evolución aparecerá cuando esté disponible al menos uno de los motores conciliados.</p>
      </section>
    );
  }

  const activeX = chart.x(safeActiveIndex);
  const movementsHref = `/transactions?dateFrom=${active.date}&dateTo=${active.date}`;

  return (
    <section className={styles.evolution} aria-labelledby="cash-flow-evolution-title">
      <div className={styles.sectionTitle}>
        <div>
          <p className={styles.eyebrow}>EVOLUCIÓN</p>
          <h2 id="cash-flow-evolution-title">Flujo acumulado del mes</h2>
        </div>
        <p>No es el saldo de las cuentas: muestra cómo se forma el neto real y qué añadirían los eventos pendientes.</p>
      </div>

      <div className={styles.evolutionLegend} aria-label="Series de la evolución">
        {series.map(({ key, label, className }) => points.some((point) => point[key] !== null) ? (
          <span key={key}><i className={className} />{label}</span>
        ) : null)}
      </div>

      <div className={styles.evolutionPlot}>
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Evolución diaria acumulada del Cash Flow">
          {chart.ticks.map((tick, index) => {
            const y = chart.y(tick);
            return (
              <g key={index} className={styles.evolutionGrid}>
                <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} />
                <text x={chart.left - 12} y={y + 5} textAnchor="end">{formatMoneyCents(Math.round(tick))}</text>
              </g>
            );
          })}
          <line className={styles.evolutionZero} x1={chart.left} x2={chart.width - chart.right} y1={chart.zeroY} y2={chart.zeroY} />
          {series.map(({ key, className }) => chart.paths[key] ? (
            <path key={key} className={className} d={chart.paths[key]} />
          ) : null)}
          <line className={styles.evolutionCursor} x1={activeX} x2={activeX} y1={24} y2={chart.height - chart.bottom} />
          {series.map(({ key, className }) => active[key] === null ? null : (
            <circle key={key} className={className} cx={activeX} cy={chart.y(active[key])} r="6" />
          ))}
        </svg>
      </div>

      <label className={styles.evolutionScrubber}>
        <span>Día consultado: <strong>{formatDate(active.date)}</strong></span>
        <input
          type="range"
          min="1"
          max={points.length}
          step="1"
          value={safeActiveIndex + 1}
          aria-label="Elegir día de la evolución"
          aria-valuetext={formatDate(active.date)}
          onChange={(event) => setActiveIndex(Number(event.target.value) - 1)}
        />
      </label>

      <div className={styles.evolutionReadout} aria-live="polite">
        <div><span>Real acumulado</span><strong>{stateLabel(active.realCumulativeCents)}</strong></div>
        <div><span>Previsto pendiente</span><strong>{stateLabel(active.plannedCumulativeCents)}</strong></div>
        <div><span>Resultado potencial</span><strong>{stateLabel(active.combinedCumulativeCents)}</strong></div>
        <div className={styles.evolutionActions}>
          <button type="button" onClick={() => onInspectDate(active.date)}>Abrir día en el calendario</button>
          <Link prefetch={false} href={movementsHref}>Ver movimientos del día</Link>
        </div>
      </div>

      <table className={styles.srTable}>
        <caption>Datos diarios acumulados del Cash Flow</caption>
        <thead><tr><th>Fecha</th><th>Real</th><th>Previsto pendiente</th><th>Resultado potencial</th></tr></thead>
        <tbody>{points.map((point) => (
          <tr key={point.date}>
            <th scope="row">{formatDate(point.date)}</th>
            <td>{stateLabel(point.realCumulativeCents)}</td>
            <td>{stateLabel(point.plannedCumulativeCents)}</td>
            <td>{stateLabel(point.combinedCumulativeCents)}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}
