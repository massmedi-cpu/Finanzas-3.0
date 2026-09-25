"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { isComparisonSnapshot } from "../../src/application/comparison/comparison-contract";
import type {
  ComparisonDriver,
  ComparisonMoneyMetric,
  ComparisonSnapshot,
} from "../../src/application/comparison/comparison-engine";
import {
  comparisonSelectionSearchParams,
  madridToday,
  resolveComparisonSelection,
  type ComparisonSelectionInput,
  type ResolvedComparisonSelection,
} from "../../src/application/comparison/comparison-selection";
import AnalysisSourceFreshness from "../analysis/analysis-source-freshness";
import ComparisonLoadingFrame from "./comparison-loading-frame";
import styles from "./compare.module.css";

type ComparisonForm = {
  primaryFrom: string;
  primaryTo: string;
  referenceFrom: string;
  referenceTo: string;
  accountId: string;
};

const moneyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

const percentFormatter = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function formFromSelection(selection: ResolvedComparisonSelection): ComparisonForm {
  return {
    primaryFrom: selection.primaryFrom,
    primaryTo: selection.primaryTo,
    referenceFrom: selection.referenceFrom,
    referenceTo: selection.referenceTo,
    accountId: selection.accountId ?? "",
  };
}

function formatMoney(cents: number) {
  return moneyFormatter.format(cents / 100);
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

function formatPeriod(dateFrom: string, dateTo: string) {
  return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;
}

function formatPercent(bps: number | null, signed = false) {
  if (bps === null) return "Sin base comparable";
  const sign = signed && bps > 0 ? "+" : "";
  return `${sign}${percentFormatter.format(bps / 100)} %`;
}

function formatPointDelta(bps: number | null) {
  if (bps === null) return "Sin base comparable";
  const sign = bps > 0 ? "+" : bps < 0 ? "−" : "";
  return `${sign}${percentFormatter.format(Math.abs(bps) / 100)} pp`;
}

function signedMoney(cents: number) {
  if (cents === 0) return "Sin cambio";
  return `${cents > 0 ? "+" : "−"}${formatMoney(Math.abs(cents))}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInclusive(dateFrom: string, dateTo: string) {
  const from = new Date(`${dateFrom}T00:00:00Z`).getTime();
  const to = new Date(`${dateTo}T00:00:00Z`).getTime();
  return Math.floor((to - from) / 86_400_000) + 1;
}

function responseErrorCode(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const code = (payload as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
  }
  return `comparison_http_${status}`;
}

function userError(code: string) {
  if (code === "invalid_comparison_overlap") return "La referencia debe terminar antes de que empiece el periodo principal.";
  if (code === "invalid_comparison_period_order") return "La fecha inicial de cada periodo debe ser anterior o igual a su fecha final.";
  if (code === "invalid_comparison_future_date") return "Los periodos solo pueden incluir movimientos ya registrados, no fechas futuras.";
  if (code === "comparison_period_too_large") return "Cada periodo puede abarcar como máximo 366 días.";
  if (code === "invalid_comparison_date" || code === "invalid_comparison_periods") return "Completa las cuatro fechas con periodos válidos.";
  if (code === "comparison_reconciliation_failed") return "Los totales no han reconciliado con sus categorías. No mostramos una comparación dudosa.";
  return "No se ha podido actualizar el comparador. Tus datos no se han modificado; puedes intentarlo de nuevo.";
}

async function requestComparison(input: ComparisonSelectionInput, signal: AbortSignal) {
  const resolved = resolveComparisonSelection(input);
  const response = await fetch(`/api/compare?${comparisonSelectionSearchParams(resolved).toString()}`, {
    cache: "no-store",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(responseErrorCode(payload, response.status));
  if (!isComparisonSnapshot(payload)) throw new Error("comparison_contract_invalid");
  return payload;
}

function metricTone(deltaCents: number, positiveIsGood: boolean) {
  if (deltaCents === 0) return styles.neutral;
  return (deltaCents > 0) === positiveIsGood ? styles.good : styles.bad;
}

function MetricCard({
  label,
  metric,
  positiveIsGood,
  footer,
}: {
  label: string;
  metric: ComparisonMoneyMetric;
  positiveIsGood: boolean;
  footer?: ReactNode;
}) {
  const tone = metricTone(metric.deltaCents, positiveIsGood);
  return (
    <article className={styles.metricCard}>
      <div className={styles.metricTop}>
        <span>{label}</span>
        <strong className={tone}>{signedMoney(metric.deltaCents)}</strong>
      </div>
      <strong className={styles.metricValue}>{formatMoney(metric.primaryCents)}</strong>
      <span className={styles.metricReference}>Referencia {formatMoney(metric.referenceCents)}</span>
      <div className={styles.metricDetails}>
        <span>{formatPercent(metric.changeBps, true)} total</span>
        <span>{formatMoney(metric.primaryDailyCents)}/día · {signedMoney(metric.dailyDeltaCents)}</span>
      </div>
      {footer ? <div className={styles.metricFooter}>{footer}</div> : null}
    </article>
  );
}

function DriverValue({ href, cents, label }: { href: string | null; cents: number; label: string }) {
  if (!href) return <span>{formatMoney(cents)}</span>;
  return <Link prefetch={false} href={href} aria-label={`${label}: ${formatMoney(cents)}. Abrir movimientos`}>{formatMoney(cents)}</Link>;
}

function DriverPanel({
  title,
  description,
  drivers,
  kind,
}: {
  title: string;
  description: string;
  drivers: ComparisonDriver[];
  kind: "categorías" | "comercios";
}) {
  const visible = drivers.slice(0, 8);
  let maximum = 0;
  for (const item of visible) maximum = Math.max(maximum, item.primaryExpenseCents, item.referenceExpenseCents);

  return (
    <section className={styles.driverPanel} aria-labelledby={`comparison-${kind}`}>
      <div className={styles.panelHeading}>
        <div>
          <p>CAUSAS DEL CAMBIO</p>
          <h2 id={`comparison-${kind}`}>{title}</h2>
          <span>{description}</span>
        </div>
        <span className={styles.countChip}>{visible.length} de {drivers.length}</span>
      </div>

      {visible.length === 0 ? (
        <div className={styles.emptyPanel}>
          <strong>Sin gasto que desglosar</strong>
          <span>Estos periodos no contienen {kind} con gasto incluido.</span>
        </div>
      ) : (
        <div className={styles.tableScroller}>
          <table className={styles.driverTable}>
            <caption className={styles.srOnly}>{title}: comparación entre periodo principal y referencia</caption>
            <thead>
              <tr>
                <th scope="col">{kind === "categorías" ? "Categoría" : "Comercio"}</th>
                <th scope="col">Principal</th>
                <th scope="col">Referencia</th>
                <th scope="col">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const barWidth = maximum > 0
                  ? Math.max(2, Math.round((Math.max(item.primaryExpenseCents, item.referenceExpenseCents) / maximum) * 100))
                  : 0;
                return (
                  <tr key={`${kind}-${item.id ?? "unassigned"}`}>
                    <th scope="row">
                      <strong>{item.name}</strong>
                      <span>{item.primaryRows.toLocaleString("es-ES")} vs {item.referenceRows.toLocaleString("es-ES")} mov.</span>
                      <i className={styles.driverBar} aria-hidden="true"><i style={{ width: `${barWidth}%` }} /></i>
                    </th>
                    <td><DriverValue href={item.primaryHref} cents={item.primaryExpenseCents} label={`${item.name}, periodo principal`} /></td>
                    <td><DriverValue href={item.referenceHref} cents={item.referenceExpenseCents} label={`${item.name}, referencia`} /></td>
                    <td>
                      <strong className={metricTone(item.deltaCents, false)}>{signedMoney(item.deltaCents)}</strong>
                      <span>{formatPercent(item.changeBps, true)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function comparisonInsight(snapshot: ComparisonSnapshot) {
  const expense = snapshot.metrics.expense;
  if (
    snapshot.primary.incomeCents === 0
    && snapshot.primary.expenseCents === 0
    && snapshot.reference.incomeCents === 0
    && snapshot.reference.expenseCents === 0
  ) {
    return "No hay actividad financiera incluida en ninguno de los dos periodos.";
  }
  if (expense.dailyDeltaCents === 0) {
    return `El gasto diario se mantiene en ${formatMoney(expense.primaryDailyCents)}.`;
  }
  if (expense.referenceDailyCents === 0) {
    return `El periodo principal registra ${formatMoney(expense.primaryDailyCents)} de gasto diario, sin base de gasto en la referencia.`;
  }
  const normalizedChange = Math.round((expense.dailyDeltaCents / Math.abs(expense.referenceDailyCents)) * 10_000);
  return `El gasto diario ${expense.dailyDeltaCents > 0 ? "sube" : "baja"} ${formatPercent(Math.abs(normalizedChange))}, hasta ${formatMoney(expense.primaryDailyCents)} al día.`;
}

export default function ComparisonClient({
  initialSnapshot,
  fallbackSelection,
}: {
  initialSnapshot: ComparisonSnapshot | null;
  fallbackSelection: ResolvedComparisonSelection;
}) {
  const [snapshot, setSnapshot] = useState<ComparisonSnapshot | null>(initialSnapshot);
  const [form, setForm] = useState<ComparisonForm>(() => formFromSelection(initialSnapshot?.selection ?? fallbackSelection));
  const [resolved, setResolved] = useState(Boolean(initialSnapshot));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    if (initialSnapshot) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    void requestComparison(fallbackSelection, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setSnapshot(next);
          setForm(formFromSelection(next.selection));
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          const code = cause instanceof Error ? cause.message : "comparison_unavailable";
          setError(userError(code));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolved(true);
      });
    return () => controller.abort();
  }, [
    initialSnapshot,
    fallbackSelection.primaryFrom,
    fallbackSelection.primaryTo,
    fallbackSelection.referenceFrom,
    fallbackSelection.referenceTo,
    fallbackSelection.accountId,
  ]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  if (!resolved) {
    return <ComparisonLoadingFrame message="Recuperando los dos periodos y reconciliando sus totales…" />;
  }

  const dirty = !snapshot
    || form.primaryFrom !== snapshot.selection.primaryFrom
    || form.primaryTo !== snapshot.selection.primaryTo
    || form.referenceFrom !== snapshot.selection.referenceFrom
    || form.referenceTo !== snapshot.selection.referenceTo
    || form.accountId !== (snapshot.selection.accountId ?? "");

  function updateField(field: keyof ComparisonForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function previousEquivalentPeriod() {
    try {
      const length = daysInclusive(form.primaryFrom, form.primaryTo);
      if (!Number.isSafeInteger(length) || length < 1 || length > 366) throw new Error("invalid_comparison_period_order");
      const referenceTo = addDays(form.primaryFrom, -1);
      const referenceFrom = addDays(referenceTo, -(length - 1));
      setForm((current) => ({ ...current, referenceFrom, referenceTo }));
      setError(null);
    } catch (cause) {
      setError(userError(cause instanceof Error ? cause.message : "invalid_comparison_date"));
    }
  }

  function resetToMonthComparison() {
    const selection = resolveComparisonSelection({}, madridToday());
    setForm(formFromSelection(selection));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !dirty) return;
    let selection: ResolvedComparisonSelection;
    try {
      selection = resolveComparisonSelection(form);
    } catch (cause) {
      setError(userError(cause instanceof Error ? cause.message : "invalid_comparison_date"));
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setPending(true);
    setError(null);

    try {
      const next = await requestComparison(selection, controller.signal);
      if (controller.signal.aborted || requestSequence.current !== sequence) return;
      setSnapshot(next);
      setForm(formFromSelection(next.selection));
      window.history.replaceState(window.history.state, "", `/compare?${comparisonSelectionSearchParams(next.selection).toString()}`);
    } catch (cause) {
      if (controller.signal.aborted || requestSequence.current !== sequence) return;
      const code = cause instanceof Error ? cause.message : "comparison_unavailable";
      setError(userError(code));
    } finally {
      if (requestSequence.current === sequence) setPending(false);
    }
  }

  return (
    <>
      <AnalysisSourceFreshness />
      <main className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>FINANCIAL APP · DECISIÓN CON DATOS</p>
            <div className={styles.titleRow}>
              <h1>Comparador</h1>
              <span className={styles.readOnlyChip}>Solo lectura</span>
            </div>
            <p className={styles.headerCopy}>Contrasta dos periodos reales, normaliza su duración y abre cada causa hasta sus movimientos.</p>
          </div>
          {snapshot ? (
            <div className={styles.periodLegend} aria-label="Leyenda de periodos">
              <span><i className={styles.primaryDot} />Principal <strong>{snapshot.selection.primaryDays} días</strong></span>
              <span><i className={styles.referenceDot} />Referencia <strong>{snapshot.selection.referenceDays} días</strong></span>
            </div>
          ) : null}
        </header>

        <form className={styles.filters} onSubmit={submit} aria-label="Periodos de comparación">
          <div className={styles.filterHeading}>
            <div>
              <strong>Periodos personalizados</strong>
              <span>La referencia debe ser anterior y no solaparse con el periodo principal.</span>
            </div>
            <div className={styles.quickActions}>
              <button type="button" disabled={pending} onClick={previousEquivalentPeriod}>Referencia equivalente</button>
              <button type="button" disabled={pending} onClick={resetToMonthComparison}>Mes actual vs anterior</button>
            </div>
          </div>
          <fieldset className={styles.periodFieldset} disabled={pending}>
            <legend>Periodo principal</legend>
            <label>Desde<input type="date" required max={fallbackSelection.today} value={form.primaryFrom} onChange={(event) => updateField("primaryFrom", event.target.value)} /></label>
            <label>Hasta<input type="date" required max={fallbackSelection.today} value={form.primaryTo} onChange={(event) => updateField("primaryTo", event.target.value)} /></label>
          </fieldset>
          <fieldset className={styles.periodFieldset} disabled={pending}>
            <legend>Periodo de referencia</legend>
            <label>Desde<input type="date" required max={fallbackSelection.today} value={form.referenceFrom} onChange={(event) => updateField("referenceFrom", event.target.value)} /></label>
            <label>Hasta<input type="date" required max={fallbackSelection.today} value={form.referenceTo} onChange={(event) => updateField("referenceTo", event.target.value)} /></label>
          </fieldset>
          <label className={styles.accountField}>Cuenta
            <select disabled={pending} value={form.accountId} onChange={(event) => updateField("accountId", event.target.value)}>
              <option value="">Todas las cuentas</option>
              {form.accountId && !(snapshot?.accounts ?? []).some((account) => account.id === form.accountId)
                ? <option value={form.accountId}>Cuenta seleccionada</option>
                : null}
              {(snapshot?.accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>{account.name}{account.lifecycle === "archived" ? " · archivada" : ""}</option>
              ))}
            </select>
          </label>
          <button className={styles.applyButton} type="submit" disabled={pending || !dirty}>
            {pending ? "Comparando…" : dirty ? "Comparar periodos" : "Comparación aplicada"}
          </button>
        </form>

        <div className={styles.liveRegion} aria-live="polite" aria-atomic="true">
          {pending ? <p className={styles.refreshing} role="status">Recalculando totales y causas…</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>

        {snapshot ? (
          <>
            <section className={styles.insight} aria-labelledby="comparison-insight-title">
              <div>
                <p>LECTURA PRINCIPAL</p>
                <h2 id="comparison-insight-title">{comparisonInsight(snapshot)}</h2>
                <span>Comparamos importes totales y ritmo diario para no confundir periodos de distinta duración.</span>
              </div>
              <div className={styles.periodLinks}>
                <Link prefetch={false} href={snapshot.links.primaryTransactions}>Ver principal · {formatPeriod(snapshot.selection.primaryFrom, snapshot.selection.primaryTo)}</Link>
                <Link prefetch={false} href={snapshot.links.referenceTransactions}>Ver referencia · {formatPeriod(snapshot.selection.referenceFrom, snapshot.selection.referenceTo)}</Link>
              </div>
            </section>

            <section className={styles.metrics} aria-label="Resumen comparativo">
              <MetricCard label="Ingresos" metric={snapshot.metrics.income} positiveIsGood />
              <MetricCard label="Gasto" metric={snapshot.metrics.expense} positiveIsGood={false} />
              <MetricCard label="Neto operativo" metric={snapshot.metrics.operatingNet} positiveIsGood />
              <MetricCard
                label="Ahorro"
                metric={snapshot.metrics.savings}
                positiveIsGood
                footer={<span>Tasa {formatPercent(snapshot.savingsRate.primaryBps)} · {formatPointDelta(snapshot.savingsRate.deltaBps)}</span>}
              />
            </section>

            <div className={styles.driversGrid}>
              <DriverPanel
                title="Qué categorías explican la diferencia"
                description="Ordenadas por el cambio absoluto entre ambos periodos."
                drivers={snapshot.categoryDrivers}
                kind="categorías"
              />
              <DriverPanel
                title="Qué comercios explican la diferencia"
                description="Cada importe enlaza con los movimientos que lo componen."
                drivers={snapshot.merchantDrivers}
                kind="comercios"
              />
            </div>

            <footer className={styles.quality}>
              <div>
                <strong>Totales reconciliados</strong>
                <span>Categorías = gasto en ambos periodos · cálculo determinista · sin IA generativa</span>
              </div>
              <div>
                <span>Principal: {snapshot.quality.primaryIncludedRows.toLocaleString("es-ES")} incl. · {snapshot.quality.primaryExcludedRows.toLocaleString("es-ES")} excl.</span>
                <span>Referencia: {snapshot.quality.referenceIncludedRows.toLocaleString("es-ES")} incl. · {snapshot.quality.referenceExcludedRows.toLocaleString("es-ES")} excl.</span>
              </div>
            </footer>
          </>
        ) : (
          <section className={styles.unavailable}>
            <strong>El comparador no está disponible ahora mismo</strong>
            <p>Puedes ajustar los periodos y volver a intentarlo. Esta pantalla nunca modifica movimientos ni categorías.</p>
          </section>
        )}
      </main>
    </>
  );
}
