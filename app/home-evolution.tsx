"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { periodHasObservedData } from "../src/application/data-coverage";
import { homeBalancePlotRows, isHomeBalanceSeries as isBalanceSeries, type HomeBalanceRow as BalanceRow, type HomeBalanceSeries as BalanceSeries, type HomeBalancePlotRow as BalancePlotRow } from "../src/application/dashboard/home-balance-series";
import { resolveHomeBankCoverage, type HomeBankFreshness } from "../src/application/dashboard/home-bank-coverage";
import { FinancialBarChart, monthlyTransactionsHref, type FinancialBarPoint } from "../src/design/financial-bar-chart";
import styles from "./inicio-overview.module.css";

type EvolutionMode = "balance" | "income_expense" | "net";

function SingleSeriesBars({
  rows,
  valueFor,
  label,
  valuesVisible,
  formatMoney,
  formatMonth,
  signed = false,
  availableFor,
  drilldown = false,
}: {
  rows: Array<FinancialBarPoint | BalancePlotRow>;
  valueFor: (row: FinancialBarPoint | BalancePlotRow) => number;
  label: string;
  valuesVisible: boolean;
  formatMoney: (value: number) => string;
  formatMonth: (date: string) => string;
  signed?: boolean;
  availableFor?: (row: FinancialBarPoint | BalancePlotRow) => boolean;
  drilldown?: boolean;
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
            <strong>{available ? valuesVisible ? formatMoney(value) : "••••" : "Sin dato"}</strong>
            {drilldown && available ? <Link prefetch={false} href={monthlyTransactionsHref(row.monthStart)} aria-label={`Ver movimientos de ${formatMonth(row.monthStart)}`}>{formatMonth(row.monthStart)}</Link> : <span>{formatMonth(row.monthStart)}</span>}
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
  valuesVisible,
  formatMoney,
  formatMonth,
  partialMonthStart,
  refreshKey,
  latestMovementDate,
  sourceFreshness,
  activityLatestDate,
}: {
  rows: FinancialBarPoint[];
  dateFrom: string;
  dateTo: string;
  valuesVisible: boolean;
  formatMoney: (value: number) => string;
  formatMonth: (date: string) => string;
  partialMonthStart?: string | null;
  refreshKey: number;
  latestMovementDate: string | null;
  sourceFreshness: HomeBankFreshness | null;
  activityLatestDate: string | null;
}) {
  const coveredRows = useMemo(() => rows.map((row) => {
    const monthEnd = new Date(`${row.monthStart}T12:00:00Z`);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
    const coverage = resolveHomeBankCoverage({
      dateFrom: row.monthStart,
      dateTo: monthEnd.toISOString().slice(0, 10) < dateTo ? monthEnd.toISOString().slice(0, 10) : dateTo,
      freshness: sourceFreshness,
      activityLatestDate,
    });
    // A non-zero monthly financial aggregate proves that amounts were imported
    // for this month even when the legacy freshness endpoint only exposes an
    // upper date bound. It DOES NOT prove that the month is complete.
    // Conversely, an all-zero row is never evidence of an observed zero.
    const hasRecordedAmount = row.incomeCents !== 0 || row.expenseCents !== 0 || row.operatingNetCents !== 0;
    // A real non-zero monthly aggregate may justify PARTIAL observation only
    // when the bank itself is available. A retained figure from an unavailable
    // bank must not become a trustworthy bar merely because it is non-zero.
    const sourceMatchesActivity = !activityLatestDate
      || activityLatestDate === sourceFreshness?.latestMovementDate;
    // A nonzero total is never grounds for displaying a partial month when
    // independent banking sources disagree on the latest observed date.
    // That is a provenance conflict, not a recoverable historic gap.
    return { ...row, coverage: coverage.state === "unknown"
      && sourceFreshness?.available === true && sourceMatchesActivity && hasRecordedAmount
      ? "partial" as const : coverage.state };
  }), [dateTo, activityLatestDate, rows, sourceFreshness]);
  // Scale only from observable bars. Values from an unobserved month must not
  // compress every real month into an unreadable strip.
  const hasObservedScale = coveredRows.some((row) => periodHasObservedData({
    state: row.coverage, latestMovementDate, throughDate: latestMovementDate,
  }));
  const observedScale = useMemo(() => {
    const observed = coveredRows.filter((row) => row.coverage === "covered" || row.coverage === "partial");
    // No raw unverified monthly amount may influence chart range or labels.
    return observed.length > 0
      ? Math.max(1, ...observed.flatMap((row) => [Math.abs(row.incomeCents), Math.abs(row.expenseCents)]))
      : 1;
  }, [coveredRows]);
  const [mode, setMode] = useState<EvolutionMode>("income_expense");
  const [balanceCache, setBalanceCache] = useState<{ key: string; data: BalanceSeries } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceSlowLoading, setBalanceSlowLoading] = useState(false);
  const [balanceErrorState, setBalanceError] = useState<{ key: string; reason: "not_installed" | "unavailable" | "timeout" } | null>(null);
  const [balanceRetry, setBalanceRetry] = useState(0);
  // Scope both cache and errors to the exact period and retry generation.
  const balanceKey = `${dateFrom}|${dateTo}|${refreshKey}|${balanceRetry}`;
  const balanceError = balanceErrorState?.key === balanceKey ? balanceErrorState.reason : null;
  const balances = balanceCache?.key === balanceKey ? balanceCache.data : null;
  // The initial frame of a newly selected or refreshed Balance tab is
  // pending, not a verified empty account history. The fetch starts in an
  // effect after paint; do not flash a false "no balances" verdict.
  const balanceAwaitingFirstRead = mode === "balance" && balances === null && balanceError === null;

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
      setBalanceError({ key: balanceKey, reason: "timeout" });
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
          setBalanceError({ key: balanceKey, reason: error instanceof Error
            && error.message === "financial_balance_series_not_installed"
            ? "not_installed" : "unavailable" });
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

  const balanceRows = useMemo(() => balances ? homeBalancePlotRows(balances) : [], [balances]);
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
    () => balanceRows.some((row) => row.balanceCents !== null && row.accounts > 0 && row.balanceCents < 0),
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

      {sourceFreshness?.available === false && mode !== "balance" ? (
        <p className={styles.helper} role="status">La fuente bancaria no está disponible. No se pueden verificar los importes de la evolución; revisa la fuente antes de interpretarlos.</p>
      ) : null}
      {mode === "income_expense" ? (
        <>
          <FinancialBarChart
            rows={coveredRows}
            maxValue={observedScale}
            hasObservedScale={hasObservedScale}
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
            rows={coveredRows}
            availableFor={(row) => periodHasObservedData({ state: (row as FinancialBarPoint).coverage ?? "unknown", latestMovementDate, throughDate: latestMovementDate })}
            valueFor={(row) => (row as FinancialBarPoint).operatingNetCents}
            label="Flujo neto por mes"
            valuesVisible={valuesVisible}
            formatMoney={formatMoney}
            formatMonth={formatMonth}
            signed
            drilldown
          />
          <p className={styles.helper}>Flujo neto = ingresos menos gastos elegibles del mismo motor financiero; las transferencias internas no se cuentan como gasto o ingreso operativo.</p>
        </>
      ) : null}

      {mode === "balance" && (balanceLoading || balanceAwaitingFirstRead) ? (
        <>
          <div className={styles.skeleton} role="status" aria-label="Cargando evolución del saldo" />
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
      {mode === "balance" && balances !== null && !balanceLoading && !balanceError && !balanceHasAccounts ? (
        <p className={styles.empty} role="status">No hay saldos bancarios disponibles para este periodo.</p>
      ) : null}
      {mode === "balance" && !balanceLoading && !balanceError && balanceHasAccounts ? (
        <>
          <SingleSeriesBars
            rows={balanceRows}
            valueFor={(row) => (row as BalancePlotRow).balanceCents ?? 0}
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
