"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatMoneyCents } from "../../src/core/money";
import styles from "./accounts.module.css";

type Lifecycle = "active" | "archived";
type BalanceSource = "bank_explicit" | "reconstructed";
type TransactionKind = "income" | "expense" | "transfer" | "refund" | "adjustment";

type AccountBalance = {
  id: string;
  name: string;
  type: string;
  currency: "EUR";
  lifecycle: Lifecycle;
  openingBalanceCents: number;
  balanceCents: number;
  balanceSource: BalanceSource;
  explicitBalanceCents: number | null;
  explicitBalanceDate: string | null;
  explicitSourceRowKey: string | null;
  reconstructedBalanceCents: number;
  reconstructionDeltaCents: number | null;
};

type BalancesResponse = {
  asOfDate: string | null;
  includeArchived: boolean;
  accountId: string | null;
  totalBalanceCents: number;
  activeBalanceCents: number;
  quality: {
    accounts: number;
    explicitBalanceAccounts: number;
    reconstructedBalanceAccounts: number;
    integrityDeltaAccounts: number;
  };
  accounts: AccountBalance[];
};

type MonthlyRow = {
  monthStart: string;
  rows: number;
  incomeCents: number;
  expenseCents: number;
  refundCents: number;
  adjustmentCents: number;
  operatingNetCents: number;
  savingsCents: number;
  transferNetCents: number;
  transferGrossCents: number;
};

type FinancialSnapshot = {
  contractVersion: number;
  period: {
    dateFrom: string | null;
    dateTo: string | null;
    accountId: string | null;
    incomeCents: number;
    expenseCents: number;
    refundCents: number;
    adjustmentCents: number;
    operatingNetCents: number;
    savingsCents: number;
    savingsRateBps: number | null;
    transfers: {
      rows: number;
      pairedRows: number;
      unpairedRows: number;
      pairedPairs: number;
      netCents: number;
      grossCents: number;
    };
    quality: {
      scopedRows: number;
      includedRows: number;
      manuallyExcludedRows: number;
      confirmedDuplicateRows: number;
      suspectedDuplicateRows: number;
      signMismatchRows: number;
    };
  };
  balances: BalancesResponse;
  monthly: {
    dateFrom: string | null;
    dateTo: string | null;
    accountId: string | null;
    rows: MonthlyRow[];
  };
  principles: {
    bankSource: "read_only";
    transfersExcludedFromSavings: boolean;
    suspectedDuplicatesIncluded: boolean;
    confirmedDuplicatesExcluded: boolean;
    manualAnalyticsExclusionRespected: boolean;
    explicitBankBalancePreferred: boolean;
  };
};

type TransactionRow = {
  id: string;
  bankDate: string;
  amountCents: number;
  balanceAfterCents: number | null;
  account: { id: string; name: string };
  concept: { original: string; processed: string; effective: string };
  category: {
    originalId: string | null;
    originalName: string | null;
    effectiveId: string | null;
    effectiveName: string | null;
  };
  kind: { original: TransactionKind; effective: TransactionKind };
  duplicateState: "none" | "suspected" | "confirmed";
  excludedFromAnalytics: boolean;
};

type TransactionsResponse = {
  rows: TransactionRow[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: { bankDate: string; id: string } | null;
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});
const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  timeZone: "Europe/Madrid",
});

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Cuenta corriente",
  savings: "Cuenta de ahorro",
  credit: "Crédito",
  cash: "Efectivo",
  investment: "Inversión",
  other: "Otra cuenta",
};
const KIND_LABELS: Record<TransactionKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
  refund: "Devolución",
  adjustment: "Ajuste",
};

function formatMoney(cents: number | null | undefined) {
  return formatMoneyCents(cents ?? 0);
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(parseDate(value)) : "Sin fecha bancaria";
}

function formatMonth(value: string) {
  return monthFormatter.format(parseDate(value)).replace(".", "");
}

function accountTypeLabel(type: string) {
  return ACCOUNT_TYPE_LABELS[type] ?? "Cuenta";
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`request_failed_${response.status}`);
  return response.json() as Promise<T>;
}

function yearStart(asOfDate: string | null) {
  return asOfDate ? `${asOfDate.slice(0, 4)}-01-01` : null;
}

function monthlyScale(rows: MonthlyRow[]) {
  return Math.max(
    1,
    ...rows.flatMap((row) => [row.incomeCents, row.expenseCents, Math.abs(row.operatingNetCents)]),
  );
}

function activityBarWidth(value: number, scale: number) {
  const magnitude = Math.abs(value);
  return magnitude === 0 ? 0 : Math.max(2, (magnitude / scale) * 100);
}

export default function AccountsClient({ initialAccountId = null }: { initialAccountId?: string | null }) {
  const [showArchived, setShowArchived] = useState(Boolean(initialAccountId));
  const [balances, setBalances] = useState<BalancesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string>(initialAccountId ?? "");
  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);
  const [transactions, setTransactions] = useState<TransactionsResponse | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [retryBalances, setRetryBalances] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoadingBalances(true);
    setError("");
    const suffix = showArchived ? "&includeArchived=true" : "";
    readJson<BalancesResponse>(`/api/financial?mode=balances${suffix}`)
      .then((next) => {
        if (cancelled) return;
        setBalances(next);
        setSelectedId((current) => {
          if (current && next.accounts.some((account) => account.id === current)) return current;
          return next.accounts.find((account) => account.lifecycle === "active")?.id ?? next.accounts[0]?.id ?? "";
        });
      })
      .catch(() => {
        if (!cancelled) { setBalances(null); setSelectedId(""); setError("No se han podido verificar las cuentas ni sus saldos."); }
      })
      .finally(() => {
        if (!cancelled) setLoadingBalances(false);
      });
    return () => { cancelled = true; };
  }, [showArchived, retryBalances]);

  const selectedAccount = useMemo(
    () => balances?.accounts.find((account) => account.id === selectedId) ?? null,
    [balances, selectedId],
  );

  useEffect(() => {
    if (!selectedAccount || !balances) {
      setSnapshot(null);
      setTransactions(null);
      setDetailAccountId(null);
      return;
    }

    let cancelled = false;
    // Un cambio de cuenta invalida inmediatamente los datos derivados anteriores.
    setDetailAccountId(null);
    setSnapshot(null);
    setTransactions(null);
    setLoadingDetail(true);
    setError("");
    const from = yearStart(balances.asOfDate);
    const dateQuery = from && balances.asOfDate
      ? `&dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(balances.asOfDate)}`
      : "";
    const archivedQuery = selectedAccount.lifecycle === "archived" ? "&includeArchived=true" : "";
    const account = encodeURIComponent(selectedAccount.id);

    Promise.all([
      readJson<FinancialSnapshot>(`/api/financial?mode=snapshot&accountId=${account}${dateQuery}${archivedQuery}`),
      readJson<TransactionsResponse>(`/api/transactions?accountId=${account}${dateQuery}&limit=8`),
    ])
      .then(([nextSnapshot, nextTransactions]) => {
        if (cancelled) return;
        if (nextSnapshot.period.accountId !== selectedAccount.id
          || nextSnapshot.monthly.accountId !== selectedAccount.id
          || nextTransactions.rows.some((row) => row.account.id !== selectedAccount.id)) {
          throw new Error("account_response_scope_mismatch");
        }
        setSnapshot(nextSnapshot);
        setTransactions(nextTransactions);
        setDetailAccountId(selectedAccount.id);
      })
      .catch((caught) => {
        if (!cancelled) {
          setSnapshot(null);
          setTransactions(null);
          setDetailAccountId(null);
          setError(caught instanceof Error && caught.message === "account_response_scope_mismatch"
            ? "El detalle recibido no corresponde a la cuenta elegida. No se muestran cifras ajenas; vuelve a intentarlo."
            : "No se ha podido cargar el detalle de la cuenta seleccionada.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => { cancelled = true; };
  }, [selectedAccount, balances]);

  const activeCount = balances?.accounts.filter((account) => account.lifecycle === "active").length ?? null;
  const scale = monthlyScale(snapshot?.monthly.rows ?? []);
  const balanceDate = balances?.asOfDate ?? null;
  const activeAccounts = balances?.accounts.filter((account) => account.lifecycle === "active") ?? [];
  const distinctBalanceReferences = new Set(activeAccounts.map((account) =>
    account.balanceSource === "bank_explicit" && account.explicitBalanceDate
      ? `bank:${account.explicitBalanceDate}`
      : `reconstructed:${account.id}`,
  ));
  const mixedBalanceReferences = distinctBalanceReferences.size > 1;
  const visibleSnapshot = detailAccountId === selectedAccount?.id ? snapshot : null;
  const visibleTransactions = detailAccountId === selectedAccount?.id ? transactions : null;

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <Link prefetch={false} className={styles.backLink} href="/">← Inicio</Link>
          <p className={styles.eyebrow}>CUENTAS</p>
          <h1>Tu dinero, cuenta por cuenta</h1>
          <p className={styles.heroText}>
            Consulta el saldo de cada cuenta, su actividad mensual y sus últimos movimientos sin modificar la fuente bancaria.
          </p>
          <div className={styles.principles} role="group" aria-label="Principios de la vista de cuentas">
            <span>Fuente bancaria · solo lectura</span>
            <span>Transferencias fuera del ahorro</span>
            <span>EUR · es-ES</span>
          </div>
        </div>
        <div className={styles.totalCard} role="group" aria-label="Saldo total en cuentas">
          <span>Saldo total en cuentas</span>
          <strong>{balances ? formatMoney(balances.activeBalanceCents) : "—"}</strong>
          <small>{balances ? `${activeCount} ${activeCount === 1 ? "cuenta activa" : "cuentas activas"}${balanceDate ? ` · datos hasta ${formatDate(balanceDate)}` : " · fecha bancaria no disponible"}` : "Estado sin verificar · saldo y fecha desconocidos"}</small>
          {mixedBalanceReferences ? (
            <small className={styles.balanceDateNotice}>
              Aviso: los saldos individuales proceden de fechas o métodos distintos. Consulta cada cuenta; el total no es un saldo bancario simultáneo confirmado.
            </small>
          ) : null}
        </div>
      </header>

      {error ? <div className={styles.alert} role="alert">{error}{!balances && !loadingBalances ? <button type="button" onClick={() => setRetryBalances((value) => value + 1)}>Reintentar lectura</button> : null}</div> : null}

      <section className={styles.workspace} aria-label="Cuentas y detalle financiero">
        <aside className={styles.accountsPanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionEyebrow}>SALDOS EN CUENTAS</p>
              <h2>Cuentas</h2>
            </div>
            <button
              className={styles.archiveToggle}
              type="button"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? "Ocultar archivadas" : "Ver archivadas"}
            </button>
          </div>

          {loadingBalances ? <div className={styles.loading}>Cargando saldos…</div> : null}
          {!loadingBalances && balances?.accounts.length === 0 ? (
            <div className={styles.empty}>No hay cuentas configuradas.</div>
          ) : null}

          <div className={styles.accountList}>
            {balances?.accounts.map((account) => {
              const selected = account.id === selectedId;
              return (
                <button
                  key={account.id}
                  type="button"
                  className={`${styles.accountCard} ${selected ? styles.accountSelected : ""}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedId(account.id);
                  }}
                >
                  <span className={styles.accountIcon} aria-hidden="true">{account.type === "savings" ? "◇" : "○"}</span>
                  <span className={styles.accountMain}>
                    <span className={styles.accountName}>{account.name}</span>
                    <span className={styles.accountMeta}>
                      {accountTypeLabel(account.type)}
                      {account.lifecycle === "archived" ? " · Archivada" : ""}
                    </span>
                    <span className={styles.accountSource}>
                      {account.balanceSource === "bank_explicit"
                        ? `Saldo bancario · ${formatDate(account.explicitBalanceDate)}`
                        : "Saldo reconstruido"}
                    </span>
                  </span>
                  <strong className={styles.accountBalance}>{formatMoney(account.balanceCents)}</strong>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={styles.detailPanel} aria-live="polite">
          {!selectedAccount ? (
            <div className={styles.emptyDetail}>
              <span aria-hidden="true">◎</span>
              <h2>Selecciona una cuenta</h2>
              <p>Elige una cuenta para ver su saldo, evolución y movimientos recientes.</p>
            </div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>{accountTypeLabel(selectedAccount.type).toUpperCase()}</p>
                  <h2>{selectedAccount.name}</h2>
                  <p>
                    {selectedAccount.balanceSource === "bank_explicit"
                      ? `Saldo confirmado por el banco el ${formatDate(selectedAccount.explicitBalanceDate)}`
                      : "Saldo reconstruido a partir de los movimientos"}
                  </p>
                </div>
                <div className={styles.currentBalance}>
                  <span>{selectedAccount.balanceSource === "bank_explicit" ? "Último saldo bancario conocido" : "Saldo reconstruido"}</span>
                  <strong>{formatMoney(selectedAccount.balanceCents)}</strong>
                  {selectedAccount.balanceSource === "bank_explicit" ? <small>Fecha: {formatDate(selectedAccount.explicitBalanceDate)}</small> : null}
                </div>
              </div>

              {selectedAccount.reconstructionDeltaCents !== null && selectedAccount.reconstructionDeltaCents !== 0 ? (
                <div className={styles.integrityNotice} role="status">
                  <strong>Saldo bancario prioritario.</strong>{" "}
                  La reconstrucción por movimientos difiere en {formatMoney(Math.abs(selectedAccount.reconstructionDeltaCents))}; se muestra el saldo explícito del banco como fuente de verdad.
                </div>
              ) : null}

              {loadingDetail ? <div className={styles.loading}>Actualizando detalle…</div> : null}

              {visibleSnapshot ? (
                <>
                  <div className={styles.metrics} role="group" aria-label="Resumen del periodo de la cuenta">
                    <article><span>Ingresos</span><strong>{formatMoney(visibleSnapshot.period.incomeCents)}</strong></article>
                    <article><span>Gastos</span><strong>{formatMoney(visibleSnapshot.period.expenseCents)}</strong></article>
                    <article><span>Balance neto</span><strong>{formatMoney(visibleSnapshot.period.operatingNetCents)}</strong></article>
                    <article><span>Transferencias</span><strong>{formatMoney(visibleSnapshot.period.transfers.grossCents)}</strong><small>No computan como ahorro</small></article>
                  </div>

                  <section className={styles.evolutionSection} aria-labelledby="account-evolution-title">
                    <div className={styles.sectionHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>EVOLUCIÓN</p>
                        <h3 id="account-evolution-title">Actividad mensual</h3>
                      </div>
                      <span>{formatDate(visibleSnapshot.period.dateFrom)} — {formatDate(visibleSnapshot.period.dateTo)}</span>
                    </div>

                    <div className={styles.legend} role="group" aria-label="Leyenda y escala de la actividad mensual">
                      <span><i className={styles.incomeDot} aria-hidden="true" />Ingresos</span>
                      <span><i className={styles.expenseDot} aria-hidden="true" />Gastos</span>
                      <span><i className={styles.netDot} aria-hidden="true" />Neto positivo (+)</span>
                      <span><i className={styles.negativeBar} aria-hidden="true" />Neto negativo (−)</span>
                      <span data-testid="accounts-monthly-scale-reference">Escala máxima {formatMoney(scale)}</span>
                    </div>

                    <div className={styles.monthlyChart} role="list" aria-label="Ingresos, gastos y balance neto por mes">
                      {visibleSnapshot.monthly.rows.map((row) => (
                        <div
                          className={styles.monthRow}
                          role="listitem"
                          key={row.monthStart}
                          aria-label={`${formatMonth(row.monthStart)}: ingresos ${formatMoney(row.incomeCents)}, gastos ${formatMoney(row.expenseCents)}, balance neto ${formatMoney(row.operatingNetCents)}`}
                        >
                          <strong className={styles.monthLabel}>{formatMonth(row.monthStart)}</strong>
                          <div className={styles.bars}>
                            <div className={styles.barTrack} title={`Ingresos ${formatMoney(row.incomeCents)}`}>
                              <span className={styles.incomeBar} data-zero={row.incomeCents === 0 ? "true" : undefined} style={{ width: `${activityBarWidth(row.incomeCents, scale)}%` }} />
                            </div>
                            <div className={styles.barTrack} title={`Gastos ${formatMoney(row.expenseCents)}`}>
                              <span className={styles.expenseBar} data-zero={row.expenseCents === 0 ? "true" : undefined} style={{ width: `${activityBarWidth(row.expenseCents, scale)}%` }} />
                            </div>
                            <div className={styles.barTrack} title={`Neto ${formatMoney(row.operatingNetCents)}`}>
                              <span className={row.operatingNetCents >= 0 ? styles.netBar : styles.negativeBar} data-financial-sign={row.operatingNetCents > 0 ? "positive" : row.operatingNetCents < 0 ? "negative" : "zero"} data-zero={row.operatingNetCents === 0 ? "true" : undefined} style={{ width: `${activityBarWidth(row.operatingNetCents, scale)}%` }} />
                            </div>
                          </div>
                          <span className={styles.monthValue}>{formatMoney(row.operatingNetCents)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}

              <section className={styles.movementsSection} aria-labelledby="account-movements-title">
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>ACTIVIDAD RECIENTE</p>
                    <h3 id="account-movements-title">Movimientos</h3>
                  </div>
                  <Link prefetch={false} className={styles.secondaryLink} href={`/transactions?accountId=${encodeURIComponent(selectedAccount.id)}`}>Abrir Movimientos</Link>
                </div>

                {visibleTransactions && visibleTransactions.rows.length === 0 ? (
                  <p className={styles.emptyMovements}>No hay movimientos en el periodo.</p>
                ) : null}
                <div className={styles.movementList}>
                  {visibleTransactions?.rows.map((transaction) => (
                    <article className={styles.movementRow} key={transaction.id}>
                      <div className={styles.movementDate}>{formatDate(transaction.bankDate)}</div>
                      <div className={styles.movementMain}>
                        <strong>{transaction.concept.effective}</strong>
                        <span>{transaction.category.effectiveName ?? KIND_LABELS[transaction.kind.effective]}</span>
                      </div>
                      <span className={`${styles.kindBadge} ${styles[`kind_${transaction.kind.effective}`]}`}>{KIND_LABELS[transaction.kind.effective]}</span>
                      <strong className={transaction.amountCents < 0 ? styles.negativeAmount : styles.positiveAmount}>
                        {formatMoney(transaction.amountCents)}
                      </strong>
                    </article>
                  ))}
                </div>
                {visibleTransactions && visibleTransactions.totalCount > visibleTransactions.rows.length ? (
                  <p className={styles.moreHint}>Mostrando {visibleTransactions.rows.length} de {visibleTransactions.totalCount} movimientos de la cuenta en el periodo.</p>
                ) : null}
              </section>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
