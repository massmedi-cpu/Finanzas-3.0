"use client";

import { useState } from "react";
import type { ForecastSnapshot } from "../application/forecast/forecast-contract";
import styles from "./forecast-balance-chart.module.css";

const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

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
  const points = [
    {
      id: "opening",
      label: "Saldo inicial",
      date: snapshot.period.dateFrom,
      balanceCents: snapshot.summary.openingBalanceCents,
    },
    ...snapshot.items.map((item) => ({
      id: item.id,
      label: item.concept,
      date: item.date,
      balanceCents: item.projectedBalanceAfterCents,
    })),
  ];
  const balances = points.map((point) => point.balanceCents);
  const minimum = Math.min(...balances);
  const maximum = Math.max(...balances);
  const range = Math.max(1, maximum - minimum);
  const coordinateFor = (balanceCents: number) => 15 + ((maximum - balanceCents) / range) * 70;
  const xFor = (index: number) => points.length <= 1 ? 50 : 5 + (index / (points.length - 1)) * 90;
  const polyline = points.map((point, index) => `${xFor(index) * 10},${coordinateFor(point.balanceCents) * 2.4}`).join(" ");

  return (
    <section className={styles.panel} aria-label="Curva de saldo prevista">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SALDO PROYECTADO</p>
          <h2>Curva de saldo prevista</h2>
        </div>
        <span className={styles.meta}>Valores del motor de previsión · sin recálculo visual</span>
      </div>

      <div className={styles.plotScroller}>
        <div className={styles.plot}>
          <svg viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true" className={styles.svg}>
            <defs>
              <linearGradient id="forecast-curve-gradient" x1="0" x2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".45" />
                <stop offset="100%" stopColor="currentColor" stopOpacity=".95" />
              </linearGradient>
            </defs>
            <line x1="0" x2="1000" y1="120" y2="120" stroke="currentColor" strokeOpacity=".08" strokeDasharray="8 12" />
            <polyline points={polyline} fill="none" stroke="url(#forecast-curve-gradient)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>

          {points.map((point, index) => {
            const id = `forecast-balance-${point.id}`;
            const label = `${point.label} · ${formatDate(point.date)} · ${money.format(point.balanceCents / 100)}`;
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
                    {point.label} · {money.format(point.balanceCents / 100)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

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
            {points.map((point) => (
              <tr key={point.id}>
                <th scope="row">{point.label}</th>
                <td>{formatDate(point.date)}</td>
                <td>{money.format(point.balanceCents / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
