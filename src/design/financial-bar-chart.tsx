"use client";

import { useMemo, useState } from "react";
import styles from "./financial-bar-chart.module.css";

export type FinancialBarPoint = {
  monthStart: string;
  incomeCents: number;
  expenseCents: number;
};

type FinancialBarChartProps = {
  rows: FinancialBarPoint[];
  maxValue: number;
  formatMoney: (cents: number) => string;
  formatMonth: (date: string) => string;
};

export function FinancialBarChart({ rows, maxValue, formatMoney, formatMonth }: FinancialBarChartProps) {
  const fallbackMonth = rows.at(-1)?.monthStart ?? null;
  const [selectedMonth, setSelectedMonth] = useState<string | null>(fallbackMonth);
  const selected = useMemo(
    () => rows.find((row) => row.monthStart === selectedMonth) ?? rows.at(-1) ?? null,
    [rows, selectedMonth],
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.chart} role="group" aria-label="Ingresos y gastos por mes. Selecciona un mes para consultar sus importes exactos.">
        {rows.map((row) => {
          const label = formatMonth(row.monthStart);
          const active = selected?.monthStart === row.monthStart;
          const incomeHeight = Math.max(4, (row.incomeCents / Math.max(1, maxValue)) * 100);
          const expenseHeight = Math.max(4, (row.expenseCents / Math.max(1, maxValue)) * 100);
          return (
            <button
              type="button"
              key={row.monthStart}
              className={`${styles.column}${active ? ` ${styles.active}` : ""}`}
              aria-pressed={active}
              aria-label={`${label}: ingresos ${formatMoney(row.incomeCents)}, gastos ${formatMoney(row.expenseCents)}`}
              onClick={() => setSelectedMonth(row.monthStart)}
              onFocus={() => setSelectedMonth(row.monthStart)}
            >
              <span className={styles.bars} aria-hidden="true">
                <span className={styles.incomeBar} style={{ height: `${incomeHeight}%` }} />
                <span className={styles.expenseBar} style={{ height: `${expenseHeight}%` }} />
              </span>
              <span className={styles.month}>{label}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className={styles.readout} role="status" aria-live="polite">
          <strong>{formatMonth(selected.monthStart)}</strong>
          <span><i className={styles.incomeDot} aria-hidden="true" />Ingresos {formatMoney(selected.incomeCents)}</span>
          <span><i className={styles.expenseDot} aria-hidden="true" />Gastos {formatMoney(selected.expenseCents)}</span>
        </div>
      )}
    </div>
  );
}
