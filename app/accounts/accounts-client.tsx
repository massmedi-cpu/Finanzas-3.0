"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProductIcon, type ProductIconName } from "../../src/design/product-icons";
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

const moneyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});
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
  return moneyFormatter.format((cents ?? 0) / 100);
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

function accountIconName(type: string): ProductIconName {
  if (type === "cash") return "wallet";
  if (type === "savings" || type === "investment") return "balance";
  return "accounts";
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

export default function AccountsClient() {
  const [showArchived, setShowArchived] = useState(false);
  const [balances, setBalances] = useState<BalancesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);
  const [transactions, setTransactions] = useState<TransactionsResponse | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
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
        if (!cancelled) setError("No se ha podido cargar la vista de cuentas.");
      })
      .finally(() => {
        if (!cancelled) setLoadingBalances(false);
      });
    return () => { cancelled = true; };
  }, [showArchived]);

  const selectedAccount = useMemo(
    () => balances?.accounts.find((account) => account.id === selectedId) ?? null,
    [balances, selectedId],
  );

  useEffect(() => {
    if (!selectedAccount || !balances) {
      setSnapshot(null);
      setTransactions(null);
      return;
    }

    let cancelled = false;
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
        setSnapshot(nextSnapshot);
        setTransactions(nextTransactions);
      })
      .catch(() => {
        if (!cancelled) setError("No se ha podido cargar el detalle de la cuenta seleccionada.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => { cancelled = true; };
  }, [selectedAccount, balances]);

  const activeCount = balances?.accounts.filter((account) => account.lifecycle === "active").length ?? 0;
  const scale = monthlyScale(snapshot?.monthly.rows ?? []);
  const balanceDate = balances?.asOfDate ?? null;

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <Link className={styles.backLink} href="/">← Inicio</Link>
          <p className={styles.eyebrow}>CUENTAS</p>
          <h1>Tu dinero, cuenta por cuenta</h1>
          <p className={styles.heroText}>
            Consulta el saldo de cada cuenta, su actividad mensual y sus últimos movimientos sin modificar la fuente bancaria.
          </p>
          <div className={styles.principles} aria-label="Principios de la vista de cuentas">
            <span>Fuente bancaria · solo lectura</span>
            <span>Transferencias fuera del ahorro</span>
            <span>EUR · es-ES</span>
          </div>
        </div>
        <div className={styles.totalCard} aria-label="Saldo total en cuentas">
          <span>Saldo total en cuentas</span>
          <strong>{balances ? formatMoney(balances.activeBalanceCents) : "—"}</strong>
          <small>{activeCount} {activeCount === 1 ? "cuenta activa" : "cuentas activas"} · datos hasta {formatDate(balanceDate)}</small>
        </div>
      </header>

      {error ? <div className={styles.alert} role="alert">{error}</div> : null}

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
                  onClick={() => setSelectedId(account.id)}
                >
                  <span className={styles.accountIcon} aria-hidden="true">
                    <ProductIcon name={accountIconName(account.type)} size={20} />
                  </span>
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
              <span aria-hidden="true"><ProductIcon name="accounts" size={40} /></span>
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
                  <span>Saldo actual</span>
                  <strong>{formatMoney(selectedAccount.balanceCents)}</strong>
                </div>
              </div>

              {selectedAccount.reconstructionDeltaCents !== null && selectedAccount.reconstructionDeltaCents !== 0 ? (
                <div className={styles.integrityNotice}>
                  <strong>Saldo bancario prioritario.</strong>{" "}
                  La reconstrucción por movimientos difiere en {formatMoney(Math.abs(selectedAccount.reconstructionDeltaCents))}; se muestra el saldo explícito del banco como fuente de verdad.
                </div>
              ) : null}

              {loadingDetail ? <div className={styles.loading}>Actualizando detalle…</div> : null}

              {snapshot ? (
                <>
                  <div className={styles.metrics} aria-label="Resumen del periodo de la cuenta">
                    <article><span>Ingresos</span><strong>{formatMoney(snapshot.period.incomeCents)}</strong></article>
                    <article><span>Gastos</span><strong>{formatMoney(snapshot.period.expenseCents)}</strong></article>
                    <article><span>Balance neto</span><strong>{formatMoney(snapshot.period.operatingNetCents)}</strong></article>
                    <article><span>Transferencias</span><strong>{formatMoney(snapshot.period.transfers.grossCents)}</strong><small>No computan como ahorro</small></article>
                  </div>

                  <section className={styles.evolutionSection} aria-labelledby="account-evolution-title">
                    <div className={styles.sectionHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>EVOLUCIÓN</p>
                        <h3 id="account-evolution-title">Actividad mensual</h3>
                      </div>
                      <span>{formatDate(snapshot.period.dateFrom)} — {formatDate(snapshot.period.dateTo)}</span>
                    </div>

                    <div className={styles.legend} aria-hidden="true">
                      <span><i className={styles.incomeDot} />Ingresos</span>
                      <span><i className={styles.expenseDot} />Gastos</span>
                      <span><i className={styles.netDot} />Neto</span>
                    </div>

                    <div className={styles.monthlyChart} role="list" aria-label="Ingresos, gastos y balance neto por mes">
                      {snapshot.monthly.rows.map((row) => (
                        <div className={styles.monthRow} role="listitem" key={row.monthStart}>
                          <strong className={styles.monthLabel}>{formatMonth(row.monthStart)}</strong>
                          <div className={styles.bars}>
                            <div className={styles.barTrack} title={`Ingresos ${formatMoney(row.incomeCents)}`}>
                              <span className={styles.incomeBar} style={{ width: `${Math.max(2, (row.incomeCents / scale) * 100)}%` }} />
                            </div>
                            <div className={styles.barTrack} title={`Gastos ${formatMoney(row.expenseCents)}`}>
                              <span className={styles.expenseBar} style={{ width: `${Math.max(2, (row.expenseCents / scale) * 100)}%` }} />
                            </div>
                            <div className={styles.barTrack} title={`Neto ${formatMoney(row.operatingNetCents)}`}>
                              <span className={row.operatingNetCents >= 0 ? styles.netBar : styles.negativeBar} style={{ width: `${Math.max(2, (Math.abs(row.operatingNetCents) / scale) * 100)}%` }} />
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
                  <Link className={styles.secondaryLink} href="/transactions">Abrir Movimientos</Link>
                </div>

                {transactions && transactions.rows.length === 0 ? (
                  <p className={styles.emptyMovements}>No hay movimientos en el periodo.</p>
                ) : null}
                <div className={styles.movementList}>
                  {transactions?.rows.map((transaction) => (
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
                {transactions && transactions.totalCount > transactions.rows.length ? (
                  <p className={styles.moreHint}>Mostrando {transactions.rows.length} de {transactions.totalCount} movimientos de la cuenta en el periodo.</p>
                ) : null}
              </section>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
