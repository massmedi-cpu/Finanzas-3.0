"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FinancialBarChart } from "../src/design/financial-bar-chart";
import styles from "./inicio.module.css";

type DashboardSource = "financial" | "monthly" | "budgets" | "forecast" | "transactions";
type DashboardScope = "primary" | "secondary";
type TransactionKind = "income" | "expense" | "transfer" | "refund" | "adjustment";

type AccountBalance = {
  id: string;
  name: string;
  type: string;
  lifecycle: "active" | "archived";
  balanceCents: number;
  explicitBalanceDate: string | null;
};

type FinancialSnapshot = {
  period: {
    dateFrom: string | null;
    dateTo: string | null;
    incomeCents: number;
    expenseCents: number;
    operatingNetCents: number;
    savingsCents: number;
    savingsRateBps: number | null;
    quality: {
      suspectedDuplicateRows: number;
      signMismatchRows: number;
    };
  };
  balances: {
    asOfDate: string | null;
    activeBalanceCents: number;
    accounts: AccountBalance[];
  };
};

type MonthlyRow = {
  monthStart: string;
  incomeCents: number;
  expenseCents: number;
  operatingNetCents: number;
};

type MonthlyResponse = {
  dateFrom: string | null;
  dateTo: string | null;
  rows: MonthlyRow[];
};

type BudgetItem = {
  categoryId: string | null;
  categoryName: string | null;
  effectiveAmountCents: number;
  actualExpenseCents: number;
  remainingCents: number;
  progressBps: number | null;
  status: "empty" | "unfunded" | "on_track" | "over";
};

type BudgetSnapshot = {
  month: string;
  total: BudgetItem;
  categories: BudgetItem[];
};

type ForecastItem = {
  id: string;
  date: string;
  concept: string;
  amountCents: number;
  status: "planned" | "excluded" | "confirmed";
  affectsProjection: boolean;
};

type ForecastSnapshot = {
  summary: {
    projectedIncomeCents: number;
    projectedExpenseCents: number;
    projectedNetCents: number;
    projectedClosingBalanceCents: number;
    plannedItems: number;
  };
  items: ForecastItem[];
};

type TransactionRow = {
  id: string;
  bankDate: string;
  amountCents: number;
  account: { id: string; name: string };
  concept: { effective: string };
  merchant?: { effectiveName: string | null };
  category: { effectiveName: string | null };
  kind: { effective: TransactionKind };
  reviewState?: { effective: "confirmed" | "pending" | "needs_review" };
  duplicateState: "none" | "suspected" | "confirmed";
  excludedFromAnalytics: boolean;
};

type TransactionsResponse = {
  rows: TransactionRow[];
  totalCount: number;
};

type DashboardData = {
  financial: FinancialSnapshot | null;
  monthly: MonthlyResponse | null;
  budgets: BudgetSnapshot | null;
  forecast: ForecastSnapshot | null;
  transactions: TransactionsResponse | null;
};

type DashboardEnvelope = {
  contractVersion: 1;
  scope: DashboardScope | "all";
  asOfDate: string;
  dataThroughDate?: string | null;
  generatedAt: string;
  requestedSources: DashboardSource[];
  failedSources: DashboardSource[];
  data: DashboardData;
};

type SyncStatus = {
  run: null | {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    rowsSeen: number;
    rowsInserted: number;
    rowsRevised: number;
    rowsSkipped: number;
    rowsFailed: number;
    errorCode: string | null;
    errorMessage: string | null;
  };
};

const PRIVACY_KEY = "financial-app:home-amounts";
const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});
const percent = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const dayFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});
const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  timeZone: "Europe/Madrid",
});

function emptyData(): DashboardData {
  return { financial: null, monthly: null, budgets: null, forecast: null, transactions: null };
}

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Madrid",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function formatDate(date: string | null | undefined) {
  if (!date) return "sin fecha";
  return dayFormatter.format(new Date(`${date}T12:00:00Z`)).replace(".", "");
}

function formatMonth(date: string) {
  return monthFormatter.format(new Date(`${date}T12:00:00Z`)).replace(".", "");
}

function accountType(type: string) {
  const labels: Record<string, string> = {
    checking: "Cuenta corriente",
    savings: "Ahorro",
    credit: "Crédito",
    cash: "Efectivo",
    investment: "Inversión",
  };
  return labels[type] ?? "Cuenta";
}

function kindLabel(kind: TransactionKind) {
  if (kind === "income") return "Ingreso";
  if (kind === "expense") return "Gasto";
  if (kind === "transfer") return "Transferencia";
  if (kind === "refund") return "Devolución";
  return "Ajuste";
}

async function readJson<T>(url: string, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`request_failed_${response.status}`);
    return response.json() as Promise<T>;
  } finally {
    window.clearTimeout(timer);
  }
}

async function legacySource(source: DashboardSource, today: string) {
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  if (source === "financial") {
    return readJson<FinancialSnapshot>(`/api/financial?mode=snapshot&dateFrom=${monthStart}&dateTo=${today}`);
  }
  if (source === "monthly") {
    return readJson<MonthlyResponse>(`/api/financial?mode=monthly&dateFrom=${yearStart}&dateTo=${today}`);
  }
  if (source === "budgets") return readJson<BudgetSnapshot>(`/api/budgets?month=${month}`);
  if (source === "forecast") {
    return readJson<ForecastSnapshot>(`/api/forecast?dateFrom=${today}&dateTo=${addDays(today, 30)}`);
  }
  return readJson<TransactionsResponse>("/api/transactions?limit=10");
}

export default function InicioClient() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [primaryLoading, setPrimaryLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [failed, setFailed] = useState<DashboardSource[]>([]);
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [privacyReady, setPrivacyReady] = useState(false);

  useEffect(() => {
    try {
      setAmountsVisible(localStorage.getItem(PRIVACY_KEY) !== "hidden");
    } catch {
      setAmountsVisible(true);
    } finally {
      setPrivacyReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const today = madridToday();

    const commit = (source: DashboardSource, value: DashboardData[DashboardSource] | null, isFailed: boolean) => {
      if (cancelled) return;
      setData((current) => ({ ...current, [source]: value } as DashboardData));
      setFailed((current) => {
        const next = new Set(current);
        if (isFailed) next.add(source);
        else next.delete(source);
        return [...next];
      });
    };

    const loadSource = async (source: DashboardSource) => {
      try {
        const value = await legacySource(source, today);
        commit(source, value as DashboardData[DashboardSource], false);
      } catch {
        commit(source, null, true);
      }
    };

    const loadScope = async (scope: DashboardScope, sources: DashboardSource[]) => {
      try {
        const envelope = await readJson<DashboardEnvelope>(`/api/dashboard?scope=${scope}`, 5_000);
        await Promise.all(
          sources.map(async (source) => {
            if (envelope.data[source] !== null && !envelope.failedSources.includes(source)) {
              commit(source, envelope.data[source], false);
            } else {
              await loadSource(source);
            }
          }),
        );
      } catch {
        await Promise.all(sources.map(loadSource));
      }
    };

    void (async () => {
      const statusPromise = readJson<SyncStatus>("/api/source/google/sync", 5_000)
        .then((status) => {
          if (!cancelled) setSyncStatus(status);
        })
        .catch(() => {
          if (!cancelled) setSyncStatus(null);
        });

      await loadScope("primary", ["financial", "transactions"]);
      if (!cancelled) setPrimaryLoading(false);

      await Promise.all([
        loadScope("secondary", ["monthly", "budgets", "forecast"]),
        statusPromise,
      ]);
      if (!cancelled) setSecondaryLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const today = madridToday();
  const currentMonthStart = `${today.slice(0, 7)}-01`;
  const financial = data.financial;
  const transactions = data.transactions;
  const latestDataDate = transactions?.rows?.[0]?.bankDate ?? null;
  const lagDays = latestDataDate ? daysBetween(latestDataDate, today) : null;
  const sourceFailed = syncStatus?.run?.status === "failed";
  const sourceStale = latestDataDate !== null && lagDays !== null && lagDays > 2;
  const sourceNeedsAttention = sourceFailed || sourceStale;
  const revealAmounts = privacyReady && amountsVisible;
  const displayMoney = (cents: number) => (revealAmounts ? money.format(cents / 100) : "••••,•• €");
  const periodSuffix = latestDataDate ? `Hasta ${formatDate(latestDataDate)}` : "Fecha pendiente";

  const activeAccounts = useMemo(
    () => financial?.balances.accounts.filter((account) => account.lifecycle === "active") ?? [],
    [financial],
  );

  const completedMonthlyRows = useMemo(
    () => data.monthly?.rows.filter((row) => row.monthStart < currentMonthStart) ?? [],
    [data.monthly, currentMonthStart],
  );

  const completedComparison = useMemo(() => {
    const rows = completedMonthlyRows;
    if (!rows.length) return null;
    const current = rows.at(-1)!;
    const previous = rows.length > 1 ? rows.at(-2)! : null;
    const delta = previous ? current.operatingNetCents - previous.operatingNetCents : null;
    return { current, previous, delta };
  }, [completedMonthlyRows]);

  const monthlyScale = useMemo(
    () => Math.max(1, ...(data.monthly?.rows.flatMap((row) => [row.incomeCents, row.expenseCents]) ?? [1])),
    [data.monthly],
  );

  const topBudgetCategories = useMemo(
    () => data.budgets?.categories
      .filter((item) => item.categoryName && item.actualExpenseCents > 0)
      .sort((a, b) => b.actualExpenseCents - a.actualExpenseCents)
      .slice(0, 4) ?? [],
    [data.budgets],
  );

  const upcomingItems = useMemo(
    () => data.forecast?.items
      .filter((item) => item.affectsProjection && item.status === "planned")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4) ?? [],
    [data.forecast],
  );

  const overBudgetCount = data.budgets?.categories.filter((item) => item.status === "over").length ?? 0;
  const pendingRecent = transactions?.rows.filter((row) => row.reviewState?.effective !== "confirmed").length ?? 0;

  return (
    <main className={styles.shell} aria-busy={primaryLoading || secondaryLoading}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Financial App</p>
          <h1>Inicio</h1>
        </div>
        <button
          type="button"
          className={styles.privacyButton}
          aria-pressed={!revealAmounts}
          aria-label={revealAmounts ? "Ocultar importes" : "Mostrar importes"}
          onClick={() => {
            const next = !amountsVisible;
            setAmountsVisible(next);
            try {
              localStorage.setItem(PRIVACY_KEY, next ? "visible" : "hidden");
            } catch {}
          }}
        >
          {revealAmounts ? "Ocultar importes" : "Mostrar importes"}
        </button>
      </header>

      {sourceNeedsAttention && (
        <section className={styles.syncWarning} aria-labelledby="sync-warning-title">
          <div>
            <strong id="sync-warning-title">Los datos bancarios no están al día</strong>
            <p>
              {latestDataDate
                ? `Los últimos movimientos importados llegan hasta el ${formatDate(latestDataDate)}.`
                : "No se ha podido confirmar la fecha del último movimiento importado."}
              {sourceFailed ? " La última sincronización terminó con error." : ""}
            </p>
          </div>
          <div className={styles.syncActions}>
            <a className={styles.primaryAction} href="/api/source/google/connect">Reconectar Google</a>
            <Link className={styles.secondaryAction} href="/configuration/source">Ver fuente</Link>
          </div>
        </section>
      )}

      <section className={styles.summary} aria-label="Resumen financiero principal">
        <article className={styles.metric}>
          <span>Disponible</span>
          <strong>{financial ? displayMoney(financial.balances.activeBalanceCents) : "—"}</strong>
          <small>{periodSuffix}</small>
        </article>
        <article className={styles.metric}>
          <span>Ingresos del mes</span>
          <strong>{financial ? displayMoney(financial.period.incomeCents) : "—"}</strong>
          <small>{periodSuffix}</small>
        </article>
        <article className={styles.metric}>
          <span>Gastos del mes</span>
          <strong>{financial ? displayMoney(financial.period.expenseCents) : "—"}</strong>
          <small>{periodSuffix}</small>
        </article>
        <article className={styles.metric}>
          <span>Balance del mes</span>
          <strong className={financial && financial.period.operatingNetCents < 0 ? styles.negative : styles.positive}>
            {financial ? displayMoney(financial.period.operatingNetCents) : "—"}
          </strong>
          <small>{periodSuffix}</small>
        </article>
        <article className={styles.metric}>
          <span>Tasa de ahorro</span>
          <strong>
            {financial?.period.savingsRateBps === null || financial?.period.savingsRateBps === undefined
              ? "—"
              : `${percent.format(financial.period.savingsRateBps / 100)} %`}
          </strong>
          <small>{periodSuffix}</small>
        </article>
      </section>

      <section className={styles.signalRow} aria-label="Situación rápida">
        <div><span>Último movimiento</span><strong>{latestDataDate ? formatDate(latestDataDate) : "—"}</strong></div>
        <div><span>Movimientos cargados</span><strong>{transactions?.totalCount ?? "—"}</strong></div>
        <div><span>Pendientes entre los últimos 10</span><strong>{transactions ? pendingRecent : "—"}</strong></div>
        <div><span>Presupuestos excedidos</span><strong>{data.budgets ? overBudgetCount : "—"}</strong></div>
      </section>

      <section className={styles.grid}>
        <article className={`${styles.card} ${styles.evolution}`}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.kicker}>Evolución</span>
              <h2>Ingresos, gastos y balance</h2>
            </div>
            <Link href="/analysis">Abrir análisis</Link>
          </div>
          {data.monthly ? (
            <>
              {completedComparison && (
                <div className={styles.chartSummary}>
                  <span>Último mes completo · {formatMonth(completedComparison.current.monthStart)}</span>
                  <strong className={completedComparison.current.operatingNetCents < 0 ? styles.negative : styles.positive}>
                    {displayMoney(completedComparison.current.operatingNetCents)}
                  </strong>
                  {completedComparison.delta !== null && (
                    <small>
                      {completedComparison.delta >= 0 ? "+" : ""}{displayMoney(completedComparison.delta)} frente al mes anterior
                    </small>
                  )}
                </div>
              )}
              <FinancialBarChart
                rows={data.monthly.rows}
                maxValue={monthlyScale}
                formatMoney={displayMoney}
                formatMonth={formatMonth}
                partialMonthStart={data.monthly.rows.some((row) => row.monthStart === currentMonthStart) ? currentMonthStart : null}
              />
              {latestDataDate && latestDataDate.startsWith(today.slice(0, 7)) && (
                <p className={styles.chartNote}>El mes actual es parcial: solo incluye movimientos importados hasta el {formatDate(latestDataDate)}.</p>
              )}
            </>
          ) : (
            <p className={styles.empty}>{secondaryLoading ? "Cargando evolución…" : "No se pudo cargar la evolución."}</p>
          )}
        </article>

        <article className={`${styles.card} ${styles.accounts}`}>
          <div className={styles.cardHeader}>
            <div><span className={styles.kicker}>Cuentas</span><h2>Disponible por cuenta</h2></div>
            <Link href="/accounts">Ver cuentas</Link>
          </div>
          {activeAccounts.length ? (
            <div className={styles.accountList}>
              {activeAccounts.slice(0, 5).map((account) => (
                <div key={account.id} className={styles.accountRow}>
                  <div><strong>{account.name}</strong><span>{accountType(account.type)}</span></div>
                  <div><strong>{displayMoney(account.balanceCents)}</strong><span>{account.explicitBalanceDate ? `Saldo ${formatDate(account.explicitBalanceDate)}` : "Saldo reconstruido"}</span></div>
                </div>
              ))}
            </div>
          ) : <p className={styles.empty}>{primaryLoading ? "Cargando cuentas…" : "Sin cuentas activas."}</p>}
        </article>

        <article className={`${styles.card} ${styles.budget}`}>
          <div className={styles.cardHeader}>
            <div><span className={styles.kicker}>Este mes</span><h2>Gasto y presupuesto</h2></div>
            <Link href="/budgets">Presupuestos</Link>
          </div>
          {data.budgets ? (
            <>
              <div className={styles.budgetHeadline}>
                <div><span>Gastado</span><strong>{displayMoney(data.budgets.total.actualExpenseCents)}</strong></div>
                <div><span>Presupuestado</span><strong>{displayMoney(data.budgets.total.effectiveAmountCents)}</strong></div>
                <div><span>Restante</span><strong>{displayMoney(data.budgets.total.remainingCents)}</strong></div>
              </div>
              <div className={styles.categoryList}>
                {topBudgetCategories.map((item) => (
                  <div key={item.categoryId ?? item.categoryName ?? "sin-categoria"}>
                    <span>{item.categoryName}</span>
                    <strong>{displayMoney(item.actualExpenseCents)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : <p className={styles.empty}>{secondaryLoading ? "Cargando presupuesto…" : "Sin presupuesto disponible."}</p>}
        </article>

        <article className={`${styles.card} ${styles.forecast}`}>
          <div className={styles.cardHeader}>
            <div><span className={styles.kicker}>Próximos 30 días</span><h2>Lo que viene</h2></div>
            <Link href="/forecast">Previsión</Link>
          </div>
          {data.forecast ? (
            <>
              <div className={styles.forecastHeadline}>
                <span>Saldo proyectado</span>
                <strong className={data.forecast.summary.projectedClosingBalanceCents < 0 ? styles.negative : styles.positive}>
                  {displayMoney(data.forecast.summary.projectedClosingBalanceCents)}
                </strong>
              </div>
              <div className={styles.upcomingList}>
                {upcomingItems.length ? upcomingItems.map((item) => (
                  <div key={item.id}>
                    <span>{formatDate(item.date)}</span>
                    <strong>{item.concept}</strong>
                    <span>{displayMoney(item.amountCents)}</span>
                  </div>
                )) : <p className={styles.empty}>No hay movimientos previstos.</p>}
              </div>
            </>
          ) : <p className={styles.empty}>{secondaryLoading ? "Cargando previsión…" : "Sin previsión disponible."}</p>}
        </article>

        <article className={`${styles.card} ${styles.activity}`}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.kicker}>Datos importados {latestDataDate ? `hasta ${formatDate(latestDataDate)}` : ""}</span>
              <h2>Últimos 10 movimientos</h2>
            </div>
            <Link href="/transactions">Todos los movimientos</Link>
          </div>
          {transactions?.rows.length ? (
            <div className={styles.transactionList}>
              {transactions.rows.slice(0, 10).map((row) => {
                const label = row.merchant?.effectiveName || row.concept.effective;
                return (
                  <div key={row.id} className={styles.transactionRow}>
                    <div className={styles.transactionMain}>
                      <strong>{label}</strong>
                      <span>{row.category.effectiveName ?? kindLabel(row.kind.effective)} · {row.account.name}</span>
                    </div>
                    <div className={styles.transactionMeta}>
                      <strong className={row.amountCents < 0 ? styles.negative : styles.positive}>{displayMoney(row.amountCents)}</strong>
                      <span>{formatDate(row.bankDate)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className={styles.empty}>{primaryLoading ? "Cargando movimientos…" : "No hay movimientos disponibles."}</p>}
        </article>
      </section>

      {failed.length > 0 && (
        <p className={styles.degraded} role="status">Algunos módulos no han podido actualizarse: {failed.join(", ")}.</p>
      )}

      <footer className={styles.footer}>Fuente bancaria oficial en modo solo lectura.</footer>
    </main>
  );
}
