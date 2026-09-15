"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./financial-trend-chart.module.css";

export type FinancialTrendPoint = {
  monthStart: string;
  incomeCents: number;
  expenseCents: number;
  operatingNetCents: number;
};

type Props = {
  rows: FinancialTrendPoint[];
  formatMoney: (cents: number) => string;
  formatMonth: (date: string) => string;
  hrefForMonth: (monthStart: string) => string;
  partialMonthStart?: string | null;
};

export function FinancialTrendChart({
  rows,
  formatMoney,
  formatMonth,
  hrefForMonth,
  partialMonthStart = null,
}: Props) {
  const [activeMonth, setActiveMonth] = useState(rows.at(-1)?.monthStart ?? null);
  const active = rows.find((row) => row.monthStart === activeMonth) ?? rows.at(-1) ?? null;

  const chart = useMemo(() => {
    if (rows.length === 0) return null;
    const width = 1200;
    const height = 320;
    const left = 76;
    const right = 24;
    const top = 20;
    const bottom = 42;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const values = rows.flatMap((row) => [row.incomeCents, row.expenseCents, row.operatingNetCents]);
    const maximum = Math.max(1, ...values, 0);
    const minimum = Math.min(0, ...values);
    const span = Math.max(1, maximum - minimum);
    const y = (value: number) => top + ((maximum - value) / span) * innerHeight;
    const baseline = y(0);
    const step = innerWidth / rows.length;
    const groupWidth = Math.min(58, step * 0.7);
    const barWidth = Math.max(8, groupWidth * 0.43);
    const points = rows.map((row, index) => ({
      x: left + step * index + step / 2,
      y: y(row.operatingNetCents),
    }));
    const ticks = Array.from({ length: 5 }, (_, index) => maximum - (span * index) / 4);
    return { width, height, left, right, y, baseline, step, barWidth, points, ticks };
  }, [rows]);

  if (!chart || rows.length === 0) {
    return <p className={styles.empty}>No hay histórico suficiente para dibujar la evolución.</p>;
  }

  const path = chart.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className={styles.wrapper}>
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.incomeDot} />Ingresos</span>
        <span><i className={styles.expenseDot} />Gastos</span>
        <span><i className={styles.netDot} />Ahorro / neto</span>
      </div>

      <div className={styles.viewport}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label="Evolución mensual de ingresos, gastos y ahorro. Los valores exactos están disponibles mediante los controles situados bajo la gráfica."
        >
          {chart.ticks.map((tick) => {
            const y = chart.y(tick);
            return (
              <g key={tick} className={styles.gridLine}>
                <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} />
                <text x={chart.left - 12} y={y + 5} textAnchor="end">{formatMoney(Math.round(tick))}</text>
              </g>
            );
          })}
          <line className={styles.zeroLine} x1={chart.left} x2={chart.width - chart.right} y1={chart.baseline} y2={chart.baseline} />

          {rows.map((row, index) => {
            const center = chart.left + chart.step * index + chart.step / 2;
            const incomeY = chart.y(row.incomeCents);
            const expenseY = chart.y(row.expenseCents);
            const activePoint = row.monthStart === active?.monthStart;
            return (
              <g key={row.monthStart} className={activePoint ? styles.activeGroup : undefined}>
                <rect
                  className={styles.incomeBar}
                  x={center - chart.barWidth - 3}
                  y={incomeY}
                  width={chart.barWidth}
                  height={Math.max(1, chart.baseline - incomeY)}
                  rx="7"
                />
                <rect
                  className={styles.expenseBar}
                  x={center + 3}
                  y={expenseY}
                  width={chart.barWidth}
                  height={Math.max(1, chart.baseline - expenseY)}
                  rx="7"
                />
              </g>
            );
          })}

          <path className={styles.netLine} d={path} />
          {chart.points.map((point, index) => (
            <circle
              key={rows[index].monthStart}
              className={rows[index].monthStart === active?.monthStart ? styles.netPointActive : styles.netPoint}
              cx={point.x}
              cy={point.y}
              r={rows[index].monthStart === active?.monthStart ? 7 : 4.5}
            />
          ))}
        </svg>
      </div>

      <div className={styles.monthViewport}>
        <div className={styles.monthRail} style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(2.75rem, 1fr))` }}>
          {rows.map((row) => {
            const partial = row.monthStart === partialMonthStart;
            const selected = row.monthStart === active?.monthStart;
            return (
              <button
                key={row.monthStart}
                type="button"
                className={selected ? styles.monthButtonActive : styles.monthButton}
                aria-pressed={selected}
                aria-label={`${formatMonth(row.monthStart)}${partial ? ", periodo parcial" : ""}: ingresos ${formatMoney(row.incomeCents)}, gastos ${formatMoney(row.expenseCents)}, ahorro o neto ${formatMoney(row.operatingNetCents)}`}
                onClick={() => setActiveMonth(row.monthStart)}
                onFocus={() => setActiveMonth(row.monthStart)}
              >
                <span>{formatMonth(row.monthStart)}</span>
                {partial && <small>Parcial</small>}
              </button>
            );
          })}
        </div>
      </div>

      {active && (
        <div className={styles.readout} role="status" aria-live="polite">
          <div>
            <strong>{formatMonth(active.monthStart)}</strong>
            {active.monthStart === partialMonthStart && <span className={styles.partialBadge}>Parcial</span>}
          </div>
          <dl>
            <div><dt>Ingresos</dt><dd>{formatMoney(active.incomeCents)}</dd></div>
            <div><dt>Gastos</dt><dd>{formatMoney(active.expenseCents)}</dd></div>
            <div><dt>Ahorro / neto</dt><dd className={active.operatingNetCents < 0 ? styles.negative : styles.positive}>{formatMoney(active.operatingNetCents)}</dd></div>
          </dl>
          <Link href={hrefForMonth(active.monthStart)}>Ver movimientos del mes</Link>
        </div>
      )}
    </div>
  );
}
