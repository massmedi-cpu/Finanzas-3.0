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
