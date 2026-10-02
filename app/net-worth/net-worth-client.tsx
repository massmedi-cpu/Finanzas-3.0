"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildNetWorthSnapshot,
  type NetWorthBalanceInput,
  type NetWorthEntry,
} from "../../src/application/net-worth/net-worth";
import type { AccountType } from "../../src/domain/models";
import { formatMoneyCents } from "../../src/core/money";
import styles from "./net-worth.module.css";

type BalancesResponse = {
  asOfDate: string | null;
  quality: {
    accounts: number;
    explicitBalanceAccounts: number;
    reconstructedBalanceAccounts: number;
    integrityDeltaAccounts: number;
  };
  accounts: NetWorthBalanceInput[];
};

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  credit: "Crédito",
  cash: "Efectivo",
  investment: "Inversión",
  other: "Otra cuenta",
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function formatDate(value: string | null) {
  if (!value) return "sin fecha confirmada";
  return dateFormatter.format(new Date(`${value}T12:00:00Z`));
}

function entryExplanation(entry: NetWorthEntry) {
  if (entry.reason === "financial_asset") return "Activo financiero";
  if (entry.reason === "overdraft_liability") return "Descubierto tratado como pasivo";
  if (entry.reason === "credit_liability") return "Deuda de crédito conocida";
  if (entry.reason === "credit_sign_ambiguous") return "Crédito excluido: el signo no permite distinguir deuda de saldo a favor";
  if (entry.reason === "unclassified_account") return "Excluida: tipo de cuenta sin clasificación patrimonial segura";
  if (entry.reason === "archived_account") return "Excluida: cuenta archivada";
  return "Excluida: saldo no válido";
}

function EntryList({ title, entries }: { title: string; entries: NetWorthEntry[] }) {
  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.panelHeading}>
        <h2>{title}</h2>
        <span>{entries.length}</span>
      </div>
      {entries.length ? (
        <ul className={styles.accountList}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.name}</strong>
                <span>{TYPE_LABELS[entry.type]} · {entryExplanation(entry)}</span>
                <small>
                  {entry.balanceSource === "bank_explicit" ? "Saldo bancario" : "Saldo reconstruido"}
                  {entry.balanceDate ? ` · ${formatDate(entry.balanceDate)}` : ""}
                </small>
              </div>
              <b>{formatMoneyCents(entry.valueCents)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No hay cuentas en este grupo.</p>
      )}
    </section>
  );
}

export default function NetWorthClient() {
  const [balances, setBalances] = useState<BalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/financial?mode=balances", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`request_failed_${response.status}`);
        return response.json() as Promise<BalancesResponse>;
      })
      .then((payload) => {
        if (!cancelled) setBalances(payload);
      })
      .catch(() => {
        if (!cancelled) setError("No se ha podido calcular el patrimonio financiero con los saldos actuales.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const snapshot = useMemo(
    () => balances ? buildNetWorthSnapshot(balances.accounts, balances.asOfDate) : null,
    [balances],
  );
  const assets = snapshot?.entries.filter((entry) => entry.bucket === "asset") ?? [];
  const liabilities = snapshot?.entries.filter((entry) => entry.bucket === "liability") ?? [];
  const excluded = snapshot?.entries.filter((entry) => entry.bucket === "excluded") ?? [];
  const integrityWarning = (balances?.quality.integrityDeltaAccounts ?? 0) > 0;

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <Link prefetch={false} className={styles.backLink} href="/accounts">← Cuentas</Link>
          <p className={styles.eyebrow}>PATRIMONIO FINANCIERO</p>
          <h1>Lo que tienes menos lo que debes</h1>
          <p className={styles.heroText}>
            Patrimonio financiero conocido calculado con las cuentas disponibles. No se usa como sinónimo de dinero disponible para gastar.
          </p>
        </div>
        <div className={styles.netCard} aria-label="Patrimonio financiero conocido">
          <span>Patrimonio financiero conocido</span>
          <strong>{snapshot ? formatMoneyCents(snapshot.netWorthCents) : "—"}</strong>
          <small>{snapshot ? `Saldos a ${formatDate(snapshot.asOfDate)}` : "Cargando saldos"}</small>
        </div>
      </header>

      {error ? <div className={styles.alert} role="alert">{error}</div> : null}
      {integrityWarning ? (
        <div className={styles.alert} role="alert">
          Hay cuentas cuyo saldo bancario y reconstruido no coinciden. Revisa Cuentas antes de usar este patrimonio para tomar decisiones.
        </div>
      ) : null}

      {loading ? (
        <section className={styles.loading}>Calculando patrimonio con los saldos actuales…</section>
      ) : snapshot ? (
        <>
          <section className={styles.metrics} aria-label="Resumen del patrimonio">
            <article>
              <span>Activos financieros</span>
              <strong>{formatMoneyCents(snapshot.assetsCents)}</strong>
              <small>{assets.length} {assets.length === 1 ? "cuenta incluida" : "cuentas incluidas"}</small>
            </article>
            <article>
              <span>Pasivos conocidos</span>
              <strong>{formatMoneyCents(snapshot.liabilitiesCents)}</strong>
              <small>{liabilities.length} {liabilities.length === 1 ? "pasivo incluido" : "pasivos incluidos"}</small>
            </article>
            <article>
              <span>Resultado</span>
              <strong className={snapshot.netWorthCents < 0 ? styles.negative : styles.positive}>
                {formatMoneyCents(snapshot.netWorthCents)}
              </strong>
              <small>Activos − pasivos</small>
            </article>
          </section>

          <div className={styles.columns}>
            <EntryList title="Activos incluidos" entries={assets} />
            <EntryList title="Pasivos incluidos" entries={liabilities} />
          </div>

          {excluded.length > 0 ? (
            <section className={`${styles.panel} ${styles.excluded}`} aria-labelledby="excluded-title">
              <div className={styles.panelHeading}>
                <h2 id="excluded-title">Fuera del cálculo</h2>
                <span>{excluded.length}</span>
              </div>
              <p className={styles.helper}>
                Estas cuentas no se incluyen hasta que su tratamiento patrimonial sea inequívoco. Es preferible omitir una cifra dudosa que falsear el patrimonio.
              </p>
              <ul className={styles.accountList}>
                {excluded.map((entry) => (
                  <li key={entry.id}>
                    <div><strong>{entry.name}</strong><span>{entryExplanation(entry)}</span></div>
                    <b>Excluida</b>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={styles.scopeNote} aria-label="Alcance del patrimonio">
            <strong>Qué incluye esta cifra</strong>
            <p>
              Solo cuentas financieras activas que pueden clasificarse con seguridad. No incluye inmuebles, vehículos, efectivo no registrado ni otros activos o deudas fuera de Financial App.
            </p>
            <p>La fuente bancaria continúa siendo de solo lectura; este cálculo no modifica saldos ni movimientos.</p>
            <Link prefetch={false} href="/accounts">Revisar cuentas y saldos</Link>
          </section>
        </>
      ) : null}
    </main>
  );
}
