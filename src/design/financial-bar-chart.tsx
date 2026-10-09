"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import styles from "./financial-bar-chart.module.css";

export type FinancialBarPoint = {
  monthStart: string;
  incomeCents: number;
  expenseCents: number;
  operatingNetCents: number;
  coverage?: "unknown" | "none" | "partial" | "covered";
};

export function monthlyTransactionsHref(monthStart: string) {
  const start = new Date(`${monthStart}T12:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12));
  return `/transactions?dateFrom=${monthStart}&dateTo=${end.toISOString().slice(0, 10)}`;
}

const monthAndYear = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
function fullMonth(monthStart: string) { return monthAndYear.format(new Date(`${monthStart}T12:00:00Z`)); }
function hasData(row: FinancialBarPoint) { return row.coverage !== "none" && row.coverage !== "unknown"; }

type FinancialBarChartProps = {
  rows: FinancialBarPoint[];
  maxValue: number;
  valuesVisible: boolean;
  formatMoney: (cents: number) => string;
  formatMonth: (date: string) => string;
  partialMonthStart?: string | null;
};

export function FinancialBarChart({
  rows,
  maxValue,
  valuesVisible,
  formatMoney,
  formatMonth,
  partialMonthStart = null,
}: FinancialBarChartProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((row) => row.monthStart === selectedMonth) ?? rows.at(-1) ?? null,
    [rows, selectedMonth],
  );

  // La visibilidad se recibe explícitamente desde Inicio: no se deduce del
  // formato monetario, porque 0 y 1 céntimo pueden redondearse igual.

  return (
    <div className={styles.wrapper}>
      <div className={styles.legend} role="group" aria-label="Leyenda y escala de ingresos y gastos">
        <span><i className={styles.incomeDot} aria-hidden="true" />Ingresos</span>
        <span><i className={styles.expenseDot} aria-hidden="true" />Gastos</span>
        <span>{valuesVisible ? "Toca un mes para ver las cifras exactas" : "Importes ocultos · proporciones protegidas"}</span>
        <span data-testid="financial-bar-scale-reference">
          {valuesVisible ? `Escala máxima ${formatMoney(maxValue)}` : "Escala protegida por privacidad"}
        </span>
      </div>

      <div
        className={styles.chart}
        style={{ "--chart-columns": Math.max(1, Math.min(12, rows.length)), "--chart-mobile-columns": Math.max(1, Math.min(6, rows.length)) } as CSSProperties}
        role="group"
        aria-label={valuesVisible
          ? "Ingresos y gastos por mes. Selecciona un mes para consultar ingresos, gastos y balance neto con signo."
          : "Ingresos y gastos por mes. Los importes y las proporciones están ocultos por privacidad."}
      >
        {rows.map((row) => {
          const label = formatMonth(row.monthStart);
          const available = hasData(row);
          const accessibleLabel = fullMonth(row.monthStart);
          const active = selected?.monthStart === row.monthStart;
          const partial = available && (row.coverage === "partial" || (!row.coverage && partialMonthStart === row.monthStart));
          const scale = Math.max(1, maxValue);
          const incomeHeight = valuesVisible
            ? (row.incomeCents === 0 ? 0 : Math.max(3, (Math.abs(row.incomeCents) / scale) * 100))
            : 36;
          const expenseHeight = valuesVisible
            ? (row.expenseCents === 0 ? 0 : Math.max(3, (Math.abs(row.expenseCents) / scale) * 100))
            : 36;

          return (
            <button
              type="button"
              key={row.monthStart}
              className={`${styles.column}${active ? ` ${styles.active}` : ""}${partial ? ` ${styles.partial}` : ""}`}
              data-dense-target="true"
              data-month-coverage={row.coverage ?? "covered"}
              aria-pressed={active}
              aria-label={!available ? `${accessibleLabel}: sin cobertura bancaria confirmada` : valuesVisible
                ? `${accessibleLabel}${partial ? ", mes parcial" : ""}: ingresos ${formatMoney(row.incomeCents)}, gastos ${formatMoney(
                    row.expenseCents,
                  )}, balance neto ${formatMoney(row.operatingNetCents)}`
                : `${accessibleLabel}${partial ? ", mes parcial" : ""}: importes ocultos por privacidad`}
              onClick={() => setSelectedMonth(row.monthStart)}
              onFocus={() => setSelectedMonth(row.monthStart)}
            >
              <span className={styles.bars} aria-hidden="true">
                {available ? <>
                <span className={styles.incomeBar} data-zero={valuesVisible && row.incomeCents === 0 ? "true" : undefined} style={{ height: `${incomeHeight}%` }} />
                <span className={styles.expenseBar} data-zero={valuesVisible && row.expenseCents === 0 ? "true" : undefined} style={{ height: `${expenseHeight}%` }} />
                </> : <span className={styles.missingMarker} />}
              </span>
              <span className={styles.month}>{label}</span>
              {partial && <span className={styles.partialLabel} aria-hidden="true">Par.</span>}
              {!available && <span className={styles.missingLabel} aria-hidden="true">—</span>}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className={styles.readout} role="status" aria-live="polite">
          <strong>
            {fullMonth(selected.monthStart)}
            {hasData(selected) && (selected.coverage === "partial" || (!selected.coverage && partialMonthStart === selected.monthStart)) ? " · parcial" : ""}
          </strong>
          {hasData(selected) ? <>
          <span>
            <i className={styles.incomeDot} aria-hidden="true" />
            Ingresos {formatMoney(selected.incomeCents)}
          </span>
          <span>
            <i className={styles.expenseDot} aria-hidden="true" />
            Gastos {formatMoney(selected.expenseCents)}
          </span>
          <span
            className={!valuesVisible || selected.operatingNetCents === 0
              ? styles.readoutNeutral
              : selected.operatingNetCents < 0
                ? styles.readoutNegative
                : styles.readoutPositive}
            data-balance-sign={valuesVisible
              ? selected.operatingNetCents < 0
                ? "negative"
                : selected.operatingNetCents > 0
                  ? "positive"
                  : "zero"
              : "hidden"}
          >
            Balance {formatMoney(selected.operatingNetCents)}
          </span>
          <Link prefetch={false} href={monthlyTransactionsHref(selected.monthStart)} className={styles.drilldown}>Ver movimientos de este mes</Link>
          </> : <span>Sin cobertura bancaria confirmada. Las cifras del mes están pendientes.</span>}
        </div>
      )}
      <details className={styles.dataTable}>
        <summary>Ver datos por mes</summary>
        <div className={styles.tableViewport}>
          <table>
            <caption>Ingresos, gastos y flujo neto del motor financiero. Los meses sin cobertura aparecen como «Sin dato».</caption>
            <thead><tr><th scope="col">Mes</th><th scope="col">Ingresos</th><th scope="col">Gastos</th><th scope="col">Flujo neto</th><th scope="col">Cobertura</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.monthStart}>
              <th scope="row">{fullMonth(row.monthStart)}</th>
              <td>{hasData(row) ? formatMoney(row.incomeCents) : "Sin dato"}</td>
              <td>{hasData(row) ? formatMoney(row.expenseCents) : "Sin dato"}</td>
              <td>{hasData(row) ? formatMoney(row.operatingNetCents) : "Sin dato"}</td>
              <td>{row.coverage === "partial" ? "Parcial" : hasData(row) ? "Observada" : "Pendiente"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
