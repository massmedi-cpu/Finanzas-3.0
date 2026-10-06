"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { checkHomeConsistency } from "../src/application/dashboard/home-consistency";
import type { HomeAnalysisSummary } from "../src/application/dashboard/home-analysis";
import {
  hasSourceSyncIncidents,
  normalizeSourceSyncIncidents,
} from "../src/application/source-sync-incidents";
import { formatBasisPoints } from "../src/core/formatters";
import { formatMoneyCents } from "../src/core/money";
import HomeSmartBrief from "./home-smart-brief";
import HomeEvolution from "./home-evolution";
import { CategoryIdentity } from "./category-identity";
import styles from "./inicio-overview.module.css";

type DashboardSource = "financial" | "monthly" | "budgets" | "forecast" | "transactions";
type DashboardScope = "critical" | "activity" | "primary" | "secondary";
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
  categoryId: string | null;
  categoryName: string | null;
  status: "planned" | "excluded" | "confirmed";
  affectsProjection: boolean;
};

type ForecastSnapshot = {
  period: {
    dateFrom: string;
    dateTo: string;
    accountId: string | null;
  };
  summary: {
    openingBalanceCents: number;
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
  category: { effectiveId: string | null; effectiveName: string | null };
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
    rowsMissing: number;
    duplicatesDetected: number;
    warningsCount: number;
    errorCode: string | null;
    errorMessage: string | null;
  };
  cursors?: Array<{ sourceRevision: string | null; updatedAt: string }>;
};

type SyncResult = {
  rowsInserted?: number;
  rowsRevised?: number;
  rowsSkipped?: number;
  rowsMissing?: number;
  duplicatesDetected?: number;
  warningsCount?: number;
  error?: string;
};

type AttentionItem = {
  title: string;
  detail: string;
  href: string;
  action: string;
  tone: "warning" | "danger" | "info";
};

const PRIVACY_KEY = "financial-app:home-amounts";
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

function balanceCoverageLabel(accounts: AccountBalance[]) {
  const active = accounts.filter((account) => account.lifecycle === "active");
  if (active.length === 0) return "Fecha bancaria pendiente";

  const dates = active
    .map((account) => account.explicitBalanceDate)
    .filter((date): date is string => Boolean(date))
    .sort();

  if (dates.length === 0) return "Fecha bancaria de los saldos pendiente";

  const uniqueDates = [...new Set(dates)];
  if (dates.length === active.length && uniqueDates.length === 1) {
    return `Saldo bancario a ${formatDate(uniqueDates[0])}`;
  }

  const first = formatDate(uniqueDates[0]);
  const last = formatDate(uniqueDates.at(-1));
  const range = first === last ? first : `${first} – ${last}`;
  return dates.length === active.length
    ? `Suma de saldos bancarios con fechas distintas · ${range}`
    : `Suma de saldos con cobertura de fechas parcial · ${range}`;
}

function kindLabel(kind: TransactionKind) {
  if (kind === "income") return "Ingreso";
  if (kind === "expense") return "Gasto";
  if (kind === "transfer") return "Transferencia";
  if (kind === "refund") return "Devolución";
  return "Ajuste";
}

function syncFeedbackFromResult(result: SyncResult | null) {
  const changed = Math.max(0, result?.rowsInserted ?? 0) + Math.max(0, result?.rowsRevised ?? 0);
  const incidents = normalizeSourceSyncIncidents(result);
  if (changed === 0 && !hasSourceSyncIncidents(result)) return "Sin cambios nuevos.";

  const parts = [changed > 0 ? `${changed} cambios incorporados.` : "Sin cambios incorporados."];
  if (incidents.missingRows > 0) {
    parts.push(
      incidents.missingRows === 1
        ? "1 movimiento importado anteriormente ya no aparece en la fuente."
        : `${incidents.missingRows} movimientos importados anteriormente ya no aparecen en la fuente.`,
    );
  }
  if (incidents.additionalWarnings > 0) {
    parts.push(
      incidents.additionalWarnings === 1
        ? "1 aviso adicional de sincronización requiere revisión."
        : `${incidents.additionalWarnings} avisos adicionales de sincronización requieren revisión.`,
    );
  }
  if (incidents.duplicates > 0) {
    parts.push(
      incidents.duplicates === 1
        ? "1 posible duplicado detectado."
        : `${incidents.duplicates} posibles duplicados detectados.`,
    );
  }
  if (hasSourceSyncIncidents(result)) parts.push("Revisa la fuente.");
  return parts.join(" ");
}

function syncStatusNotice(run: SyncStatus["run"]) {
  if (!run || run.status !== "success") return null;
  const incidents = normalizeSourceSyncIncidents(run);
  if (!hasSourceSyncIncidents(run)) return null;
  const parts: string[] = [];
  if (incidents.missingRows > 0) {
    parts.push(
      incidents.missingRows === 1
        ? "1 movimiento importado anteriormente ya no aparece en la fuente."
        : `${incidents.missingRows} movimientos importados anteriormente ya no aparecen en la fuente.`,
    );
  }
  if (incidents.additionalWarnings > 0) {
    parts.push(
      incidents.additionalWarnings === 1
        ? "1 aviso adicional de sincronización requiere revisión."
        : `${incidents.additionalWarnings} avisos adicionales de sincronización requieren revisión.`,
    );
  }
  if (incidents.duplicates > 0) {
    parts.push(
      incidents.duplicates === 1
        ? "1 posible duplicado detectado."
        : `${incidents.duplicates} posibles duplicados detectados.`,
    );
  }
  parts.push("Revisa la fuente.");
  return parts.join(" ");
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
  const [activityLoading, setActivityLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [failed, setFailed] = useState<DashboardSource[]>([]);
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [privacyReady, setPrivacyReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [homeAnalysis, setHomeAnalysis] = useState<HomeAnalysisSummary | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);

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
      if (scope === "activity" || scope === "primary") setDataThroughDate(envelope.dataThroughDate ?? null);
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

  const loadHomeAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    try {
      setHomeAnalysis(await readJson<HomeAnalysisSummary>("/api/dashboard/analysis", 8_000));
    } catch {
      setHomeAnalysis(null);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    setPrimaryLoading(true);
    setActivityLoading(true);
    setSecondaryLoading(true);
    setDataThroughDate(null);
    setIndependentSources([]);

    const statusPromise = loadSyncStatus();
    const analysisPromise = loadHomeAnalysis();
    const activityPromise = loadScope("activity", ["transactions"])
      .finally(() => setActivityLoading(false));
    const secondaryPromise = loadScope("secondary", ["monthly", "budgets", "forecast"])
      .finally(() => setSecondaryLoading(false));

    await loadScope("critical", ["financial"]);
    setPrimaryLoading(false);
    await Promise.all([activityPromise, secondaryPromise, statusPromise, analysisPromise]);
  }, [loadHomeAnalysis, loadScope, loadSyncStatus]);

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
      const payload = await response.json().catch(() => null) as SyncResult | null;
      if (!response.ok) throw new Error(payload?.error ?? `sync_failed_${response.status}`);
      setSyncFeedback(syncFeedbackFromResult(payload));
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
  const consistency = checkHomeConsistency({
    financial,
    monthly: data.monthly,
    budget: data.budgets,
    forecast: data.forecast,
    today,
  });
  const budget = consistency.budgetMonthMatches && consistency.budgetActualMatches ? data.budgets : null;
  const forecast = consistency.forecastOpeningBalanceMatches ? data.forecast : null;
  const latestDataDate = dataThroughDate ?? transactions?.rows?.[0]?.bankDate ?? null;
  const syncRun = syncStatus?.run ?? null;
  const syncFailed = syncRun?.status === "failed";
  const syncSucceeded = syncRun?.status === "success";
  const syncHasWarnings = syncSucceeded && hasSourceSyncIncidents(syncRun);
  const syncPersistentNotice = syncFeedback ? null : syncStatusNotice(syncRun);
  const revealAmounts = privacyReady && amountsVisible;
  const displayMoney = (cents: number) => revealAmounts ? formatMoneyCents(cents) : "••••,•• €";

  const activeAccounts = useMemo(
    () => consistency.balancesMatch
      ? financial?.balances.accounts.filter((account) => account.lifecycle === "active") ?? []
      : [],
    [financial, consistency.balancesMatch],
  );

  const homeMonthlyRows = useMemo(
    () => data.monthly?.rows.filter((row) => consistency.currentMonthMatches || row.monthStart !== currentMonthStart).slice(-12) ?? [],
    [data.monthly, consistency.currentMonthMatches, currentMonthStart],
  );
  const monthlyScale = useMemo(
    () => Math.max(1, ...homeMonthlyRows.flatMap((row) => [Math.abs(row.incomeCents), Math.abs(row.expenseCents)])),
    [homeMonthlyRows],
  );
  const completedComparison = useMemo(() => homeAnalysis ? {
    current: {
      monthStart: homeAnalysis.period.dateFrom,
      operatingNetCents: homeAnalysis.netComparison.currentNetCents,
    },
    delta: homeAnalysis.netComparison.deltaCents,
  } : null, [homeAnalysis]);
  const recentExpenseAverage = homeAnalysis?.expenseAverage3m ?? null;

  const topBudgetCategories = useMemo(
    () => budget?.categories
      .filter((item) => item.categoryName && item.actualExpenseCents > 0)
      .sort((a, b) => b.actualExpenseCents - a.actualExpenseCents)
      .slice(0, 4) ?? [],
    [budget],
  );
  const upcomingItems = useMemo(
    () => forecast?.items
      .filter((item) => item.affectsProjection && item.status === "planned")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4) ?? [],
    [forecast],
  );
  const overBudgetCount = budget?.categories.filter((item) => item.status === "over").length ?? 0;
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
    } else if (syncHasWarnings) {
      items.push({
        title: "La última sincronización tiene avisos",
        detail: syncStatusNotice(syncRun) ?? "La sincronización terminó, pero requiere revisión.",
        href: "/configuration/source",
        action: "Revisar fuente",
        tone: "warning",
      });
    }
    const signMismatchRows = financial?.period.quality.signMismatchRows ?? 0;
    if (signMismatchRows > 0) {
      items.push({
        title: `${signMismatchRows} ${signMismatchRows === 1 ? "movimiento con signo incoherente" : "movimientos con signo incoherente"}`,
        detail: "El tipo financiero y el signo bancario no coinciden. No hemos corregido el importe automáticamente.",
        href: "/transactions?signMismatch=true",
        action: "Revisar movimientos",
        tone: "warning",
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
    if ((forecast?.summary.plannedItems ?? 0) > 0
      && (forecast?.summary.projectedClosingBalanceCents ?? 0) < 0) {
      items.push({
        title: "La previsión termina en negativo",
        detail: `Saldo previsto a 30 días: ${displayMoney(forecast?.summary.projectedClosingBalanceCents ?? 0)}.`,
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
  }, [forecast, displayMoney, failed.length, financial, overBudgetCount, syncFailed, syncHasWarnings, syncRun]);

  return (
    <main className={styles.shell} aria-busy={primaryLoading || activityLoading || secondaryLoading || analysisLoading}>
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
        className={`${styles.sourceHealth} ${syncFailed ? styles.sourceError : syncHasWarnings ? styles.sourceWarning : syncSucceeded ? styles.sourceOk : ""}`}
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
                  : syncHasWarnings
                    ? "Sincronización completada con avisos"
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
              {syncPersistentNotice ? ` ${syncPersistentNotice}` : ""}
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

      {independentSources.length > 0 && !primaryLoading && !activityLoading && !secondaryLoading && (
        <p className={styles.provenanceNotice} role="status">
          Resumen recuperado mediante consultas independientes. Algunas cifras pueden corresponder a instantes distintos; consulta cada módulo antes de compararlas.
        </p>
      )}

      {!primaryLoading && !activityLoading && !secondaryLoading && Object.values(consistency).some((matches) => !matches) && (
        <p className={styles.provenanceNotice} role="alert">
          Hay datos que no cuadran entre las fuentes del resumen. Hemos ocultado las cifras afectadas; revisa Cuentas, Análisis y Presupuestos antes de tomar decisiones.
        </p>
      )}

      <HomeSmartBrief
        month={today.slice(0, 7)}
        loading={primaryLoading || activityLoading || secondaryLoading}
        transactionTotalCount={transactions?.totalCount ?? null}
        latestTransactionId={transactions?.rows?.[0]?.id ?? null}
        latestTransactionDate={latestDataDate}
        incomeCents={financial?.period.incomeCents ?? null}
        expenseCents={financial?.period.expenseCents ?? null}
        operatingNetCents={financial?.period.operatingNetCents ?? null}
        activeBalanceCents={consistency.balancesMatch ? financial?.balances.activeBalanceCents ?? null : null}
        budgetProgressBps={budget?.total.progressBps ?? null}
        budgetStatus={budget?.total.status ?? null}
        overBudgetCount={budget ? overBudgetCount : null}
        projectedNetCents={forecast?.summary.projectedNetCents ?? null}
        projectedClosingBalanceCents={forecast?.summary.plannedItems ? forecast.summary.projectedClosingBalanceCents : null}
        plannedItems={forecast?.summary.plannedItems ?? null}
        syncState={syncFailed ? "failed" : syncSucceeded ? "success" : "pending"}
        displayMoney={displayMoney}
      />

      <section className={styles.decisionGrid} aria-label="Resumen financiero principal">
        <article className={styles.decisionCard}>
          <span>Saldo total en cuentas</span>
          <strong>{financial && consistency.balancesMatch ? displayMoney(financial.balances.activeBalanceCents) : "—"}</strong>
          <small>{!consistency.balancesMatch ? "Saldo no conciliado" : financial ? balanceCoverageLabel(financial.balances.accounts) : "Fecha pendiente"}</small>
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
                ? `Ahorro ${formatBasisPoints(financial.period.savingsRateBps, 1, "%", 0)}`
                : "Ahorro: sin base suficiente"}
            </small>
          )}
        </article>
        <article className={styles.decisionCard}>
          <span>Próximos 30 días</span>
          <strong className={(forecast?.summary.projectedNetCents ?? 0) < 0 ? styles.negative : styles.positive}>
            {forecast?.summary.plannedItems ? displayMoney(forecast.summary.projectedNetCents) : forecast ? "Sin previsiones" : "—"}
          </strong>
          <small>
            {forecast?.summary.plannedItems
              ? `${forecast.summary.plannedItems} previstos · cierre ${displayMoney(forecast.summary.projectedClosingBalanceCents)}`
              : forecast ? "Revisa recurrentes o añade un movimiento" : "Previsión pendiente"}
          </small>
          {forecast && !forecast.summary.plannedItems ? <Link prefetch={false} className={styles.inlineLink} href="/forecast">Crear previsión</Link> : null}
        </article>
        <article className={styles.decisionCard}>
          <span>Gasto medio mensual</span>
          <strong>{recentExpenseAverage ? displayMoney(recentExpenseAverage.cents) : "—"}</strong>
          <small>
            {recentExpenseAverage
              ? `Media de ${recentExpenseAverage.months} ${recentExpenseAverage.months === 1 ? "mes completo" : "meses completos"}`
              : analysisLoading ? "Calculando desde Análisis…" : "Análisis no disponible"}
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
            <HomeEvolution
              rows={homeMonthlyRows}
              dateFrom={homeMonthlyRows[0]?.monthStart ?? trailingMonthStart(today, 12)}
              dateTo={today}
              maxValue={monthlyScale}
              formatMoney={displayMoney}
              formatMonth={formatMonth}
              partialMonthStart={homeMonthlyRows.some((row) => row.monthStart === currentMonthStart) ? currentMonthStart : null}
            />
          ) : secondaryLoading ? (
            <div className={styles.skeleton} />
          ) : (
            <p className={styles.empty}>{data.monthly ? "No hay evolución disponible." : "La evolución no está disponible ahora."}</p>
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
          {forecast ? (
            upcomingItems.length > 0 ? (
              <ul className={styles.compactList}>
                {upcomingItems.map((item) => (
                  <li key={item.id}>
                    <div><strong>{item.concept}</strong><span>{formatDate(item.date)}{item.categoryId ? <> · <CategoryIdentity categoryId={item.categoryId} name={item.categoryName} /></> : null}</span></div>
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
          {!consistency.balancesMatch ? (
            <p className={styles.empty}>El saldo total no coincide con el detalle de cuentas. Consulta Cuentas antes de usar esta cifra.</p>
          ) : activeAccounts.length > 0 ? (
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
            <p className={styles.empty}>{financial ? "No hay cuentas activas disponibles." : "Las cuentas no están disponibles ahora."}</p>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><span>ESTE MES</span><h2>Gasto y presupuesto</h2></div>
            <Link prefetch={false} className={styles.panelAction} href="/budgets">Ver presupuestos</Link>
          </div>
          {budget ? (
            <>
              <div className={styles.budgetSummary}>
                <strong>{displayMoney(budget.total.actualExpenseCents)}</strong>
                <span>gastados de {displayMoney(budget.total.effectiveAmountCents)}</span>
                <div
                  className={styles.progressTrack}
                  aria-label={`Presupuesto usado ${Math.max(0, budget.total.progressBps ?? 0) / 100} por ciento`}
                >
                  <span style={{ width: `${Math.min(100, Math.max(0, (budget.total.progressBps ?? 0) / 100))}%` }} />
                </div>
              </div>
              {topBudgetCategories.length > 0 && (
                <ul className={styles.simpleRows}>
                  {topBudgetCategories.map((item) => (
                    <li key={item.categoryId ?? item.categoryName ?? "total"}>
                      <span><CategoryIdentity categoryId={item.categoryId} name={item.categoryName} fallback="Categoría" /></span><b>{displayMoney(item.actualExpenseCents)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : !consistency.budgetMonthMatches ? (
            <p className={styles.empty}>El presupuesto recibido corresponde a otro mes. Abre Presupuestos para revisarlo.</p>
          ) : secondaryLoading ? (
            <div className={styles.skeleton} />
          ) : (
            <p className={styles.empty}>El presupuesto no está disponible ahora.</p>
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
                      <span><CategoryIdentity categoryId={row.category.effectiveId} name={row.category.effectiveName} fallback={kindLabel(row.kind.effective)} /> · {row.account.name}</span>
                    </div>
                    <span className={styles.activityDate}>{formatDate(row.bankDate)}</span>
                    <b className={row.amountCents < 0 ? styles.negative : styles.positive}>{displayMoney(row.amountCents)}</b>
                  </li>
                );
              })}
            </ul>
          ) : activityLoading ? (
            <div className={styles.skeleton} aria-label="Cargando actividad reciente" />
          ) : (
            <p className={styles.empty}>{transactions ? "No hay actividad reciente." : "La actividad reciente no está disponible ahora. El resto del resumen sigue operativo."}</p>
          )}
        </article>
      </section>
    </main>
  );
}
