"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  AnalysisDriver,
  AnalysisMerchantDriver,
  AnalysisRange,
  AnalysisSnapshot,
  AnalysisTrend,
} from "../../src/application/analysis/analysis-engine";
import { isAnalysisSnapshot } from "../../src/application/analysis/analysis-contract";
import { resolveSavingsRatePresentation } from "../../src/application/analysis/analysis-presentation";
import { ContributionChart } from "../../src/design/contribution-chart";
import { FinancialTrendChart } from "../../src/design/financial-trend-chart";
import styles from "./analysis.module.css";

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

const longMonthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const shortMonthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  timeZone: "Europe/Madrid",
});

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const RANGE_OPTIONS: Array<{ value: AnalysisRange; label: string }> = [
  { value: "1m", label: "1 mes" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "12m", label: "12 meses" },
  { value: "ytd", label: "Año actual" },
];

function currentMadridMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function formatMoney(cents: number) {
  return moneyFormatter.format(cents / 100);
}

function formatPercentBps(bps: number | null, signed = false) {
  if (bps === null) return "—";
  const sign = signed && bps > 0 ? "+" : "";
  return `${sign}${percentFormatter.format(bps / 100)} %`;
}

function formatPointDeltaBps(bps: number | null) {
  if (bps === null) return "—";
  const sign = bps > 0 ? "+" : bps < 0 ? "−" : "";
  return `${sign}${percentFormatter.format(Math.abs(bps) / 100)} pp`;
}

function monthDate(monthStart: string) {
  return new Date(`${monthStart.slice(0, 7)}-01T12:00:00Z`);
}

function formatLongMonth(monthStart: string) {
  return longMonthFormatter.format(monthDate(monthStart));
}

function formatShortMonth(monthStart: string) {
  return shortMonthFormatter.format(monthDate(monthStart)).replace(".", "");
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00Z`));
}

function monthEnd(monthStart: string) {
  const [year, month] = monthStart.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function rangeLabel(snapshot: AnalysisSnapshot) {
  if (snapshot.selection.range === "1m") {
    return formatLongMonth(`${snapshot.selection.month}-01`);
  }
  return `${formatDate(snapshot.selection.dateFrom)} – ${formatDate(snapshot.selection.dateTo)}`;
}

function comparisonLabel(snapshot: AnalysisSnapshot) {
  return `${formatDate(snapshot.selection.previousDateFrom)} – ${formatDate(snapshot.selection.previousDateTo)}`;
}

function trendLabel(trend: AnalysisTrend, kind: "income" | "expense" | "net" | "rate") {
  if (trend.direction === "insufficient") return "Aún no hay 6 meses completos para confirmar tendencia";
  if (trend.direction === "stable") return "Comportamiento estable en los últimos 6 meses";
  const up = trend.direction === "up";
  const noun = kind === "income" ? "ingresos" : kind === "expense" ? "gasto" : kind === "rate" ? "tasa de ahorro" : "neto";
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${up ? "al alza" : "a la baja"} frente al trimestre previo`;
}

function deltaText(cents: number) {
  if (cents === 0) return "Sin cambio";
  return `${cents > 0 ? "+" : "−"}${formatMoney(Math.abs(cents))}`;
}

function periodHref(snapshot: AnalysisSnapshot) {
  const params = new URLSearchParams({
    dateFrom: snapshot.selection.dateFrom,
    dateTo: snapshot.selection.dateTo,
  });
  if (snapshot.selection.accountId) params.set("accountId", snapshot.selection.accountId);
  return `/transactions?${params.toString()}`;
}

function monthHref(snapshot: AnalysisSnapshot, monthStart: string) {
  const currentPartial = snapshot.selection.partialMonthStart === monthStart;
  const params = new URLSearchParams({
    dateFrom: monthStart,
    dateTo: currentPartial ? snapshot.selection.dateTo : monthEnd(monthStart),
  });
  if (snapshot.selection.accountId) params.set("accountId", snapshot.selection.accountId);
  return `/transactions?${params.toString()}`;
}

function historicalMetric(snapshot: AnalysisSnapshot, metric: "incomeCents" | "expenseCents" | "savingsCents" | "savingsRateBps") {
  const value = (months: 3 | 6) => {
    const average = months === 3 ? snapshot.averages.last3Months : snapshot.averages.last6Months;
    if (!average) return null;
    const raw = average[metric];
    return metric === "savingsRateBps" ? formatPercentBps(raw) : formatMoney(raw ?? 0);
  };
  const parts: string[] = [];
  const three = value(3);
  const six = value(6);
  if (three) parts.push(`3 m ${three}`);
  if (six) parts.push(`6 m ${six}`);
  return parts;
}

function HistoricalReference({ snapshot, metric }: {
  snapshot: AnalysisSnapshot;
  metric: "incomeCents" | "expenseCents" | "savingsCents" | "savingsRateBps";
}) {
  const parts = historicalMetric(snapshot, metric);
  if (parts.length === 0) return <span>Histórico insuficiente</span>;
  return <span>Media mensual · {parts.join(" · ")}</span>;
}

function Kpi({
  label,
  value,
  comparison,
  trend,
  historical,
  tone,
}: {
  label: string;
  value: string;
  comparison: string;
  trend: AnalysisTrend;
  historical: ReactNode;
  tone: "income" | "expense" | "net" | "rate";
}) {
  return (
    <article className={`${styles.kpi} ${styles[`kpi_${tone}`]}`}>
      <div className={styles.kpiTop}>
        <span>{label}</span>
        <span className={styles.kpiDirection}>{comparison}</span>
      </div>
      <strong>{value}</strong>
      <div className={styles.kpiContext}>
        {historical}
        <span>{trendLabel(trend, tone === "net" ? "net" : tone === "rate" ? "rate" : tone)}</span>
      </div>
    </article>
  );
}

function DriverRanking({
  title,
  items,
  expanded,
  onToggle,
  merchant = false,
}: {
  title: string;
  items: Array<AnalysisDriver | AnalysisMerchantDriver>;
  expanded: boolean;
  onToggle: () => void;
  merchant?: boolean;
}) {
  const visible = expanded ? items.slice(0, 15) : items.slice(0, 5);
  const headingId = `${title.toLocaleLowerCase("es-ES").replaceAll(" ", "-")}-heading`;
  return (
    <section className={styles.ranking} aria-labelledby={headingId}>
      <div className={styles.sectionHeadingCompact}>
        <h3 id={headingId}>{title}</h3>
        <span>{items.length.toLocaleString("es-ES")} grupos</span>
      </div>
      {visible.length === 0 ? (
        <p className={styles.empty}>No hay gastos elegibles en el periodo.</p>
      ) : (
        <ol className={styles.rankingList}>
          {visible.map((item, index) => (
            <li key={`${title}-${item.id ?? "none"}-${item.name}`}>
              <span className={styles.rank}>{index + 1}</span>
              <div className={styles.rankMain}>
                <strong>{item.name}</strong>
                <span>
                  {item.rows.toLocaleString("es-ES")} mov. · {formatPercentBps(item.shareBps)} del gasto
                  {merchant && "habitualVariationBps" in item && item.habitualVariationBps !== null
                    ? ` · ${formatPercentBps(item.habitualVariationBps, true)} vs. importe habitual`
                    : ""}
                </span>
              </div>
              <div className={styles.rankValue}>
                <strong>{formatMoney(item.expenseCents)}</strong>
                <span className={item.deltaCents > 0 ? styles.badDelta : item.deltaCents < 0 ? styles.goodDelta : undefined}>
                  {deltaText(item.deltaCents)}
                </span>
              </div>
              {item.href ? <Link href={item.href} aria-label={`Ver movimientos de ${item.name}`}>Abrir</Link> : <span className={styles.noLink}>—</span>}
            </li>
          ))}
        </ol>
      )}
      {items.length > 5 && (
        <button className={styles.textButton} type="button" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? "Ver menos" : "Ver todos"}
        </button>
      )}
    </section>
  );
}

function QuickRead({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const strongest = snapshot.changeDrivers[0] ?? null;
  const forecast = snapshot.forecast;
  const hasForecastItems = Boolean(forecast && forecast.summary.plannedItems > 0);
  const anomalyCount = snapshot.anomalies.length;
  const anomalyLabel = anomalyCount === 1 ? "movimiento a revisar" : "movimientos a revisar";

  return (
    <section className={styles.quickRead} aria-label="Lectura rápida">
      <div className={styles.quickReadIntro}>
        <span>LECTURA RÁPIDA</span>
        <strong>Lo importante del periodo</strong>
      </div>
      {strongest ? (
        <Link className={styles.quickReadItem} href={strongest.href ?? periodHref(snapshot)}>
          <span>Mayor cambio</span>
          <strong>{strongest.name}</strong>
          <small className={strongest.deltaCents > 0 ? styles.badDelta : styles.goodDelta}>{deltaText(strongest.deltaCents)}</small>
        </Link>
      ) : (
        <div className={styles.quickReadItem}>
          <span>Mayor cambio</span>
          <strong>Sin variaciones</strong>
          <small>frente al periodo comparable</small>
        </div>
      )}
      <Link className={styles.quickReadItem} href="#anomalies-heading">
        <span>Anomalías</span>
        <strong>{anomalyCount.toLocaleString("es-ES")}</strong>
        <small>{anomalyLabel}</small>
      </Link>
      <Link className={styles.quickReadItem} href="/forecast">
        <span>Previsión neta</span>
        <strong>{hasForecastItems && forecast ? formatMoney(forecast.summary.projectedNetCents) : forecast ? "Sin previsiones" : "—"}</strong>
        <small>{hasForecastItems && forecast ? `hasta ${formatDate(forecast.period.dateTo)}` : forecast ? "sin movimientos previstos" : "fuera del periodo"}</small>
      </Link>
      <Link className={styles.quickReadItem} href="#comercios-heading">
        <span>Concentración comercial</span>
        <strong>{formatPercentBps(snapshot.concentration.top3MerchantBps)}</strong>
        <small>del gasto en 3 comercios</small>
      </Link>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className={styles.skeletonWrap} role="status" aria-label="Cargando análisis financiero">
      <div className={styles.skeletonKpis}>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
      <div className={styles.skeletonLarge} />
      <div className={styles.skeletonGrid}><span /><span /></div>
    </div>
  );
}

export default function AnalysisClient({ initialSnapshot }: { initialSnapshot: AnalysisSnapshot | null }) {
  const requestRef = useRef<AbortController | null>(null);
  const initialMonth = initialSnapshot?.selection.month ?? currentMadridMonth();
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(initialSnapshot);
  const [month, setMonth] = useState(initialMonth);
  const [range, setRange] = useState<AnalysisRange>(initialSnapshot?.selection.range ?? "1m");
  const [accountId, setAccountId] = useState(initialSnapshot?.selection.accountId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialSnapshot ? null : "No se pudo preparar el análisis inicial. Puedes reintentarlo con los filtros.");
  const [merchantsExpanded, setMerchantsExpanded] = useState(false);

  const expenseDirection = snapshot?.comparison.expenseDeltaCents ?? 0;
  const savingsRatePresentation = snapshot ? resolveSavingsRatePresentation(snapshot) : null;
  const changeHeadline = useMemo(() => {
    if (!snapshot) return "Qué ha cambiado";
    if (expenseDirection === 0) return "Tu gasto se mantiene igual que en el periodo comparable.";
    return `Tu gasto ${expenseDirection > 0 ? "ha aumentado" : "ha disminuido"} ${formatMoney(Math.abs(expenseDirection))} frente al periodo comparable.`;
  }, [snapshot, expenseDirection]);

  async function refresh(event?: FormEvent) {
    event?.preventDefault();
    if (!month) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ month, range });
    if (accountId) params.set("accountId", accountId);

    try {
      const response = await fetch(`/api/analysis?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.code === "string" ? payload.code : "analysis_unavailable");
      if (requestRef.current !== controller) return;

      if (!isAnalysisSnapshot(payload)) throw new Error("analysis_contract_invalid");

      const next = payload;
      setSnapshot(next);
      setMonth(next.selection.month);
      setRange(next.selection.range);
      setAccountId(next.selection.accountId ?? "");
      setMerchantsExpanded(false);

      const nextParams = new URLSearchParams({
        month: next.selection.month,
        range: next.selection.range,
      });
      if (next.selection.accountId) nextParams.set("accountId", next.selection.accountId);
      window.history.replaceState(window.history.state, "", `/analysis?${nextParams.toString()}`);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      console.error("analysis-client", cause instanceof Error ? cause.message : String(cause));
      if (requestRef.current === controller) {
        setError("No se pudo actualizar el análisis. Se mantienen visibles los últimos datos cargados.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <main className={styles.shell} aria-busy={loading ? "true" : "false"}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <p>FINANCIAL APP · INTELIGENCIA FINANCIERA</p>
          <div>
            <h1>Análisis</h1>
            {snapshot?.selection.partial && <span className={styles.partialChip}>Periodo parcial</span>}
          </div>
          {snapshot && <span className={styles.periodCaption}>{rangeLabel(snapshot)}</span>}
        </div>

        <form className={styles.filters} onSubmit={refresh} aria-label="Filtros del análisis">
          <div className={styles.rangeSelector} aria-label="Rango temporal">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={range === option.value ? styles.rangeActive : styles.rangeButton}
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label>
            <span>Mes de referencia</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} required />
          </label>
          <label>
            <span>Cuenta</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Todas las cuentas</option>
              {(snapshot?.accounts ?? []).map((account) => (
                <option value={account.id} key={account.id}>{account.name}{account.lifecycle === "archived" ? " · archivada" : ""}</option>
              ))}
            </select>
          </label>
          <button className={styles.applyButton} type="submit" disabled={loading || !month}>
            {loading ? "Actualizando…" : "Aplicar"}
          </button>
        </form>
      </header>

      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          {!snapshot && (
            <button className={styles.textButton} type="button" onClick={() => void refresh()} disabled={loading || !month}>
              {loading ? "Reintentando…" : "Reintentar"}
            </button>
          )}
        </div>
      )}
      {!snapshot && loading && <LoadingSkeleton />}

      {snapshot && (
        <>
          {loading && <div className={styles.refreshing} role="status">Actualizando datos sin ocultar la lectura actual…</div>}

          <section className={styles.kpis} aria-label="Indicadores principales del periodo">
            <Kpi
              label="Ingresos"
              value={formatMoney(snapshot.current.incomeCents)}
              comparison={`${formatPercentBps(snapshot.comparison.incomeChangeBps, true)} vs. periodo anterior`}
              trend={snapshot.trends.income}
              historical={<HistoricalReference snapshot={snapshot} metric="incomeCents" />}
              tone="income"
            />
            <Kpi
              label="Gastos"
              value={formatMoney(snapshot.current.expenseCents)}
              comparison={`${formatPercentBps(snapshot.comparison.expenseChangeBps, true)} vs. periodo anterior`}
              trend={snapshot.trends.expense}
              historical={<HistoricalReference snapshot={snapshot} metric="expenseCents" />}
              tone="expense"
            />
            <Kpi
              label="Neto del periodo"
              value={formatMoney(snapshot.current.operatingNetCents)}
              comparison={`${deltaText(snapshot.comparison.netDeltaCents)} vs. periodo anterior`}
              trend={snapshot.trends.net}
              historical={<HistoricalReference snapshot={snapshot} metric="savingsCents" />}
              tone="net"
            />
            <Kpi
              label="Tasa de ahorro"
              value={savingsRatePresentation?.representative ? formatPercentBps(savingsRatePresentation.valueBps) : "Pendiente"}
              comparison={savingsRatePresentation?.representative
                ? `${formatPointDeltaBps(savingsRatePresentation.deltaBps)} vs. periodo anterior`
                : savingsRatePresentation?.reason === "partial_income_pending"
                  ? "Ingresos del mes aún no representativos"
                  : "Sin tasa disponible"}
              trend={snapshot.trends.savingsRate}
              historical={<HistoricalReference snapshot={snapshot} metric="savingsRateBps" />}
              tone="rate"
            />
          </section>

          <QuickRead snapshot={snapshot} />

          <section className={`${styles.section} ${styles.trendSection}`} aria-labelledby="evolution-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p>EVOLUCIÓN</p>
                <h2 id="evolution-heading">Cómo está cambiando tu dinero</h2>
              </div>
              <Link className={styles.secondaryLink} href={periodHref(snapshot)}>Movimientos del periodo</Link>
            </div>
            <FinancialTrendChart
              rows={snapshot.history}
              formatMoney={formatMoney}
              formatMonth={formatShortMonth}
              partialMonthStart={snapshot.selection.partialMonthStart}
              hrefForMonth={(monthStart) => monthHref(snapshot, monthStart)}
            />
          </section>

          <section className={`${styles.section} ${styles.changeSection}`} aria-labelledby="change-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p>QUÉ HA CAMBIADO</p>
                <h2 id="change-heading">{changeHeadline}</h2>
                <span>vs. {comparisonLabel(snapshot)}</span>
              </div>
              <span className={expenseDirection > 0 ? styles.changeBad : expenseDirection < 0 ? styles.changeGood : styles.neutralChip}>
                {deltaText(expenseDirection)}
              </span>
            </div>
            <ContributionChart rows={snapshot.changeDrivers} formatMoney={formatMoney} />
          </section>

          <div className={styles.twoColumn}>
            <section className={styles.section} aria-labelledby="distribution-heading">
              <div className={styles.sectionHeading}>
                <div>
                  <p>COMPOSICIÓN</p>
                  <h2 id="distribution-heading">Dónde se concentra el gasto</h2>
                </div>
                <span>{formatPercentBps(snapshot.concentration.top3CategoryBps)} en 3 categorías</span>
              </div>
              <div className={styles.breakdown}>
                {snapshot.categoryDrivers.slice(0, 6).map((item) => (
                  <Link href={item.href ?? periodHref(snapshot)} key={`${item.id ?? "none"}-${item.name}`} className={styles.breakdownRow}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{formatMoney(item.expenseCents)} · {formatPercentBps(item.shareBps)}</span>
                    </div>
                    <div className={styles.breakdownTrack} aria-hidden="true">
                      <span style={{ width: `${Math.max(2, Math.min(100, (item.shareBps ?? 0) / 100))}%` }} />
                    </div>
                    <span className={item.deltaCents > 0 ? styles.badDelta : item.deltaCents < 0 ? styles.goodDelta : undefined}>{deltaText(item.deltaCents)}</span>
                  </Link>
                ))}
              </div>
            </section>

            <section className={styles.section} aria-labelledby="flexibility-heading">
              <div className={styles.sectionHeading}>
                <div>
                  <p>FLEXIBILIDAD</p>
                  <h2 id="flexibility-heading">Gasto fijo y variable</h2>
                </div>
              </div>
              {snapshot.fixedVariable.available ? (
                <div className={styles.fixedVariable}>
                  <div className={styles.fixedVariableBar} aria-label={`Gasto fijo ${formatPercentBps(snapshot.fixedVariable.fixedShareBps)}; el resto es variable`}>
                    <span style={{ width: `${Math.max(0, Math.min(100, (snapshot.fixedVariable.fixedShareBps ?? 0) / 100))}%` }} />
                  </div>
                  <dl>
                    <div><dt>Fijo fiable</dt><dd>{formatMoney(snapshot.fixedVariable.fixedExpenseCents)}</dd></div>
                    <div><dt>Variable</dt><dd>{formatMoney(snapshot.fixedVariable.variableExpenseCents)}</dd></div>
                    <div><dt>Peso fijo</dt><dd>{formatPercentBps(snapshot.fixedVariable.fixedShareBps)}</dd></div>
                  </dl>
                  <p>Clasificación basada únicamente en recurrencias activas con confianza media o alta.</p>
                </div>
              ) : (
                <div className={styles.insufficient}>
                  <strong>Sin clasificación fiable todavía</strong>
                  <p>No hay recurrencias activas con suficiente confianza para separar gasto fijo y variable sin hacer suposiciones.</p>
                  <Link href="/recurrences">Revisar recurrentes</Link>
                </div>
              )}
            </section>
          </div>

          <div className={styles.intelligenceGrid}>
            <section className={styles.section} aria-labelledby="anomalies-heading">
              <div className={styles.sectionHeading}>
                <div>
                  <p>ANOMALÍAS</p>
                  <h2 id="anomalies-heading">Movimientos que merecen la pena revisar</h2>
                </div>
                <span>{snapshot.anomalies.length.toLocaleString("es-ES")}</span>
              </div>
              {snapshot.anomalies.length === 0 ? (
                <p className={styles.empty}>No se han detectado importes que superen de forma clara el comportamiento histórico disponible.</p>
              ) : (
                <div className={styles.anomalyList}>
                  {snapshot.anomalies.map((item) => (
                    <Link href={item.href} key={item.transactionId} className={styles.anomaly}>
                      <div>
                        <strong>{item.merchantName}</strong>
                        <span>{formatDate(item.bankDate)} · {item.categoryName}</span>
                      </div>
                      <div>
                        <strong>{formatMoney(item.amountCents)}</strong>
                        <span>{formatPercentBps(item.variationBps, true)} vs. importe habitual ({item.historyRows} referencias)</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

          </div>

          <div className={styles.contextGrid}>
            <section className={`${styles.section} ${styles.contextCard}`} aria-labelledby="budget-heading">
              <div className={styles.sectionHeadingCompact}>
                <h2 id="budget-heading">Presupuesto</h2>
                <Link href="/budgets">Abrir Presupuestos</Link>
              </div>
              {snapshot.budget?.total ? (
                <>
                  <strong className={styles.contextValue}>{formatPercentBps(snapshot.budget.total.progressBps)} consumido</strong>
                  <p>{formatMoney(snapshot.budget.total.actualExpenseCents)} de {formatMoney(snapshot.budget.total.effectiveAmountCents)}.</p>
                  {snapshot.budget.categoryDetailDeferred ? (
                    <p className={styles.empty}>Detalle por categorías disponible en Presupuestos.</p>
                  ) : snapshot.budget.overCategories.length > 0 ? (
                    <ul className={styles.contextAlerts}>
                      {snapshot.budget.overCategories.slice(0, 3).map((item) => (
                        <li key={item.categoryId ?? item.categoryName ?? "budget"}>
                          <span>{item.categoryName ?? "Categoría"}</span>
                          <strong>{formatMoney(Math.abs(item.remainingCents))} por encima</strong>
                        </li>
                      ))}
                    </ul>
                  ) : <p className={styles.goodText}>No hay categorías por encima del límite en este momento.</p>}
                </>
              ) : (
                <p className={styles.empty}>{snapshot.selection.accountId ? "El presupuesto es global; no se muestra al filtrar una única cuenta para evitar una comparación engañosa." : "No hay presupuesto disponible para este periodo."}</p>
              )}
            </section>

            <section className={`${styles.section} ${styles.contextCard}`} aria-labelledby="forecast-heading">
              <div className={styles.sectionHeadingCompact}>
                <h2 id="forecast-heading">Previsión</h2>
                <Link href="/forecast">Abrir Previsión</Link>
              </div>
              {snapshot.forecast ? (
                snapshot.forecast.summary.plannedItems > 0 ? (
                  <>
                    <strong className={styles.contextValue}>{formatMoney(snapshot.forecast.summary.projectedNetCents)} previstos</strong>
                    <p>{`${snapshot.forecast.summary.plannedItems.toLocaleString("es-ES")} movimientos previstos hasta ${formatDate(snapshot.forecast.period.dateTo)}.`}</p>
                    <div className={styles.forecastFigures}>
                      <span>Ingresos previstos <strong>{formatMoney(snapshot.forecast.summary.projectedIncomeCents)}</strong></span>
                      <span>Gastos previstos <strong>{formatMoney(snapshot.forecast.summary.projectedExpenseCents)}</strong></span>
                    </div>
                  </>
                ) : (
                  <>
                    <strong className={styles.contextValue}>Sin previsiones activas</strong>
                    <p>{`No hay pagos o ingresos previstos activos hasta ${formatDate(snapshot.forecast.period.dateTo)}.`}</p>
                  </>
                )
              ) : (
                <p className={styles.empty}>La previsión sólo se muestra cuando el periodo seleccionado alcanza la fecha actual o futura.</p>
              )}
            </section>
          </div>

          <section className={styles.rankingsSection} aria-labelledby="rankings-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p>DETALLE</p>
                <h2 id="rankings-heading">Comercios principales</h2>
              </div>
              <span>{formatPercentBps(snapshot.concentration.top3MerchantBps)} en los 3 primeros</span>
            </div>
            <div className={styles.rankingsGrid}>
              <DriverRanking title="Comercios" items={snapshot.merchantDrivers} merchant expanded={merchantsExpanded} onToggle={() => setMerchantsExpanded((value) => !value)} />
            </div>
          </section>

          <footer className={styles.qualityNote}>
            <span>{snapshot.quality.reconciled ? "✓ Totales reconciliados al céntimo" : "Comprobación pendiente"}</span>
            <span>Fuente bancaria de solo lectura</span>
            <span>Anomalías deterministas, sin conclusiones generativas</span>
          </footer>
        </>
      )}
    </main>
  );
}
