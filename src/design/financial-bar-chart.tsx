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
    () => rows.find((row) => row.monthStart === selectedMonth) ?? rows.at(-1) ?? null,
    [rows, selectedMonth],
  );

  // Inicio injects the same formatter that masks monetary amounts. When the
  // formatter cannot distinguish one cent from zero, the chart must not keep
  // exposing the original values through relative bar heights.
  const valuesVisible = formatMoney(0) !== formatMoney(1);

  return (
    <div className={styles.wrapper}>
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.incomeDot} />Ingresos</span>
        <span><i className={styles.expenseDot} />Gastos</span>
        <span>{valuesVisible ? "Toca un mes para ver las cifras exactas" : "Importes ocultos · proporciones protegidas"}</span>
      </div>

      <div
        className={styles.chart}
        role="group"
        aria-label={valuesVisible
          ? "Ingresos y gastos por mes. Selecciona un mes para consultar ingresos, gastos y balance neto con signo."
          : "Ingresos y gastos por mes. Los importes y las proporciones están ocultos por privacidad."}
      >
        {rows.map((row) => {
          const label = formatMonth(row.monthStart);
          const active = selected?.monthStart === row.monthStart;
          const partial = partialMonthStart === row.monthStart;
          const scale = Math.max(1, maxValue);
          const incomeHeight = valuesVisible ? Math.max(3, (Math.abs(row.incomeCents) / scale) * 100) : 36;
          const expenseHeight = valuesVisible ? Math.max(3, (Math.abs(row.expenseCents) / scale) * 100) : 36;

          return (
            <button
              type="button"
              key={row.monthStart}
              className={`${styles.column}${active ? ` ${styles.active}` : ""}${partial ? ` ${styles.partial}` : ""}`}
              aria-pressed={active}
              aria-label={valuesVisible
                ? `${label}${partial ? ", mes parcial" : ""}: ingresos ${formatMoney(row.incomeCents)}, gastos ${formatMoney(
                    row.expenseCents,
                  )}, balance neto ${formatMoney(row.operatingNetCents)}`
                : `${label}${partial ? ", mes parcial" : ""}: importes ocultos por privacidad`}
              onClick={() => setSelectedMonth(row.monthStart)}
              onFocus={() => setSelectedMonth(row.monthStart)}
            >
              <span className={styles.bars} aria-hidden="true">
                <span className={styles.incomeBar} style={{ height: `${incomeHeight}%` }} />
                <span className={styles.expenseBar} style={{ height: `${expenseHeight}%` }} />
              </span>
              <span className={styles.month}>{label}</span>
              {partial && <span className={styles.partialLabel} aria-hidden="true">Par.</span>}
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