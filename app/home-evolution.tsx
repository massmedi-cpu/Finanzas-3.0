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
  valuesVisible,
  formatMoney,
  formatMonth,
  signed = false,
  availableFor,
}: {
  rows: Array<FinancialBarPoint | BalanceRow>;
  valueFor: (row: FinancialBarPoint | BalanceRow) => number;
  label: string;
  valuesVisible: boolean;
  formatMoney: (value: number) => string;
  formatMonth: (date: string) => string;
  signed?: boolean;
  availableFor?: (row: FinancialBarPoint | BalanceRow) => boolean;
}) {
  const availableRows = availableFor ? rows.filter(availableFor) : rows;
  const max = Math.max(1, ...availableRows.map((row) => Math.abs(valueFor(row))));
  return (
    <div
      className={styles.evolutionSingle}
      role="group"
      aria-label={valuesVisible ? label : `${label}. Importes, signos y proporciones ocultos por privacidad.`}
    >
      {rows.map((row) => {
        const available = availableFor ? availableFor(row) : true;
        const value = available ? valueFor(row) : 0;
        const height = value === 0 ? 0 : Math.max(3, (Math.abs(value) / max) * 100);
        const visualSigned = available && signed && valuesVisible;
        const renderedHeight = valuesVisible ? (visualSigned ? height / 2 : height) : 36;
        const sign = visualSigned ? (value < 0 ? "negative" : value > 0 ? "positive" : "zero") : undefined;
        return (
          <div className={styles.evolutionSingleColumn} key={row.monthStart}>
            <div className={`${styles.evolutionBarArea}${visualSigned ? ` ${styles.evolutionSignedArea}` : ""}`} aria-hidden="true">
              {available ? (
                <>
                  {visualSigned ? <span className={styles.evolutionZeroLine} data-zero-line="true" /> : null}
                  <span
                    className={`${styles.evolutionSingleBar} ${visualSigned ? styles.evolutionSignedBar : ""} ${visualSigned && value < 0 ? styles.evolutionNegativeBar : ""}`}
                    data-series-bar="true"
                    data-zero={valuesVisible && value === 0 ? "true" : undefined}
                    data-sign={sign}
                    style={{ height: `${renderedHeight}%` }}
                  />
                </>
              ) : (
                <span className={styles.evolutionMissingMarker} data-series-missing="true" />
              )}
            </div>
            <strong>{available ? formatMoney(value) : "Sin dato"}</strong>
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
  valuesVisible,
  formatMoney,
  formatMonth,
  partialMonthStart,
  refreshKey,
}: {
  rows: FinancialBarPoint[];
  dateFrom: string;
  dateTo: string;
  maxValue: number;
  valuesVisible: boolean;
  formatMoney: (value: number) => string;
  formatMonth: (date: string) => string;
  partialMonthStart?: string | null;
  refreshKey: number;
}) {
  const [mode, setMode] = useState<EvolutionMode>("income_expense");
  const [balanceCache, setBalanceCache] = useState<{ key: string; data: BalanceSeries } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const balanceKey = `${dateFrom}|${dateTo}|${refreshKey}`;
  const balances = balanceCache?.key === balanceKey ? balanceCache.data : null;

  useEffect(() => {
    if (mode !== "balance" || balanceCache?.key === balanceKey) return;
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
        if (!controller.signal.aborted) setBalanceCache({ key: balanceKey, data: payload });
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
  }, [balanceCache?.key, balanceKey, dateFrom, dateTo, mode]);

  const balanceRows = useMemo(() => balances?.rows ?? [], [balances]);
  const reconstructedBalancePoints = useMemo(
    () => balanceRows.filter((row) => row.reconstructedBalanceAccounts > 0).length,
    [balanceRows],
  );
  const balanceAvailablePoints = useMemo(
    () => balanceRows.filter((row) => row.accounts > 0).length,
    [balanceRows],
  );
  const balanceMissingPoints = balanceRows.length - balanceAvailablePoints;
  const balanceHasAccounts = balanceAvailablePoints > 0;
  const balanceCoverageMessage = useMemo(() => {
    if (!balanceHasAccounts) return "";
    if (balanceMissingPoints > 0) {
      const reconstruction = reconstructedBalancePoints > 0
        ? ` ${reconstructedBalancePoints} de ${balanceAvailablePoints} puntos disponibles incluyen al menos una cuenta sin saldo bancario explícito y usan la reconstrucción canónica desde saldo inicial + movimientos.`
        : " Los puntos disponibles usan la serie bancaria canónica.";
      return `Cobertura parcial: ${balanceAvailablePoints} de ${balanceRows.length} puntos tienen saldo disponible. Los ${balanceMissingPoints} restantes aparecen como «Sin dato», no como 0 €.${reconstruction} No se reconstruye desde Cash Flow.`;
    }
    if (reconstructedBalancePoints > 0) {
      return `Cobertura mixta: ${reconstructedBalancePoints} de ${balanceRows.length} puntos incluyen al menos una cuenta sin saldo bancario explícito y usan la reconstrucción canónica desde saldo inicial + movimientos. No se reconstruye desde Cash Flow.`;
    }
    return `Cobertura: ${balanceRows.length} de ${balanceRows.length} puntos usan saldos bancarios explícitos. No se reconstruye desde Cash Flow.`;
  }, [balanceAvailablePoints, balanceHasAccounts, balanceMissingPoints, balanceRows.length, reconstructedBalancePoints]);

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
            valuesVisible={valuesVisible}
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
            valuesVisible={valuesVisible}
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
      {mode === "balance" && !balanceLoading && !balanceError && !balanceHasAccounts ? (
        <p className={styles.empty} role="status">No hay saldos bancarios disponibles para este periodo.</p>
      ) : null}
      {mode === "balance" && !balanceLoading && !balanceError && balanceHasAccounts ? (
        <>
          <SingleSeriesBars
            rows={balanceRows}
            valueFor={(row) => (row as BalanceRow).balanceCents}
            availableFor={(row) => (row as BalanceRow).accounts > 0}
            label="Saldo bancario agregado por mes"
            valuesVisible={valuesVisible}
            formatMoney={formatMoney}
            formatMonth={formatMonth}
          />
          <p className={styles.helper}>{balanceCoverageMessage}</p>
        </>
      ) : null}
    </div>
  );
}
