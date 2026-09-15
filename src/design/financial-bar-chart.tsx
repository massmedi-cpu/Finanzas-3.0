"use client";

import { useMemo, useState } from "react";
import styles from "./financial-bar-chart.module.css";

export type FinancialBarPoint = {
  monthStart: string;
  incomeCents: number;
  expenseCents: number;
  operatingNetCents: number;
};

type FinancialBarChartProps = {
  rows: FinancialBarPoint[];
  maxValue: number;
  formatMoney: (cents: number) => string;
  formatMonth: (date: string) => string;
  partialMonthStart?: string | null;
};

export function FinancialBarChart({
  rows,
  maxValue,
  formatMoney,
  formatMonth,
  partialMonthStart = null,
}: FinancialBarChartProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((row) => row.monthStart === selectedMonth) ?? null,
    [rows, selectedMonth],
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.incomeDot} />Ingresos</span>
        <span><i className={styles.expenseDot} />Gastos</span>
        <span>El balance se muestra como cifra con signo</span>
      </div>

      <div
        className={styles.chart}
        role="group"
        aria-label="Ingresos y gastos por mes. El balance neto se muestra como cifra con signo para no representar un saldo negativo como una barra positiva."
      >
        {rows.map((row) => {
          const label = formatMonth(row.monthStart);
          const active = selected?.monthStart === row.monthStart;
          const partial = partialMonthStart === row.monthStart;
          const scale = Math.max(1, maxValue);
          const incomeHeight = Math.max(3, (Math.abs(row.incomeCents) / scale) * 100);
          const expenseHeight = Math.max(3, (Math.abs(row.expenseCents) / scale) * 100);

          return (
            <button
              type="button"
              key={row.monthStart}
              className={`${styles.column}${active ? ` ${styles.active}` : ""}${partial ? ` ${styles.partial}` : ""}`}
              aria-pressed={active}
              aria-label={`${label}${partial ? ", mes parcial" : ""}: ingresos ${formatMoney(row.incomeCents)}, gastos ${formatMoney(
                row.expenseCents,
              )}, balance neto ${formatMoney(row.operatingNetCents)}`}
              onClick={() => setSelectedMonth(row.monthStart)}
              onFocus={() => setSelectedMonth(row.monthStart)}
            >
              <span className={styles.bars} aria-hidden="true">
                <span className={styles.incomeBar} style={{ height: `${incomeHeight}%` }} />
                <span className={styles.expenseBar} style={{ height: `${expenseHeight}%` }} />
              </span>
              <span className={styles.month}>{label}</span>
              <span
                className={`${styles.netValue} ${
                  row.operatingNetCents < 0 ? styles.netNegative : styles.netPositive
                }`}
              >
                <span>Saldo </span><span>{formatMoney(row.operatingNetCents)}</span>
              </span>
              {partial && <span className={styles.partialLabel}>Parcial</span>}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className={styles.readout} role="status" aria-live="polite">
          <strong>
            {formatMonth(selected.monthStart)}
            {partialMonthStart === selected.monthStart ? " · parcial" : ""}
          </strong>
          <span>
            <i className={styles.incomeDot} aria-hidden="true" />
            Ingresos {formatMoney(selected.incomeCents)}
          </span>
          <span>
            <i className={styles.expenseDot} aria-hidden="true" />
            Gastos {formatMoney(selected.expenseCents)}
          </span>
          <span className={selected.operatingNetCents < 0 ? styles.readoutNegative : styles.readoutPositive}>
            Balance {formatMoney(selected.operatingNetCents)}
          </span>
        </div>
      )}
    </div>
  );
}
