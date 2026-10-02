"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { assembleBankNetWorth, type BankNetWorthAccount } from "../../src/application/net-worth/bank-net-worth";
import { formatMoneyCents } from "../../src/core/money";
import styles from "./net-worth.module.css";

type BalancesResponse = {
  asOfDate: string | null;
  activeBalanceCents: number;
  accounts: BankNetWorthAccount[];
};

function formatDate(value: string | null) {
  if (!value) return "fecha no confirmada";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

export default function NetWorthClient() {
  const [data, setData] = useState<BalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/financial?mode=balances", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`balances_failed_${response.status}`);
        const payload = await response.json() as BalancesResponse;
        setData(payload);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "balances_failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const snapshot = useMemo(() => {
    if (!data) return null;
    try {
      return assembleBankNetWorth(data.accounts ?? [], data.asOfDate ?? null);
    } catch {
      return null;
    }
  }, [data]);

  const engineMatches = Boolean(snapshot && data && snapshot.netWorthCents === data.activeBalanceCents);

  return (
    <main className={styles.shell} aria-busy={loading}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PATRIMONIO</p>
          <h1>Patrimonio bancario</h1>
          <p>
            Una lectura del valor neto observado en tus cuentas activas. No modifica movimientos ni la fuente bancaria.
          </p>
        </div>
        <Link href="/accounts" className={styles.secondaryAction}>Ver cuentas</Link>
      </header>

      <section className={styles.notice}>
        <strong>Qué incluye esta cifra</strong>
        <p>
          Incluye únicamente saldos bancarios ya calculados por Financial App. Los saldos positivos cuentan como activos y los negativos como pasivos. No incluye todavía vivienda, vehículos, efectivo externo ni otros activos manuales.
        </p>
      </section>

      {loading ? <div className={styles.state}>Calculando patrimonio…</div> : null}
      {error ? <div className={styles.error} role="alert">No se ha podido calcular el patrimonio bancario ahora.</div> : null}

      {!loading && snapshot ? (
        <>
          {!engineMatches ? (
            <div className={styles.error} role="alert">
              El patrimonio derivado no coincide con el saldo central. La cifra queda bloqueada hasta revisar Cuentas.
            </div>
          ) : null}

          <section className={styles.summary} aria-label="Resumen de patrimonio bancario">
            <article>
              <span>Patrimonio bancario</span>
              <strong>{engineMatches ? formatMoneyCents(snapshot.netWorthCents) : "—"}</strong>
              <small>A {formatDate(snapshot.asOfDate)}</small>
            </article>
            <article>
              <span>Activos observados</span>
              <strong>{formatMoneyCents(snapshot.assetsCents)}</strong>
              <small>{snapshot.assets.length} cuentas con saldo positivo</small>
            </article>
            <article>
              <span>Pasivos observados</span>
              <strong>{formatMoneyCents(snapshot.liabilitiesCents)}</strong>
              <small>{snapshot.liabilities.length} cuentas con saldo negativo</small>
            </article>
          </section>

          <section className={styles.grid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><span>ACTIVOS</span><h2>Saldos positivos</h2></div>
              {snapshot.assets.length ? (
                <ul>{snapshot.assets.map((item) => <li key={item.id}><div><strong>{item.name}</strong><span>{item.type}</span></div><b>{formatMoneyCents(item.magnitudeCents)}</b></li>)}</ul>
              ) : <p>Sin saldos positivos observados.</p>}
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><span>PASIVOS</span><h2>Saldos negativos</h2></div>
              {snapshot.liabilities.length ? (
                <ul>{snapshot.liabilities.map((item) => <li key={item.id}><div><strong>{item.name}</strong><span>{item.type}</span></div><b>{formatMoneyCents(item.magnitudeCents)}</b></li>)}</ul>
              ) : <p>Sin saldos negativos observados.</p>}
            </article>
          </section>

          <p className={styles.footnote}>
            {snapshot.accountCount} cuentas activas incluidas. Las cuentas archivadas no entran en el cálculo.
          </p>
        </>
      ) : null}
    </main>
  );
}
