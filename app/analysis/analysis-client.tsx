"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AnalysisDriver, AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
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

function FinancialComparisonVisual({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const currentMonth = monthLabel(snapshot.month);
  const previousMonth = monthLabel(snapshot.previous.dateFrom.slice(0, 7));
  const rows = [
    { key: "income", label: "Ingresos", current: snapshot.current.incomeCents, previous: snapshot.previous.incomeCents },
    { key: "expense", label: "Gastos", current: snapshot.current.expenseCents, previous: snapshot.previous.expenseCents },
    { key: "net", label: "Neto", current: snapshot.current.operatingNetCents, previous: snapshot.previous.operatingNetCents },
  ];
  const maximum = Math.max(1, ...rows.flatMap((row) => [Math.abs(row.current), Math.abs(row.previous)]));

  function pointLabel(label: string, period: string, cents: number) {
    const state = cents < 0 ? "déficit" : cents > 0 ? "superávit" : "equilibrio";
    return `${label} ${period}: ${formatMoney(cents)} · ${state}`;
  }

  return (
    <section
      aria-label="Comparativa financiera visual"
      style={{
        border: "1px solid var(--border-subtle, rgba(255,255,255,.12))",
        borderRadius: "24px",
        padding: "clamp(1rem, 2.2vw, 1.5rem)",
        background: "linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.018))",
        display: "grid",
        gap: "1.25rem",
      }}
    >
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.kicker}>LECTURA VISUAL</p>
          <h2>Comparativa financiera</h2>
        </div>
        <Link
          className={styles.drilldown}
          href={`/transactions?dateFrom=${snapshot.current.dateFrom}&dateTo=${snapshot.current.dateTo}`}
          aria-label="Ver movimientos del periodo"
        >
          Ver movimientos del periodo
        </Link>
      </div>

      <div style={{ display: "grid", gap: ".9rem" }}>
        {rows.map((row) => (
          <div key={row.key} style={{ display: "grid", gridTemplateColumns: "minmax(5.5rem, .35fr) 1fr", gap: ".75rem", alignItems: "center" }}>
            <strong style={{ fontSize: ".92rem" }}>{row.label}</strong>
            <div style={{ display: "grid", gap: ".45rem" }}>
              {([
                ["current", currentMonth, row.current],
                ["previous", previousMonth, row.previous],
              ] as const).map(([periodKey, period, cents]) => {
                const id = `${row.key}-${periodKey}`;
                const label = pointLabel(row.label, period, cents);
                const width = Math.max(8, (Math.abs(cents) / maximum) * 100);
                return (
                  <div key={id} style={{ display: "grid", gridTemplateColumns: "minmax(5.4rem, auto) 1fr", gap: ".6rem", alignItems: "center" }}>
                    <span style={{ color: "var(--text-muted, #aeb6c6)", fontSize: ".78rem" }}>{periodKey === "current" ? "Actual" : "Anterior"}</span>
                    <div style={{ position: "relative", minHeight: "2.1rem", display: "flex", alignItems: "center" }}>
                      <button
                        type="button"
                        aria-label={label}
                        onFocus={() => setActivePoint(id)}
                        onBlur={() => setActivePoint((current) => current === id ? null : current)}
                        onMouseEnter={() => setActivePoint(id)}
                        onMouseLeave={() => setActivePoint((current) => current === id ? null : current)}
                        style={{
                          width: `${width}%`,
                          minWidth: "3rem",
                          height: "1.65rem",
                          border: cents < 0 ? "1px solid rgba(255,124,145,.5)" : "1px solid rgba(99,219,180,.42)",
                          borderRadius: "999px",
                          background: cents < 0
                            ? "linear-gradient(90deg, rgba(255,104,132,.30), rgba(255,104,132,.12))"
                            : "linear-gradient(90deg, rgba(72,211,170,.28), rgba(72,211,170,.10))",
                          cursor: "default",
                          position: "relative",
                        }}
                      />
                      <span style={{ marginLeft: ".55rem", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontSize: ".82rem" }}>{formatMoney(cents)}</span>
                      {activePoint === id ? (
                        <div
                          role="tooltip"
                          style={{
                            position: "absolute",
                            zIndex: 5,
                            left: "0",
                            top: "calc(100% + .35rem)",
                            padding: ".5rem .65rem",
                            borderRadius: ".65rem",
                            background: "var(--surface-elevated, #151922)",
                            border: "1px solid var(--border-subtle, rgba(255,255,255,.15))",
                            boxShadow: "0 10px 30px rgba(0,0,0,.25)",
                            fontSize: ".78rem",
                            whiteSpace: "nowrap",
                          }}
                        >
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

      <div style={{ overflowX: "auto" }}>
        <table aria-label="Datos de la comparativa financiera" style={{ width: "100%", borderCollapse: "collapse", minWidth: "30rem" }}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "left", padding: ".65rem" }}>Métrica</th>
              <th scope="col" style={{ textAlign: "right", padding: ".65rem" }}>{currentMonth}</th>
              <th scope="col" style={{ textAlign: "right", padding: ".65rem" }}>{previousMonth}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" style={{ textAlign: "left", padding: ".65rem", borderTop: "1px solid rgba(255,255,255,.08)" }}>{row.label}</th>
                <td style={{ textAlign: "right", padding: ".65rem", borderTop: "1px solid rgba(255,255,255,.08)", fontVariantNumeric: "tabular-nums" }}>{formatMoney(row.current)}</td>
                <td style={{ textAlign: "right", padding: ".65rem", borderTop: "1px solid rgba(255,255,255,.08)", fontVariantNumeric: "tabular-nums" }}>{formatMoney(row.previous)}</td>
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

          <section className={styles.comparison} aria-labelledby="comparison-heading">
            <div className={styles.panelHeading}>
              <div><p className={styles.kicker}>COMPARACIÓN TEMPORAL</p><h2 id="comparison-heading">Frente a {previousLabel}</h2></div>
              <span>{snapshot.quality.reconciled ? "Reconciliado al céntimo" : "Pendiente"}</span>
            </div>
            <div className={styles.comparisonGrid}>
              <div><span>Ingresos anteriores</span><strong>{formatMoney(snapshot.previous.incomeCents)}</strong><small>Diferencia {formatMoney(snapshot.comparison.incomeDeltaCents)}</small></div>
              <div><span>Gastos anteriores</span><strong>{formatMoney(snapshot.previous.expenseCents)}</strong><small>Diferencia {formatMoney(snapshot.comparison.expenseDeltaCents)}</small></div>
              <div><span>Balance anterior</span><strong>{formatMoney(snapshot.previous.operatingNetCents)}</strong><small>{formatBps(snapshot.comparison.netChangeBps)} de variación</small></div>
            </div>
          </section>

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
