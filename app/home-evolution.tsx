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

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isBalanceSeries(value: unknown, dateFrom: string, dateTo: string): value is BalanceSeries {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<BalanceSeries>;
  const principles = candidate.principles;
  const months = new Set<string>();
  return candidate.dateFrom === dateFrom && candidate.dateTo === dateTo
    && candidate.accountId === null
    && Array.isArray(candidate.rows)
    && principles?.bankSource === "read_only"
    && principles?.balanceSource === "financial_account_balances"
    && principles?.cashFlowReconstruction === false
    && principles?.getHasSideEffects === false
    && candidate.rows.every((row, index, rows) => {
      if (!row || typeof row !== "object"
        || !isCalendarDate(row.monthStart) || !row.monthStart.endsWith("-01")
        || !isCalendarDate(row.asOfDate)
        || row.monthStart < `${dateFrom.slice(0, 7)}-01` || row.monthStart > dateTo
        || row.asOfDate < row.monthStart || row.asOfDate > dateTo
        || row.asOfDate.slice(0, 7) !== row.monthStart.slice(0, 7)
        || months.has(row.monthStart)
        || (index > 0 && rows[index - 1].monthStart >= row.monthStart)
        || !Number.isSafeInteger(row.balanceCents)
        || !Number.isSafeInteger(row.accounts) || row.accounts < 0
        || !Number.isSafeInteger(row.explicitBalanceAccounts) || row.explicitBalanceAccounts < 0
        || !Number.isSafeInteger(row.reconstructedBalanceAccounts) || row.reconstructedBalanceAccounts < 0
        || row.explicitBalanceAccounts + row.reconstructedBalanceAccounts !== row.accounts) return false;
      months.add(row.monthStart);
      return true;
    });
}

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
        const visualSigned = signed && valuesVisible;
        const renderedSigned = available && visualSigned;
        const renderedHeight = valuesVisible ? (renderedSigned ? height / 2 : height) : 36;
        const sign = renderedSigned ? (value < 0 ? "negative" : value > 0 ? "positive" : "zero") : undefined;
        return (
          <div className={styles.evolutionSingleColumn} key={row.monthStart}>
            <div className={`${styles.evolutionBarArea}${renderedSigned ? ` ${styles.evolutionSignedArea}` : ""}`} aria-hidden="true">
              {available ? (
                <>
                  {renderedSigned ? <span className={styles.evolutionZeroLine} data-zero-line="true" /> : null}
                  <span
                    className={`${styles.evolutionSingleBar} ${renderedSigned ? styles.evolutionSignedBar : ""} ${renderedSigned && value < 0 ? styles.evolutionNegativeBar : ""}`}
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
  const [balanceSlowLoading, setBalanceSlowLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<"not_installed" | "unavailable" | "timeout" | null>(null);
  const [balanceRetry, setBalanceRetry] = useState(0);
  const balanceKey = `${dateFrom}|${dateTo}|${refreshKey}`;
  const balances = balanceCache?.key === balanceKey ? balanceCache.data : null;

  useEffect(() => {
    if (mode !== "balance" || balanceCache?.key === balanceKey) return;
    const controller = new AbortController();
    setBalanceLoading(true);
    setBalanceSlowLoading(false);
    setBalanceError(null);
    const slowTimer = window.setTimeout(() => {
      if (!controller.signal.aborted) setBalanceSlowLoading(true);
    }, 15_000);
    const deadlineTimer = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      controller.abort();
      setBalanceLoading(false);
      setBalanceSlowLoading(false);
      setBalanceError("timeout");
    }, 30_000);
    const params = new URLSearchParams({ mode: "balance_series", dateFrom, dateTo });
    void fetch(`/api/financial?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const code = body && typeof body === "object" && "code" in body
            ? (body as { code?: unknown }).code
            : null;
          throw new Error(code === "financial_balance_series_not_installed"
            ? "financial_balance_series_not_installed"
            : "balance_series_unavailable");
        }
        return body;
      })
      .then((payload) => {
        if (!isBalanceSeries(payload, dateFrom, dateTo)) throw new Error("balance_series_invalid_contract");
        if (!controller.signal.aborted) setBalanceCache({ key: balanceKey, data: payload });
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError") && !controller.signal.aborted) {
          setBalanceError(error instanceof Error && error.message === "financial_balance_series_not_installed"
            ? "not_installed"
            : "unavailable");
        }
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
        window.clearTimeout(deadlineTimer);
        if (!controller.signal.aborted) {
          setBalanceLoading(false);
          setBalanceSlowLoading(false);
        }
      });
    return () => {
      controller.abort();
      window.clearTimeout(slowTimer);
      window.clearTimeout(deadlineTimer);
    };
  }, [balanceCache?.key, balanceKey, balanceRetry, dateFrom, dateTo, mode]);

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
  const balanceHasNegative = useMemo(
    () => balanceRows.some((row) => row.accounts > 0 && row.balanceCents < 0),
    [balanceRows],
  );
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

      {mode === "balance" && balanceLoading ? (
        <>
          <div className={styles.skeleton} aria-label="Cargando evolución del saldo" />
          {balanceSlowLoading ? <p className={styles.helper} role="status">La lectura del saldo está tardando más de lo habitual. Las otras vistas siguen disponibles.</p> : null}
        </>
      ) : null}
      {mode === "balance" && balanceError ? (
        <div className={styles.empty} role="status">
          <p>{balanceError === "not_installed"
            ? "La evolución del saldo está pendiente de habilitarse en el motor financiero de este entorno. Las otras vistas siguen disponibles; no se han modificado datos bancarios."
            : balanceError === "timeout"
              ? "La lectura de la evolución del saldo ha superado 30 segundos. Puedes reintentar esta lectura; las otras vistas siguen disponibles y no se han modificado datos bancarios."
              : "No se ha podido cargar la evolución del saldo. Las otras vistas siguen disponibles; no se han modificado datos bancarios."}</p>
          <button type="button" className={styles.evolutionRetryButton} onClick={() => setBalanceRetry((current) => current + 1)}>
            Reintentar saldo
          </button>
        </div>
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
            signed={balanceHasNegative}
            formatMoney={formatMoney}
            formatMonth={formatMonth}
          />
          <p className={styles.helper}>{balanceCoverageMessage}</p>
        </>
      ) : null}
    </div>
  );
}
