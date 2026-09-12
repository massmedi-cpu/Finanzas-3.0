"use client";

import Link from "next/link";
import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import type { AnalysisDriver, AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import visualStyles from "./analysis-visual.module.css";
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

const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

type ComparisonKey = "income" | "expense" | "net";

function formatMoney(cents: number) {
  return moneyFormatter.format(cents / 100);
}

function formatBps(bps: number | null) {
  if (bps === null) return "—";
  return `${bps > 0 ? "+" : ""}${percentFormatter.format(bps / 100)} %`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthFormatter.format(new Date(Date.UTC(year, monthNumber - 1, 1, 12)));
}

function madridMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}`;
}

function DriverList({ title, items }: { title: string; items: AnalysisDriver[] }) {
  return (
    <section className={styles.panel} aria-labelledby={`${title.replaceAll(" ", "-")}-heading`}>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.kicker}>DRIVERS DE GASTO</p>
          <h2 id={`${title.replaceAll(" ", "-")}-heading`}>{title}</h2>
        </div>
        <span>{items.length.toLocaleString("es-ES")} grupos</span>
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>No hay gastos elegibles en este periodo.</p>
      ) : (
        <div className={styles.driverList}>
          {items.slice(0, 8).map((item) => (
            <article className={styles.driver} key={`${title}-${item.id ?? "none"}`}>
              <div className={styles.driverTop}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.rows.toLocaleString("es-ES")} movimientos</span>
                </div>
                <div className={styles.driverAmount}>
                  <strong>{formatMoney(item.expenseCents)}</strong>
                  <span>{item.shareBps === null ? "—" : `${percentFormatter.format(item.shareBps / 100)} %`}</span>
                </div>
              </div>
              <progress max={10000} value={Math.max(0, item.shareBps ?? 0)} aria-label={`Peso de ${item.name}`} />
              {item.href ? <Link className={styles.drilldown} href={item.href}>Ver movimientos</Link> : <span className={styles.noDrilldown}>Sin comercio normalizado para filtrar</span>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function trendClass(metric: ComparisonKey, value: number | null) {
  if (value === null || value === 0) return visualStyles.deltaNeutral;
  const favorable = metric === "expense" ? value < 0 : value > 0;
  return favorable ? visualStyles.deltaPositive : visualStyles.deltaNegative;
}

function FinancialComparisonVisual({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const currentMonth = monthLabel(snapshot.month);
  const previousMonth = monthLabel(snapshot.previous.dateFrom.slice(0, 7));
  const rows: Array<{
    key: ComparisonKey;
    label: string;
    current: number;
    previous: number;
    delta: number;
    changeBps: number | null;
  }> = [
    {
      key: "income",
      label: "Ingresos",
      current: snapshot.current.incomeCents,
      previous: snapshot.previous.incomeCents,
      delta: snapshot.comparison.incomeDeltaCents,
      changeBps: snapshot.comparison.incomeChangeBps,
    },
    {
      key: "expense",
      label: "Gastos",
      current: snapshot.current.expenseCents,
      previous: snapshot.previous.expenseCents,
      delta: snapshot.comparison.expenseDeltaCents,
      changeBps: snapshot.comparison.expenseChangeBps,
    },
    {
      key: "net",
      label: "Neto",
      current: snapshot.current.operatingNetCents,
      previous: snapshot.previous.operatingNetCents,
      delta: snapshot.comparison.netDeltaCents,
      changeBps: snapshot.comparison.netChangeBps,
    },
  ];
  const maximum = Math.max(1, ...rows.flatMap((row) => [Math.abs(row.current), Math.abs(row.previous)]));

  function pointLabel(label: string, period: string, cents: number) {
    const state = cents < 0 ? "déficit" : cents > 0 ? "superávit" : "equilibrio";
    return `${label} ${period}: ${formatMoney(cents)} · ${state}`;
  }

  return (
    <section className={visualStyles.visual} aria-label="Comparativa financiera visual">
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.kicker}>LECTURA VISUAL</p>
          <h2>Comparativa financiera</h2>
        </div>
        <div className={visualStyles.headingActions}>
          <span className={`${visualStyles.reconciled} ${snapshot.quality.reconciled ? "" : visualStyles.pending}`}>
            {snapshot.quality.reconciled ? "Reconciliado al céntimo" : "Pendiente de reconciliar"}
          </span>
          <Link
            className={styles.drilldown}
            href={`/transactions?dateFrom=${snapshot.current.dateFrom}&dateTo=${snapshot.current.dateTo}`}
            aria-label="Ver movimientos del periodo"
          >
            Ver movimientos del periodo
          </Link>
        </div>
      </div>

      <div className={visualStyles.chart}>
        {rows.map((row) => (
          <div key={row.key} className={visualStyles.visualRow}>
            <strong className={visualStyles.metricName}>{row.label}</strong>
            <div className={visualStyles.periods}>
              {([
                ["current", currentMonth, row.current],
                ["previous", previousMonth, row.previous],
              ] as const).map(([periodKey, period, cents]) => {
                const id = `${row.key}-${periodKey}`;
                const label = pointLabel(row.label, period, cents);
                const width = Math.max(8, (Math.abs(cents) / maximum) * 100);
                const barStyle = { "--bar-width": `${width}%` } as CSSProperties;
                return (
                  <div key={id} className={visualStyles.periodRow}>
                    <span className={visualStyles.periodLabel}>{periodKey === "current" ? "Actual" : "Anterior"}</span>
                    <div className={visualStyles.barArea}>
                      <button
                        type="button"
                        aria-label={label}
                        onFocus={() => setActivePoint(id)}
                        onBlur={() => setActivePoint((current) => current === id ? null : current)}
                        onMouseEnter={() => setActivePoint(id)}
                        onMouseLeave={() => setActivePoint((current) => current === id ? null : current)}
                        className={`${visualStyles.bar} ${cents < 0 ? visualStyles.negative : visualStyles.standard}`}
                        style={barStyle}
                      />
                      <span className={visualStyles.amount}>{formatMoney(cents)}</span>
                      {activePoint === id ? (
                        <div role="tooltip" className={visualStyles.tooltip}>
                          {label}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className={visualStyles.tableWrap}>
        <table aria-label="Datos de la comparativa financiera" className={visualStyles.table}>
          <thead>
            <tr>
              <th scope="col">Métrica</th>
              <th scope="col">{currentMonth}</th>
              <th scope="col">{previousMonth}</th>
              <th scope="col">Diferencia</th>
              <th scope="col">Variación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{formatMoney(row.current)}</td>
                <td>{formatMoney(row.previous)}</td>
                <td className={trendClass(row.key, row.delta)}>{formatMoney(row.delta)}</td>
                <td className={trendClass(row.key, row.changeBps)}>{formatBps(row.changeBps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AnalysisClient() {
  const [month, setMonth] = useState(madridMonth);
  const [appliedMonth, setAppliedMonth] = useState(madridMonth);
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(`/api/analysis?month=${encodeURIComponent(appliedMonth)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload?.code === "string" ? payload.code : "analysis_unavailable");
        return payload as AnalysisSnapshot;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setSnapshot(payload);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("analysis-client", cause instanceof Error ? cause.message : String(cause));
        setSnapshot(null);
        setError("No se pudo cargar el análisis financiero. Los datos no se han modificado.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appliedMonth]);

  const previousLabel = useMemo(() => snapshot ? monthLabel(snapshot.previous.dateFrom.slice(0, 7)) : "periodo anterior", [snapshot]);

  function applyMonth(event: FormEvent) {
    event.preventDefault();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) setAppliedMonth(month);
  }

  return (
    <main className={styles.shell} aria-busy={loading ? "true" : "false"}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>FINANCIAL APP · ANÁLISIS</p>
          <h1>Análisis</h1>
          <p>Entiende qué ha cambiado y por qué, usando los mismos motores centrales que alimentan el resto de Financial App. Esta vista es estrictamente de lectura.</p>
        </div>
        <form className={styles.periodForm} onSubmit={applyMonth}>
          <label>
            <span>Mes analizado</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <button type="submit" disabled={loading}>Actualizar análisis</button>
        </form>
      </header>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {loading && <div className={styles.loading} role="status">Calculando el análisis desde los contratos financieros centrales…</div>}

      {!loading && snapshot && (
        <>
          <section className={styles.metrics} aria-label="Resumen financiero del periodo">
            <article><span>Ingresos</span><strong>{formatMoney(snapshot.current.incomeCents)}</strong><small>{formatBps(snapshot.comparison.incomeChangeBps)} vs. {previousLabel}</small></article>
            <article><span>Gastos</span><strong>{formatMoney(snapshot.current.expenseCents)}</strong><small>{formatBps(snapshot.comparison.expenseChangeBps)} vs. {previousLabel}</small></article>
            <article><span>Balance neto</span><strong>{formatMoney(snapshot.current.operatingNetCents)}</strong><small>{formatMoney(snapshot.comparison.netDeltaCents)} de diferencia</small></article>
            <article><span>Tasa de ahorro</span><strong>{snapshot.current.savingsRateBps === null ? "—" : `${percentFormatter.format(snapshot.current.savingsRateBps / 100)} %`}</strong><small>{monthLabel(snapshot.month)}</small></article>
          </section>

          <FinancialComparisonVisual snapshot={snapshot} />

          <div className={styles.driverGrid}>
            <DriverList title="Por categoría" items={snapshot.categoryDrivers} />
            <DriverList title="Por comercio" items={snapshot.merchantDrivers} />
          </div>

          <p className={styles.note}>Los totales proceden de <strong>financial.period</strong>; los drivers se obtienen de Movimientos efectivos, excluyendo duplicados confirmados y filas marcadas fuera de analítica. La suma se reconcilia al céntimo antes de mostrarse. La fuente bancaria permanece estrictamente de solo lectura.</p>
        </>
      )}
    </main>
  );
}