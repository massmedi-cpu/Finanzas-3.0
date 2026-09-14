"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FinancialBarChart } from "../src/design/financial-bar-chart";
import { ProductIcon as Icon } from "../src/design/product-icons";
import styles from "./dashboard.module.css";

type TransactionKind = "income" | "expense" | "transfer" | "refund" | "adjustment";
type ReviewState = "confirmed" | "pending" | "needs_review";
type DashboardSource = "financial" | "monthly" | "budgets" | "forecast" | "transactions";
type DashboardScope = "primary" | "secondary";

type AccountBalance = {
  id: string;
  name: string;
  type: string;
  lifecycle: "active" | "archived";
  balanceCents: number;
  balanceSource: "bank_explicit" | "reconstructed";
  explicitBalanceDate: string | null;
  reconstructionDeltaCents: number | null;
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
    transfers: { grossCents: number };
    quality: {
      suspectedDuplicateRows: number;
      signMismatchRows: number;
    };
  };
  balances: {
    asOfDate: string | null;
    activeBalanceCents: number;
    quality: {
      accounts: number;
      explicitBalanceAccounts: number;
      reconstructedBalanceAccounts: number;
      integrityDeltaAccounts: number;
    };
    accounts: AccountBalance[];
  };
  principles: {
    bankSource: "read_only";
    transfersExcludedFromSavings: boolean;
    explicitBankBalancePreferred: boolean;
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
  origin: "known" | "recurring" | "budget" | "manual" | "inferred";
  confidence: "high" | "medium" | "low";
  status: "planned" | "excluded" | "confirmed";
  affectsProjection: boolean;
};
type ForecastSnapshot = {
  period: { dateFrom: string; dateTo: string; accountId: string | null };
  summary: {
    openingBalanceCents: number;
    projectedIncomeCents: number;
    projectedExpenseCents: number;
    projectedNetCents: number;
    projectedClosingBalanceCents: number;
    plannedItems: number;
    excludedItems: number;
    confirmedItems: number;
  };
  items: ForecastItem[];
};

type TransactionRow = {
  id: string;
  bankDate: string;
  amountCents: number;
  account: { id: string; name: string };
  concept: { effective: string };
  merchant?: {
    originalId: string | null;
    originalName: string | null;
    effectiveId: string | null;
    effectiveName: string | null;
  };
  category: { effectiveName: string | null };
  kind: { effective: TransactionKind };
  reviewState?: { original: ReviewState; effective: ReviewState };
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
  generatedAt: string;
  requestedSources: DashboardSource[];
  failedSources: DashboardSource[];
  data: DashboardData;
};

type AttentionItem = {
  id: string;
  tone: "warning" | "danger";
  text: string;
  href: string;
  linkLabel: string;
};

const ALL_SOURCES: DashboardSource[] = [
  "financial",
  "monthly",
  "budgets",
  "forecast",
  "transactions",
];
const PRIMARY_SOURCES: DashboardSource[] = ["financial"];
const SECONDARY_SOURCES: DashboardSource[] = [
  "monthly",
  "budgets",
  "forecast",
  "transactions",
];
const PRIVACY_KEY = "financial-app:home-amounts";

const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});
const percent = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "Europe/Madrid",
});
const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  timeZone: "Europe/Madrid",
});

function emptyDashboardData(): DashboardData {
  return {
    financial: null,
    monthly: null,
    budgets: null,
    forecast: null,
    transactions: null,
  };
}

function formatMoney(cents: number) {
  return money.format(cents / 100);
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

function formatDate(date: string | null) {
  return date
    ? dateFormatter.format(new Date(`${date}T12:00:00Z`)).replace(".", "")
    : "Sin fecha";
}

function formatMonth(date: string) {
  return monthFormatter.format(new Date(`${date}T12:00:00Z`)).replace(".", "");
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 15, 12)));
}

async function readJson<T>(url: string, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`request_failed_${response.status}`);
    return response.json() as Promise<T>;
  } finally {
    window.clearTimeout(timer);
  }
}

function accountType(type: string) {
  return (
    {
      checking: "Cuenta corriente",
      savings: "Ahorro",
      credit: "Crédito",
      cash: "Efectivo",
      investment: "Inversión",
      other: "Cuenta",
    } as Record<string, string>
  )[type] ?? "Cuenta";
}

function kindLabel(kind: TransactionKind) {
  if (kind === "income") return "Ingreso";
  if (kind === "expense") return "Gasto";
  if (kind === "transfer") return "Transferencia";
  if (kind === "refund") return "Devolución";
  return "Ajuste";
}

function forecastOrigin(origin: ForecastItem["origin"]) {
  return (
    {
      known: "Conocido",
      recurring: "Recurrente",
      budget: "Presupuesto",
      manual: "Manual",
      inferred: "Inferido",
    } as Record<ForecastItem["origin"], string>
  )[origin];
}

function sourceLegacyUrl(source: DashboardSource, today: string) {
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const forecastTo = addDays(today, 30);

  if (source === "financial") {
    return `/api/financial?mode=snapshot&dateFrom=${monthStart}&dateTo=${today}`;
  }
  if (source === "monthly") {
    return `/api/financial?mode=monthly&dateFrom=${yearStart}&dateTo=${today}`;
  }
  if (source === "budgets") return `/api/budgets?month=${month}`;
  if (source === "forecast") {
    return `/api/forecast?dateFrom=${today}&dateTo=${forecastTo}`;
  }
  return "/api/transactions?limit=6";
}

function SourceUnavailable({
  testId,
  children,
}: {
  testId: string;
  children: ReactNode;
}) {
  return (
    <p className={styles.empty} data-testid={testId} role="status">
      {children}
    </p>
  );
}

function SectionLoading() {
  return (
    <div className={styles.sectionLoading} role="status">
      <span className={styles.loadingPulse} aria-hidden="true" />
      <p>Preparando tu resumen financiero…</p>
    </div>
  );
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData>(emptyDashboardData);
  const [pendingSources, setPendingSources] = useState<DashboardSource[]>(ALL_SOURCES);
  const [failedSources, setFailedSources] = useState<DashboardSource[]>([]);
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

    function commitSource(
      source: DashboardSource,
      value: DashboardData[DashboardSource],
      failed: boolean,
    ) {
      if (cancelled) return;
      setData((current) => ({ ...current, [source]: value } as DashboardData));
      setPendingSources((current) => current.filter((item) => item !== source));
      setFailedSources((current) => {
        if (failed) {
          return current.includes(source) ? current : [...current, source];
        }
        return current.filter((item) => item !== source);
      });
    }

    async function loadLegacySource(source: DashboardSource) {
      try {
        const value = await readJson<DashboardData[DashboardSource]>(
          sourceLegacyUrl(source, today),
        );
        commitSource(source, value, false);
      } catch {
        commitSource(source, null, true);
      }
    }

    async function loadScope(scope: DashboardScope, sources: DashboardSource[]) {
      try {
        const envelope = await readJson<DashboardEnvelope>(
          `/api/dashboard?scope=${scope}`,
          4_000,
        );

        await Promise.all(
          sources.map(async (source) => {
            const value = envelope.data[source];
            if (value !== null && !envelope.failedSources.includes(source)) {
              commitSource(source, value, false);
              return;
            }
            await loadLegacySource(source);
          }),
        );
      } catch {
        await Promise.all(sources.map((source) => loadLegacySource(source)));
      }
    }

    void Promise.all([
      loadScope("primary", PRIMARY_SOURCES),
      loadScope("secondary", SECONDARY_SOURCES),
    ]);

    return () => {
      cancelled = true;
    };
  }, []);

  const revealAmounts = privacyReady && amountsVisible;
  const displayMoney = (cents: number) =>
    revealAmounts ? formatMoney(cents) : "••••,•• €";

  const financialLoading = pendingSources.includes("financial");
  const monthlyLoading = pendingSources.includes("monthly");
  const budgetLoading = pendingSources.includes("budgets");
  const forecastLoading = pendingSources.includes("forecast");
  const transactionsLoading = pendingSources.includes("transactions");
  const loading = pendingSources.length > 0;
  const hasAnyData = ALL_SOURCES.some((source) => data[source] !== null);

  const activeAccounts = useMemo(
    () =>
      data.financial?.balances.accounts.filter(
        (account) => account.lifecycle === "active",
      ) ?? [],
    [data.financial],
  );

  const topBudgetCategories = useMemo(
    () =>
      data.budgets?.categories
        .filter((item) => item.categoryName && item.actualExpenseCents > 0)
        .sort((a, b) => b.actualExpenseCents - a.actualExpenseCents)
        .slice(0, 4) ?? [],
    [data.budgets],
  );

  const upcomingItems = useMemo(
    () =>
      data.forecast?.items
        .filter((item) => item.affectsProjection && item.status === "planned")
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4) ?? [],
    [data.forecast],
  );

  const monthlyScale = useMemo(
    () =>
      Math.max(
        1,
        ...(data.monthly?.rows.flatMap((row) => [
          row.incomeCents,
          row.expenseCents,
          Math.abs(row.operatingNetCents),
        ]) ?? [1]),
      ),
    [data.monthly],
  );

  const monthlyComparison = useMemo(() => {
    const rows = data.monthly?.rows ?? [];
    if (rows.length === 0) return null;
    const current = rows[rows.length - 1];
    const previous = rows.length > 1 ? rows[rows.length - 2] : null;
    const delta = previous
      ? current.operatingNetCents - previous.operatingNetCents
      : null;
    const deltaPercent =
      previous && previous.operatingNetCents !== 0 && delta !== null
        ? (delta / Math.abs(previous.operatingNetCents)) * 100
        : null;
    return { current, previous, delta, deltaPercent };
  }, [data.monthly]);

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    const financial = data.financial;
    const budgets = data.budgets;
    const forecast = data.forecast;

    if (forecast && forecast.summary.projectedClosingBalanceCents < 0) {
      items.push({
        id: "forecast-negative",
        tone: "danger",
        text: "La previsión de los próximos 30 días termina con saldo negativo.",
        href: "/forecast",
        linkLabel: "Revisar previsión",
      });
    }

    const budgetAlerts =
      budgets?.categories.filter(
        (item) =>
          item.status === "over" ||
          (item.progressBps !== null && item.progressBps >= 8_500),
      ) ?? [];
    if (budgetAlerts.length > 0) {
      const over = budgetAlerts.filter((item) => item.status === "over").length;
      items.push({
        id: "budget-limit",
        tone: over > 0 ? "danger" : "warning",
        text:
          over > 0
            ? `${over.toLocaleString("es-ES")} ${
                over === 1 ? "categoría ha" : "categorías han"
              } superado el presupuesto.`
            : `${budgetAlerts.length.toLocaleString("es-ES")} ${
                budgetAlerts.length === 1 ? "categoría está" : "categorías están"
              } cerca del límite.`,
        href: "/budgets",
        linkLabel: "Ver presupuestos",
      });
    }

    const qualityAlerts =
      (financial?.period.quality.suspectedDuplicateRows ?? 0) +
      (financial?.period.quality.signMismatchRows ?? 0);
    if (qualityAlerts > 0) {
      items.push({
        id: "data-quality",
        tone: "warning",
        text: `Hay ${qualityAlerts.toLocaleString("es-ES")} ${
          qualityAlerts === 1 ? "movimiento que conviene revisar" : "movimientos que conviene revisar"
        }.`,
        href: "/review",
        linkLabel: "Revisar movimientos",
      });
    }

    if ((financial?.balances.quality.integrityDeltaAccounts ?? 0) > 0) {
      items.push({
        id: "account-integrity",
        tone: "warning",
        text: "Hay una diferencia de reconstrucción en al menos una cuenta; prevalece el saldo bancario.",
        href: "/accounts",
        linkLabel: "Abrir cuentas",
      });
    }

    return items.slice(0, 3);
  }, [data.financial, data.budgets, data.forecast]);

  function toggleAmounts() {
    const next = !amountsVisible;
    setAmountsVisible(next);
    setPrivacyReady(true);
    try {
      localStorage.setItem(PRIVACY_KEY, next ? "visible" : "hidden");
    } catch {
      // The preference is optional; privacy still works for the current session.
    }
  }

  if (!loading && !hasAnyData) {
    return (
      <main className={styles.shell}>
        <section className={styles.errorCard} role="alert">
          <p className={styles.eyebrow}>Inicio</p>
          <h1>No se ha podido cargar Inicio</h1>
          <p>La información necesaria no está disponible ahora mismo.</p>
          <Link href="/accounts" className={styles.primaryLink}>
            Abrir Cuentas
          </Link>
        </section>
      </main>
    );
  }

  const financial = data.financial;
  const monthly = data.monthly;
  const budgets = data.budgets;
  const forecast = data.forecast;
  const transactions = data.transactions;

  const savingsRate = financial
    ? financial.period.savingsRateBps === null
      ? "Sin dato"
      : `${percent.format(financial.period.savingsRateBps / 100)} %`
    : null;
  const budgetProgress = budgets
    ? budgets.total.progressBps === null
      ? 0
      : Math.min(100, budgets.total.progressBps / 100)
    : 0;
  const allBalancesExplicit = financial
    ? financial.balances.quality.accounts > 0 &&
      financial.balances.quality.explicitBalanceAccounts ===
        financial.balances.quality.accounts
    : false;

  return (
    <main className={styles.shell} aria-busy={loading}>
      <header className={styles.hero}>
        <div className={styles.heroTitle}>
          <p className={styles.eyebrow}>Inicio</p>
          <h1>Tu dinero, claro en segundos.</h1>
        </div>

        <div className={styles.balanceSummary} aria-label="Saldo total en cuentas">
          <div>
            <span>Saldo total en cuentas</span>
            {financial ? (
              <>
                <strong>{displayMoney(financial.balances.activeBalanceCents)}</strong>
                <small>
                  {allBalancesExplicit
                    ? "Confirmado por el banco"
                    : "Saldos bancarios y reconstruidos"}{" "}
                  · {formatDate(financial.balances.asOfDate)}
                </small>
              </>
            ) : financialLoading ? (
              <>
                <strong>Preparando…</strong>
                <small>Consultando saldos de forma segura.</small>
              </>
            ) : (
              <>
                <strong data-testid="dashboard-balance-unavailable">No disponible</strong>
                <small>El resto del resumen sigue operativo.</small>
              </>
            )}
          </div>
          <button
            type="button"
            className={styles.privacyButton}
            onClick={toggleAmounts}
            aria-pressed={!revealAmounts}
            aria-label={revealAmounts ? "Ocultar importes" : "Mostrar importes"}
          >
            <span>{revealAmounts ? "Ocultar importes" : "Mostrar importes"}</span>
          </button>
        </div>
      </header>

      {attentionItems.length > 0 && (
        <section className={styles.attention} aria-label="Necesita atención">
          <div className={styles.attentionTitle}>
            <Icon name="warning" />
            <strong>Necesita atención</strong>
          </div>
          <div className={styles.attentionList}>
            {attentionItems.map((item) => (
              <div
                key={item.id}
                className={`${styles.attentionItem} ${
                  item.tone === "danger" ? styles.attentionDanger : ""
                }`}
              >
                <span>{item.text}</span>
                <Link href={item.href}>{item.linkLabel}</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.grid} aria-label="Resumen financiero">
        <article className={`${styles.panel} ${styles.panorama}`}>
          <div className={styles.panelHeader}>
            <div className={styles.iconBox}>
              <Icon name="wallet" />
            </div>
            <div>
              <span className={styles.kicker}>Panorama</span>
              <h2>Tus cuentas</h2>
            </div>
            <Link href="/accounts" className={styles.iconLink} aria-label="Abrir Cuentas">
              <Icon name="arrow" />
            </Link>
          </div>

          {financial ? (
            <>
              <div className={styles.accountList}>
                {activeAccounts.map((account) => (
                  <div className={styles.accountRow} key={account.id}>
                    <div>
                      <strong>{account.name}</strong>
                      <span>
                        {accountType(account.type)} ·{" "}
                        {account.balanceSource === "bank_explicit"
                          ? "saldo bancario"
                          : "reconstruido"}
                      </span>
                    </div>
                    <strong>{displayMoney(account.balanceCents)}</strong>
                  </div>
                ))}
                {activeAccounts.length === 0 && (
                  <p className={styles.empty}>No hay cuentas activas.</p>
                )}
              </div>
              {financial.balances.quality.integrityDeltaAccounts > 0 && (
                <p className={styles.notice}>
                  Hay cuentas con diferencia de reconstrucción; prevalece el saldo
                  bancario explícito.
                </p>
              )}
            </>
          ) : financialLoading ? (
            <SectionLoading />
          ) : (
            <SourceUnavailable
              testId="dashboard-accounts-unavailable"
              children="Las cuentas no están disponibles ahora. Puedes seguir usando el resto de Inicio."
            />
          )}
        </article>

        <article className={`${styles.panel} ${styles.monthBalance}`}>
          <div className={styles.panelHeader}>
            <div className={styles.iconBox}>
              <Icon name="balance" />
            </div>
            <div>
              <span className={styles.kicker}>Este mes</span>
              <h2>Balance</h2>
            </div>
          </div>

          {financial ? (
            <>
              <div className={styles.metricGrid}>
                <div>
                  <span>Ingresos</span>
                  <strong>{displayMoney(financial.period.incomeCents)}</strong>
                </div>
                <div>
                  <span>Gastos</span>
                  <strong>{displayMoney(financial.period.expenseCents)}</strong>
                </div>
                <div>
                  <span>Balance neto</span>
                  <strong
                    className={
                      financial.period.operatingNetCents < 0 ? styles.negative : styles.positive
                    }
                  >
                    {displayMoney(financial.period.operatingNetCents)}
                  </strong>
                </div>
                <div>
                  <span>Tasa de ahorro</span>
                  <strong>{savingsRate}</strong>
                </div>
              </div>
              <p className={styles.panelFoot}>
                Las transferencias internas ({displayMoney(financial.period.transfers.grossCents)})
                no computan como ahorro.
              </p>
            </>
          ) : financialLoading ? (
            <SectionLoading />
          ) : (
            <SourceUnavailable
              testId="dashboard-period-unavailable"
              children="El balance del mes no está disponible ahora."
            />
          )}
        </article>

        <article className={`${styles.panel} ${styles.evolution}`}>
          <div className={styles.panelHeader}>
            <div className={styles.iconBox}>
              <Icon name="chart" />
            </div>
            <div>
              <span className={styles.kicker}>Año actual</span>
              <h2>Evolución financiera</h2>
            </div>
          </div>

          {monthly ? (
            monthly.rows.length ? (
              <>
                {monthlyComparison && (
                  <div className={styles.evolutionSummary}>
                    <span>Balance neto del último mes</span>
                    <strong
                      className={
                        monthlyComparison.current.operatingNetCents < 0
                          ? styles.negative
                          : styles.positive
                      }
                    >
                      {displayMoney(monthlyComparison.current.operatingNetCents)}
                    </strong>
                    <small>
                      {monthlyComparison.previous && monthlyComparison.delta !== null
                        ? `${monthlyComparison.delta >= 0 ? "+" : ""}${displayMoney(
                            monthlyComparison.delta,
                          )}${
                            monthlyComparison.deltaPercent === null
                              ? ""
                              : ` · ${
                                  monthlyComparison.deltaPercent >= 0 ? "+" : ""
                                }${percent.format(monthlyComparison.deltaPercent)} %`
                          } frente al mes anterior`
                        : "Aún no hay un mes anterior comparable"}
                    </small>
                  </div>
                )}
                <FinancialBarChart
                  rows={monthly.rows}
                  maxValue={monthlyScale}
                  formatMoney={displayMoney}
                  formatMonth={formatMonth}
                />
              </>
            ) : (
              <p className={styles.empty}>Aún no hay meses con actividad para representar.</p>
            )
          ) : monthlyLoading ? (
            <SectionLoading />
          ) : (
            <SourceUnavailable
              testId="dashboard-monthly-unavailable"
              children="La evolución anual no está disponible ahora."
            />
          )}
        </article>

        <article className={`${styles.panel} ${styles.budget}`}>
          <div className={styles.panelHeader}>
            <div className={styles.iconBox}>
              <Icon name="budget" />
            </div>
            <div>
              <span className={styles.kicker}>
                {budgets ? monthLabel(budgets.month) : "Este mes"}
              </span>
              <h2>Gasto y presupuesto</h2>
            </div>
            <Link
              href="/budgets"
              className={styles.iconLink}
              aria-label="Abrir Presupuestos"
            >
              <Icon name="arrow" />
            </Link>
          </div>

          {budgets ? (
            <>
              <div className={styles.budgetSummary}>
                <div>
                  <span>Gastado</span>
                  <strong>{displayMoney(budgets.total.actualExpenseCents)}</strong>
                </div>
                <div>
                  <span>Disponible</span>
                  <strong
                    className={budgets.total.remainingCents < 0 ? styles.negative : ""}
                  >
                    {displayMoney(budgets.total.remainingCents)}
                  </strong>
                </div>
              </div>

              <div
                className={styles.progressTrack}
                aria-label={`Presupuesto consumido ${percent.format(budgetProgress)} %`}
              >
                <span
                  className={
                    budgetProgress >= 100
                      ? styles.progressDanger
                      : budgetProgress >= 85
                        ? styles.progressWarning
                        : ""
                  }
                  style={{ width: `${budgetProgress}%` }}
                />
              </div>

              <div className={styles.categoryList}>
                {topBudgetCategories.length ? (
                  topBudgetCategories.map((item) => {
                    const share =
                      budgets.total.actualExpenseCents > 0
                        ? (item.actualExpenseCents /
                            budgets.total.actualExpenseCents) *
                          100
                        : 0;
                    const itemProgress =
                      item.progressBps === null
                        ? null
                        : Math.max(0, item.progressBps / 100);
                    return (
                      <div
                        key={item.categoryId ?? item.categoryName}
                        className={styles.categoryRow}
                      >
                        <div>
                          <strong>{item.categoryName}</strong>
                          <span>
                            {percent.format(share)} % del gasto
                            {itemProgress === null
                              ? ""
                              : ` · ${percent.format(itemProgress)} % del presupuesto`}
                          </span>
                        </div>
                        <strong>{displayMoney(item.actualExpenseCents)}</strong>
                      </div>
                    );
                  })
                ) : (
                  <p className={styles.empty}>Sin categorías de gasto este mes.</p>
                )}
              </div>
            </>
          ) : budgetLoading ? (
            <SectionLoading />
          ) : (
            <SourceUnavailable
              testId="dashboard-budget-unavailable"
              children="El presupuesto no está disponible ahora."
            />
          )}
        </article>

        <article className={`${styles.panel} ${styles.future}`}>
          <div className={styles.panelHeader}>
            <div className={styles.iconBox}>
              <Icon name="future" />
            </div>
            <div>
              <span className={styles.kicker}>Próximos 30 días</span>
              <h2>Próximos días</h2>
            </div>
            <Link href="/forecast" className={styles.iconLink} aria-label="Abrir Previsión">
              <Icon name="arrow" />
            </Link>
          </div>

          {forecast ? (
            <>
              <div
                className={`${styles.futureBalance} ${
                  forecast.summary.projectedClosingBalanceCents < 0
                    ? styles.futureBalanceDanger
                    : ""
                }`}
              >
                <span>Saldo previsto al final</span>
                <strong>{displayMoney(forecast.summary.projectedClosingBalanceCents)}</strong>
                <small>
                  Variación prevista {displayMoney(forecast.summary.projectedNetCents)}
                </small>
              </div>

              <div className={styles.forecastMetrics}>
                <div>
                  <span>Ingresos previstos</span>
                  <strong>{displayMoney(forecast.summary.projectedIncomeCents)}</strong>
                </div>
                <div>
                  <span>Gastos previstos</span>
                  <strong>{displayMoney(forecast.summary.projectedExpenseCents)}</strong>
                </div>
              </div>

              <div className={styles.futureList}>
                {upcomingItems.length ? (
                  upcomingItems.map((item) => (
                    <div key={item.id} className={styles.futureRow}>
                      <div>
                        <strong>{item.concept}</strong>
                        <span>
                          {formatDate(item.date)} · {forecastOrigin(item.origin)}
                        </span>
                      </div>
                      <strong>{displayMoney(item.amountCents)}</strong>
                    </div>
                  ))
                ) : (
                  <p className={styles.empty}>
                    No hay movimientos previstos que afecten a la proyección.
                  </p>
                )}
              </div>
            </>
          ) : forecastLoading ? (
            <SectionLoading />
          ) : (
            <SourceUnavailable
              testId="dashboard-forecast-unavailable"
              children="La previsión no está disponible ahora. El resto de Inicio conserva sus datos."
            />
          )}
        </article>

        <article className={`${styles.panel} ${styles.activity}`}>
          <div className={styles.panelHeader}>
            <div className={styles.iconBox}>
              <Icon name="activity" />
            </div>
            <div>
              <span className={styles.kicker}>Últimos movimientos</span>
              <h2>Actividad reciente</h2>
            </div>
            <Link
              href="/transactions"
              className={styles.iconLink}
              aria-label="Abrir Movimientos"
            >
              <Icon name="arrow" />
            </Link>
          </div>

          {transactions ? (
            <div className={styles.transactionList}>
              {transactions.rows.map((transaction) => {
                const merchantName = transaction.merchant?.effectiveName?.trim() || null;
                const primaryName = merchantName ?? transaction.concept.effective;
                const category =
                  transaction.category.effectiveName ??
                  kindLabel(transaction.kind.effective);
                return (
                  <div className={styles.transactionRow} key={transaction.id}>
                    <div>
                      <strong>{primaryName}</strong>
                      <span>
                        {merchantName && merchantName !== transaction.concept.effective
                          ? `${transaction.concept.effective} · `
                          : ""}
                        {formatDate(transaction.bankDate)} · {category}
                      </span>
                    </div>
                    <strong className={styles[`kind_${transaction.kind.effective}`]}>
                      {displayMoney(transaction.amountCents)}
                    </strong>
                  </div>
                );
              })}
              {!transactions.rows.length && (
                <p className={styles.empty}>No hay actividad reciente.</p>
              )}
            </div>
          ) : transactionsLoading ? (
            <SectionLoading />
          ) : (
            <SourceUnavailable
              testId="dashboard-transactions-unavailable"
              children="La actividad reciente no está disponible ahora."
            />
          )}
        </article>
      </section>

      <footer className={styles.footerNote}>
        <span>Fuente bancaria: solo lectura</span>
        {financial && (
          <span>
            {financial.principles.transfersExcludedFromSavings
              ? "Transferencias excluidas del ahorro"
              : "Revisar criterio de transferencias"}
          </span>
        )}
        {financial && (
          <span>
            {financial.balances.quality.explicitBalanceAccounts.toLocaleString("es-ES")}{" "}
            saldos bancarios explícitos
          </span>
        )}
        {failedSources.length > 0 && (
          <span role="status">
            {failedSources.length.toLocaleString("es-ES")} {" "}
            {failedSources.length === 1
              ? "fuente temporalmente no disponible"
              : "fuentes temporalmente no disponibles"}
          </span>
        )}
      </footer>
    </main>
  );
}
