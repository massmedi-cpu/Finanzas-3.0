"use client";

import { useEffect, useMemo, useState } from "react";
import { FinancialBarChart, type FinancialBarPoint } from "../src/design/financial-bar-chart";
import styles from "./inicio-overview.module.css";

type EvolutionMode = "balance" | "income_expense" | "net";

type BalanceRow = {
  monthStart: string;
  asOfDate: string;
  balanceCents: number;
  accounts: number;
  explicitBalanceAccounts: number;
  reconstructedBalanceAccounts: number;
};

type BalanceSeries = {
  dateFrom: string;
  dateTo: string;
  accountId: string | null;
  rows: BalanceRow[];
  principles: {
    bankSource: "read_only";
    balanceSource: "financial_account_balances";
    cashFlowReconstruction: false;
    getHasSideEffects: false;
  };
};

function SingleSeriesBars({
  rows,
  valueFor,
  label,
  formatMoney,
  formatMonth,
  signed = false,
}: {
  rows: Array<FinancialBarPoint | BalanceRow>;
  valueFor: (row: FinancialBarPoint | BalanceRow) => number;
  label: string;
  formatMoney: (value: number) => string;
  formatMonth: (date: string) => string;
  signed?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(valueFor(row))));
  return (
    <div className={styles.evolutionSingle} role="group" aria-label={label}>
      {rows.map((row) => {
        const value = valueFor(row);
        const height = Math.max(3, (Math.abs(value) / max) * 100);
        return (
          <div className={styles.evolutionSingleColumn} key={row.monthStart}>
            <div className={styles.evolutionBarArea} aria-hidden="true">
              <span
                className={`${styles.evolutionSingleBar} ${signed && value < 0 ? styles.evolutionNegativeBar : ""}`}
                style={{ height: `${height}%` }}
              />
            </div>
            <strong>{formatMoney(value)}</strong>
            <span>{formatMonth(row.monthStart)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function HomeEvolution({
  rows,
  dateFrom,
  dateTo,
  maxValue,
  formatMoney,
  formatMonth,
  partialMonthStart,
}: {
  rows: FinancialBarPoint[];
  dateFrom: string;
  dateTo: string;
  maxValue: number;
  formatMoney: (value: number) => string;
  formatMonth: (date: string) => string;
  partialMonthStart?: string | null;
}) {
  const [mode, setMode] = useState<EvolutionMode>("income_expense");
  const [balances, setBalances] = useState<BalanceSeries | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(false);

  useEffect(() => {
    if (mode !== "balance" || balances) return;
    const controller = new AbortController();
    setBalanceLoading(true);
    setBalanceError(false);
    const params = new URLSearchParams({ mode: "balance_series", dateFrom, dateTo });
    void fetch(`/api/financial?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("balance_series_unavailable");
        return response.json() as Promise<BalanceSeries>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setBalances(payload);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError") && !controller.signal.aborted) {
          setBalanceError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBalanceLoading(false);
      });
    return () => controller.abort();
  }, [balances, dateFrom, dateTo, mode]);

  const balanceRows = useMemo(() => balances?.rows ?? [], [balances]);

  return (
    <div className={styles.evolutionView}>
      <div className={styles.evolutionModes} role="group" aria-label="Vista de evolución financiera">
        <button type="button" aria-pressed={mode === "balance"} onClick={() => setMode("balance")}>Saldo</button>
        <button type="button" aria-pressed={mode === "income_expense"} onClick={() => setMode("income_expense")}>Ingresos y gastos</button>
        <button type="button" aria-pressed={mode === "net"} onClick={() => setMode("net")}>Flujo neto</button>
      </div>

      {mode === "income_expense" ? (
        <>
          <FinancialBarChart
            rows={rows}
            maxValue={maxValue}
            formatMoney={formatMoney}
            formatMonth={formatMonth}
            partialMonthStart={partialMonthStart}
          />
          <p className={styles.helper}>Ingresos y gastos proceden de la serie mensual del motor financiero central.</p>
        </>
      ) : null}

      {mode === "net" ? (
        <>
          <SingleSeriesBars
            rows={rows}
            valueFor={(row) => (row as FinancialBarPoint).operatingNetCents}
            label="Flujo neto por mes"
            formatMoney={formatMoney}
            formatMonth={formatMonth}
            signed
          />
          <p className={styles.helper}>Flujo neto = ingresos menos gastos elegibles del mismo motor financiero; las transferencias internas no se cuentan como gasto o ingreso operativo.</p>
        </>
      ) : null}

      {mode === "balance" && balanceLoading ? <div className={styles.skeleton} aria-label="Cargando evolución del saldo" /> : null}
      {mode === "balance" && balanceError ? (
        <p className={styles.empty} role="status">No se ha podido cargar la evolución del saldo. Las otras vistas siguen disponibles.</p>
      ) : null}
      {mode === "balance" && !balanceLoading && !balanceError && balanceRows.length > 0 ? (
        <>
          <SingleSeriesBars
            rows={balanceRows}
            valueFor={(row) => (row as BalanceRow).balanceCents}
            label="Saldo bancario agregado por mes"
            formatMoney={formatMoney}
            formatMonth={formatMonth}
          />
          <p className={styles.helper}>Saldo bancario disponible a cada cierre o fecha de corte. Usa el motor canónico de saldos y no reconstruye el saldo sumando el cash flow.</p>
        </>
      ) : null}
    </div>
  );
}
