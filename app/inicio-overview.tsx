"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FinancialBarChart } from "../src/design/financial-bar-chart";
import HomeSmartBrief from "./home-smart-brief";
import styles from "./inicio-overview.module.css";

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
    quality: { suspectedDuplicateRows: number; signMismatchRows: number };
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

type MonthlyResponse = { dateFrom: string | null; dateTo: string | null; rows: MonthlyRow[] };

type BudgetItem = {
  categoryId: string | null;
  categoryName: string | null;
  effectiveAmountCents: number;
  actualExpenseCents: number;
  remainingCents: number;
  progressBps: number | null;
  status: "empty" | "unfunded" | "on_track" | "over";
};

type BudgetSnapshot = { month: string; total: BudgetItem; categories: BudgetItem[] };

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
  duplicateState: "none" | "suspected" | "confirmed";
  excludedFromAnalytics: boolean;
};

type TransactionsResponse = { rows: TransactionRow[]; totalCount: number };

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
    id: string;
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
  cursors?: Array<{ sourceRevision: string | null; updatedAt: string }>;
};

type AttentionItem = {
  title: string;
  detail: string;
  href: string;
  action: string;
  tone: "warning" | "danger" | "info";
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
const dateTimeFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});
const monthFormatter = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "Europe/Madrid" });

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

function trailingMonthStart(date: string, months: number) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, 1));
  parsed.setUTCMonth(parsed.getUTCMonth() - Math.max(0, months - 1));
  return parsed.toISOString().slice(0, 10);
}

function formatDate(date: string | null | undefined) {
  if (!date) return "sin fecha";
  return dayFormatter.format(new Date(`${date}T12:00:00Z`)).replace(".", "");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "sin confirmar";
  return dateTimeFormatter.format(new Date(value)).replace(".", "");
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
  const cashFlowStart = trailingMonthStart(today, 12);
  if (source === "financial") {
    return readJson<FinancialSnapshot>(`/api/financial?mode=snapshot&dateFrom=${monthStart}&dateTo=${today}`);
  }
  if (source === "monthly") {
    return readJson<MonthlyResponse>(`/api/financial?mode=monthly&dateFrom=${cashFlowStart}&dateTo=${today}`);
  }
  if (source === "budgets") return readJson<BudgetSnapshot>(`/api/budgets?month=${month}`);
  if (source === "forecast") {
    return readJson<ForecastSnapshot>(`/api/forecast?dateFrom=${today}&dateTo=${addDays(today, 30)}`);
  }
  return readJson<TransactionsResponse>("/api/transactions?limit=10");
}

export default function InicioOverview() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [dataThroughDate, setDataThroughDate] = useState<string | null>(null);
  const [independentSources, setIndependentSources] = useState<DashboardSource[]>([]);
  const [primaryLoading, setPrimaryLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [failed, setFailed] = useState<DashboardSource[]>([]);
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [privacyReady, setPrivacyReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAmountsVisible(localStorage.getItem(PRIVACY_KEY) !== "hidden");
    } catch {
      setAmountsVisible(true);
    } finally {
      setPrivacyReady(true);
    }
  }, []);

  const commit = useCallback((source: DashboardSource, value: DashboardData[DashboardSource] | null, isFailed: boolean) => {
    setData((current) => ({ ...current, [source]: value } as DashboardData));
    setFailed((current) => {
      const next = new Set(current);
      if (isFailed) next.add(source);
      else next.delete(source);
      return [...next];
    });
  }, []);

  const loadSource = useCallback(async (source: DashboardSource) => {
    try {
      const value = await legacySource(source, madridToday());
      setIndependentSources((current) => current.includes(source) ? current : [...current, source]);
      commit(source, value as DashboardData[DashboardSource], false);
    } catch {
      commit(source, null, true);
    }
  }, [commit]);

  const loadScope = useCallback(async (scope: DashboardScope, sources: DashboardSource[]) => {
    try {
      const envelope = await readJson<DashboardEnvelope>(`/api/dashboard?scope=${scope}`, 5_000);
      if (scope === "primary") setDataThroughDate(envelope.dataThroughDate ?? null);
      await Promise.all(sources.map(async (source) => {
        if (envelope.data[source] !== null && !envelope.failedSources.includes(source)) {
          commit(source, envelope.data[source], false);
        } else {
          await loadSource(source);
        }
      }));
    } catch {
      await Promise.all(sources.map(loadSource));
    }
  }, [commit, loadSource]);

  const loadSyncStatus = useCallback(async () => {
    try {
      setSyncStatus(await readJson<SyncStatus>("/api/source/google/sync", 5_000));
    } catch {
      setSyncStatus(null);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    setPrimaryLoading(true);
    setDataThroughDate(null);
    setIndependentSources([]);
    const statusPromise = loadSyncStatus();
    await loadScope("primary", ["financial", "transactions"]);
    setPrimaryLoading(false);
    setSecondaryLoading(true);
    await Promise.all([loadScope("secondary", ["monthly", "budgets", "forecast"]), statusPromise]);
    setSecondaryLoading(false);
  }, [loadScope, loadSyncStatus]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncFeedback(null);
    try {
      const response = await fetch("/api/source/google/sync", {
        method: "POST",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => null) as null | {
        rowsInserted?: number;
        rowsRevised?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload?.error ?? `sync_failed_${response.status}`);
      const changed = (payload?.rowsInserted ?? 0) + (payload?.rowsRevised ?? 0);
      setSyncFeedback(changed > 0 ? `${changed} cambios incorporados.` : "Sin cambios nuevos.");
      await refreshDashboard();
    } catch {
      setSyncFeedback("No se ha podido actualizar. Consulta el estado de la fuente.");
      await loadSyncStatus();
    } finally {
      setSyncing(false);
    }
  }, [loadSyncStatus, refreshDashboard, syncing]);

  const today = madridToday();
  const currentMonthStart = `${today.slice(0, 7)}-01`;
  const financial = data.financial;
  const transactions = data.transactions;
  const latestDataDate = dataThroughDate ?? transactions?.rows?.[0]?.bankDate ?? null;
  const syncRun = syncStatus?.run ?? null;
  const syncFailed = syncRun?.status === "failed";
  const syncSucceeded = syncRun?.status === "success";
  const revealAmounts = privacyReady && amountsVisible;
  const displayMoney = (cents: number) => revealAmounts ? money.format(cents / 100) : "••••,•• €";

  const activeAccounts = useMemo(
    () => financial?.balances.accounts.filter((account) => account.lifecycle === "active") ?? [],
    [financial],
  );

  const homeMonthlyRows = useMemo(() => data.monthly?.rows.slice(-12) ?? [], [data.monthly]);
  const monthlyScale = useMemo(
    () => Math.max(1, ...homeMonthlyRows.flatMap((row) => [Math.abs(row.incomeCents), Math.abs(row.expenseCents)])),
    [homeMonthlyRows],
  );
  const completedMonthlyRows = useMemo(
    () => data.monthly?.rows.filter((row) => row.monthStart < currentMonthStart) ?? [],
    [data.monthly, currentMonthStart],
  );
  const completedComparison = useMemo(() => {
    if (!completedMonthlyRows.length) return null;
    const current = completedMonthlyRows.at(-1)!;
    const previous = completedMonthlyRows.length > 1 ? completedMonthlyRows.at(-2)! : null;
    return { current, previous, delta: previous ? current.operatingNetCents - previous.operatingNetCents : null };
  }, [completedMonthlyRows]);
  const recentExpenseAverage = useMemo(() => {
    const sample = completedMonthlyRows.slice(-3);
    if (!sample.length) return null;
    return {
      cents: Math.round(sample.reduce((sum, row) => sum + row.expenseCents, 0) / sample.length),
      months: sample.length,
    };
  }, [completedMonthlyRows]);

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
  const hasSavingsBase = (financial?.period.incomeCents ?? 0) >= 10_000;

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    if (syncFailed) {
      items.push({
        title: "La última actualización falló",
        detail: "La fuente sigue protegida; puedes reintentar la lectura sin reconectar Google.",
        href: "/configuration/source",
        action: "Ver fuente",
        tone: "danger",
      });
    }
    if ((financial?.period.operatingNetCents ?? 0) < 0) {
      items.push({
        title: "El balance del mes está en negativo",
        detail: `Ingresos ${displayMoney(financial?.period.incomeCents ?? 0)} · gastos ${displayMoney(financial?.period.expenseCents ?? 0)}.`,
        href: "/analysis",
        action: "Abrir análisis",
        tone: "warning",
      });
    }
    if (overBudgetCount > 0) {
      items.push({
        title: `${overBudgetCount} ${overBudgetCount === 1 ? "presupuesto excedido" : "presupuestos excedidos"}`,
        detail: "Hay categorías por encima del límite definido.",
        href: "/budgets",
        action: "Ver presupuestos",
        tone: "danger",
      });
    }
    if ((data.forecast?.summary.projectedClosingBalanceCents ?? 0) < 0) {
      items.push({
        title: "La previsión termina en negativo",
        detail: `Saldo previsto a 30 días: ${displayMoney(data.forecast?.summary.projectedClosingBalanceCents ?? 0)}.`,
        href: "/forecast",
        action: "Ver previsión",
        tone: "danger",
      });
    }
    if (failed.length > 0) {
      items.push({
        title: "Parte del resumen no está disponible",
        detail: "Algún motor no ha respondido y la portada ha mantenido el resto operativo.",
        href: "/configuration",
        action: "Comprobar estado",
        tone: "info",
      });
    }
    return items.slice(0, 3);
  }, [data.forecast, displayMoney, failed.length, financial, overBudgetCount, syncFailed]);

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
            try { localStorage.setItem(PRIVACY_KEY, next ? "visible" : "hidden"); } catch {}
          }}
        >
          {revealAmounts ? "Ocultar importes" : "Mostrar importes"}
        </button>
      </header>

      <section
        className={`${styles.sourceHealth} ${syncFailed ? styles.sourceError : syncSucceeded ? styles.sourceOk : ""}`}
        aria-label="Estado de los datos bancarios"
      >
        <div className={styles.sourceText}>
          <span className={styles.healthDot} aria-hidden="true" />
          <div>
            <strong>
              {syncing
                ? "Actualizando datos…"
                : syncFailed
                  ? "La última actualización falló"
                  : syncSucceeded
                    ? "Última sincronización completada"
                    : "Estado de la fuente pendiente"}
            </strong>
            <p>
              {syncSucceeded && syncRun
                ? `Sincronización ${formatDateTime(syncRun.finishedAt ?? syncRun.startedAt)} · ${latestDataDate ? `movimientos hasta ${formatDate(latestDataDate)}` : "fecha del último movimiento sin confirmar"}.`
                : syncFailed
                  ? "Los datos existentes siguen disponibles. Puedes reintentar la actualización."
                  : latestDataDate
                    ? `Movimientos disponibles hasta ${formatDate(latestDataDate)}.`
                    : "La fecha del último movimiento no está confirmada."}
              {syncFeedback ? ` ${syncFeedback}` : ""}
            </p>
          </div>
        </div>
        <div className={styles.sourceActions}>
          <button type="button" className={styles.primaryAction} onClick={() => void runSync()} disabled={syncing}>
            {syncing ? "Actualizando…" : syncFailed ? "Reintentar actualización" : "Actualizar datos"}
          </button>
          <Link prefetch={false} className={styles.secondaryAction} href="/configuration/source">Ver fuente</Link>
        </div>
      </section>

      {independentSources.length > 0 && !primaryLoading && !secondaryLoading && (
        <p className={styles.provenanceNotice} role="status">
          Resumen recuperado mediante consultas independientes. Algunas cifras pueden corresponder a instantes distintos; consulta cada módulo antes de compararlas.
        </p>
      )}

      <HomeSmartBrief
        month={today.slice(0, 7)}
        loading={primaryLoading || secondaryLoading}
        transactionTotalCount={transactions?.totalCount ?? null}
        latestTransactionId={transactions?.rows?.[0]?.id ?? null}
        latestTransactionDate={latestDataDate}
        incomeCents={financial?.period.incomeCents ?? null}
        expenseCents={financial?.period.expenseCents ?? null}
        operatingNetCents={financial?.period.operatingNetCents ?? null}
        activeBalanceCents={financial?.balances.activeBalanceCents ?? null}
        budgetProgressBps={data.budgets?.total.progressBps ?? null}
        budgetStatus={data.budgets?.total.status ?? null}
        overBudgetCount={data.budgets ? overBudgetCount : null}
        projectedNetCents={data.forecast?.summary.projectedNetCents ?? null}
        projectedClosingBalanceCents={data.forecast?.summary.projectedClosingBalanceCents ?? null}
        plannedItems={data.forecast?.summary.plannedItems ?? null}
        syncState={syncFailed ? "failed" : syncSucceeded ? "success" : "pending"}
        displayMoney={displayMoney}
      />

      <section className={styles.decisionGrid} aria-label="Resumen financiero principal">
        <article className={styles.decisionCard}>
          <span>Saldo total en cuentas</span>
          <strong>{financial ? displayMoney(financial.balances.activeBalanceCents) : "—"}</strong>
          <small>{financial?.balances.asOfDate ? `Saldo a ${formatDate(financial.balances.asOfDate)}` : "Fecha pendiente"}</small>
        </article>
        <article className={styles.decisionCard}>
          <span>Este mes</span>
          <strong className={(financial?.period.operatingNetCents ?? 0) < 0 ? styles.negative : styles.positive}>
            {financial ? displayMoney(financial.period.operatingNetCents) : "—"}
          </strong>
          <small>
            {financial
              ? `Ingresos ${displayMoney(financial.period.incomeCents)} · gastos ${displayMoney(financial.period.expenseCents)}`
              : "Balance pendiente"}
          </small>
          {financial && (
            <small>
              {hasSavingsBase && financial.period.savingsRateBps !== null
                ? `Ahorro ${percent.format(financial.period.savingsRateBps / 100)} %`
                : "Ahorro: sin base suficiente"}
            </small>
          )}
        </article>
        <article className={styles.decisionCard}>
          <span>Próximos 30 días</span>
          <strong className={(data.forecast?.summary.projectedNetCents ?? 0) < 0 ? styles.negative : styles.positive}>
            {data.forecast ? displayMoney(data.forecast.summary.projectedNetCents) : "—"}
          </strong>
          <small>
            {data.forecast
              ? `${data.forecast.summary.plannedItems} previstos · cierre ${displayMoney(data.forecast.summary.projectedClosingBalanceCents)}`
              : "Previsión pendiente"}
          </small>
        </article>
        <article className={styles.decisionCard}>
          <span>Gasto medio mensual</span>
          <strong>{recentExpenseAverage ? displayMoney(recentExpenseAverage.cents) : "—"}</strong>
          <small>
            {recentExpenseAverage
              ? `Media de ${recentExpenseAverage.months} ${recentExpenseAverage.months === 1 ? "mes completo" : "meses completos"}`
              : "Histórico pendiente"}
          </small>
          <Link prefetch={false} className={styles.inlineLink} href="/analysis">Ver cash flow</Link>
        </article>
      </section>

      {attentionItems.length > 0 && (
        <section className={styles.attention} aria-labelledby="attention-title">
          <div className={styles.sectionHeading}>
            <div><span>ATENCIÓN</span><h2 id="attention-title">Necesita tu atención</h2></div>
          </div>
          <div className={styles.attentionGrid}>
            {attentionItems.map((item) => (
              <article key={`${item.title}-${item.href}`} className={`${styles.attentionItem} ${styles[item.tone]}`}>
                <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                <Link prefetch={false} href={item.href}>{item.action}</Link>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className={styles.contentGrid}>
        <article className={`${styles.panel} ${styles.evolutionPanel}`}>
          <div className={styles.sectionHeading}>
            <div><span>CASH FLOW</span><h2>Últimos 12 meses</h2></div>
            <Link prefetch={false} className={styles.panelAction} href="/analysis">Abrir análisis</Link>
          </div>
          {completedComparison && (
            <div className={styles.comparison}>
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
          {homeMonthlyRows.length > 0 ? (
            <FinancialBarChart
              rows={homeMonthlyRows}
              maxValue={monthlyScale}
              formatMoney={displayMoney}
              formatMonth={formatMonth}
              partialMonthStart={homeMonthlyRows.some((row) => row.monthStart === currentMonthStart) ? currentMonthStart : null}
            />
          ) : secondaryLoading ? (
            <div className={styles.skeleton} />
          ) : (
            <p className={styles.empty}>No hay evolución disponible.</p>
          )}
          {latestDataDate && homeMonthlyRows.some((row) => row.monthStart === currentMonthStart) && (
            <p className={styles.helper}>El mes actual es parcial: incluye movimientos importados hasta el {formatDate(latestDataDate)}.</p>
          )}
        </article>

        <article className={`${styles.panel} ${styles.upcomingPanel}`}>
          <div className={styles.sectionHeading}>
            <div><span>PRÓXIMOS DÍAS</span><h2>Qué viene después</h2></div>
            <Link prefetch={false} className={styles.panelAction} href="/forecast">Ver previsión</Link>
          </div>
          {data.forecast ? (
            upcomingItems.length > 0 ? (
              <ul className={styles.compactList}>
                {upcomingItems.map((item) => (
                  <li key={item.id}>
                    <div><strong>{item.concept}</strong><span>{formatDate(item.date)}</span></div>
                    <b className={item.amountCents < 0 ? styles.negative : styles.positive}>{displayMoney(item.amountCents)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>No hay movimientos previstos en los próximos 30 días.</p>
            )
          ) : secondaryLoading ? (
            <div className={styles.skeleton} />
          ) : (
            <p className={styles.empty}>La previsión no está disponible.</p>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><span>CUENTAS</span><h2>Disponible por cuenta</h2></div>
            <Link prefetch={false} className={styles.panelAction} href="/accounts">Ver cuentas</Link>
          </div>
          {activeAccounts.length > 0 ? (
            <ul className={styles.compactList}>
              {activeAccounts.map((account) => (
                <li key={account.id}>
                  <div>
                    <strong>{account.name}</strong>
                    <span>{accountType(account.type)} · saldo {formatDate(account.explicitBalanceDate)}</span>
                  </div>
                  <b>{displayMoney(account.balanceCents)}</b>
                </li>
              ))}
            </ul>
          ) : primaryLoading ? (
            <div className={styles.skeleton} />
          ) : (
            <p className={styles.empty}>No hay cuentas activas disponibles.</p>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><span>ESTE MES</span><h2>Gasto y presupuesto</h2></div>
            <Link prefetch={false} className={styles.panelAction} href="/budgets">Ver presupuestos</Link>
          </div>
          {data.budgets ? (
            <>
              <div className={styles.budgetSummary}>
                <strong>{displayMoney(data.budgets.total.actualExpenseCents)}</strong>
                <span>gastados de {displayMoney(data.budgets.total.effectiveAmountCents)}</span>
                <div
                  className={styles.progressTrack}
                  aria-label={`Presupuesto usado ${Math.max(0, data.budgets.total.progressBps ?? 0) / 100} por ciento`}
                >
                  <span style={{ width: `${Math.min(100, Math.max(0, (data.budgets.total.progressBps ?? 0) / 100))}%` }} />
                </div>
              </div>
              {topBudgetCategories.length > 0 && (
                <ul className={styles.simpleRows}>
                  {topBudgetCategories.map((item) => (
                    <li key={item.categoryId ?? item.categoryName ?? "total"}>
                      <span>{item.categoryName}</span><b>{displayMoney(item.actualExpenseCents)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : secondaryLoading ? (
            <div className={styles.skeleton} />
          ) : (
            <p className={styles.empty}>No hay presupuesto mensual configurado.</p>
          )}
        </article>

        <article className={`${styles.panel} ${styles.activityPanel}`}>
          <div className={styles.sectionHeading}>
            <div><span>ACTIVIDAD</span><h2>Últimos movimientos</h2></div>
            <Link prefetch={false} className={styles.panelAction} href="/transactions">Ver todos</Link>
          </div>
          {transactions?.rows.length ? (
            <ul className={styles.activityList}>
              {transactions.rows.slice(0, 8).map((row) => {
                const mainLabel = row.merchant?.effectiveName?.trim() || row.concept.effective;
                return (
                  <li key={row.id}>
                    <div className={styles.activityMain}>
                      <strong>{mainLabel}</strong>
                      <span>{row.category.effectiveName ?? kindLabel(row.kind.effective)} · {row.account.name}</span>
                    </div>
                    <span className={styles.activityDate}>{formatDate(row.bankDate)}</span>
                    <b className={row.amountCents < 0 ? styles.negative : styles.positive}>{displayMoney(row.amountCents)}</b>
                  </li>
                );
              })}
            </ul>
          ) : primaryLoading ? (
            <div className={styles.skeleton} />
          ) : (
            <p className={styles.empty}>No hay actividad reciente.</p>
          )}
        </article>
      </section>
    </main>
  );
}
