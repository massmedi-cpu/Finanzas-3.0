"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isDashboardEnvelopeForScope } from "../../src/application/dashboard/dashboard-envelope-integrity";
import { parseHomeBankFreshness, resolveHomeBankCoverage } from "../../src/application/dashboard/home-bank-coverage";
import {
  areForecastItemsWithinSelection,
  isForecastSummaryArithmeticConsistent,
} from "../../src/application/forecast/forecast-contract";
import {
  deriveGlobalAlerts,
  summarizeGlobalAlerts,
  type GlobalAlertInput,
} from "../../src/application/global-alerts";
import {
  hasCompletedSourceSyncEvidence,
  hasSourceSyncIncidents,
  normalizeSourceSyncIncidents,
} from "../../src/application/source-sync-incidents";
import styles from "./alerts.module.css";

type DashboardEnvelope = {
  asOfDate: string;
  dataThroughDate: string | null;
  failedSources: string[];
  data: {
    financial: null | {
      period: {
        dateFrom: string;
        dateTo: string;
        operatingNetCents: number;
        incomeCents: number;
        expenseCents: number;
        quality: {
          suspectedDuplicateRows: number;
          signMismatchRows: number;
        };
      };
    };
    budgets: null | {
      month: string;
      total: {
        effectiveAmountCents: number;
        actualExpenseCents: number;
        remainingCents: number;
        progressBps: number | null;
        status: "empty" | "unfunded" | "on_track" | "over";
      };
      categories: Array<{
        categoryName: string | null;
        effectiveAmountCents: number;
        actualExpenseCents: number;
        remainingCents: number;
        progressBps: number | null;
        status: "empty" | "unfunded" | "on_track" | "over";
      }>;
    };
    forecast: null | {
      period: { dateFrom: string; dateTo: string; accountId: null };
      summary: {
        openingBalanceCents: number;
        projectedIncomeCents: number;
        projectedExpenseCents: number;
        projectedNetCents: number;
        projectedClosingBalanceCents: number;
        plannedItems: number;
      };
      items: Array<{
        id: string;
        date: string;
        concept: string;
        amountCents: number;
        status: "planned" | "excluded" | "confirmed";
        affectsProjection: boolean;
      }>;
    };
  };
};

type SyncStatus = {
  run: null | {
    status: string;
    finishedAt: string | null;
    rowsSeen: number;
    rowsFailed: number;
    rowsMissing: number;
    duplicatesDetected: number;
    warningsCount: number;
  };
};

type TransactionCount = {
  totalCount: number;
};

type DocumentCount = {
  contractVersion: 3;
  total: number;
  limit: number;
  offset: number;
  items: unknown[];
  principles: {
    bankSource: "read_only";
    getHasSideEffects: false;
    suggestionsPersisted: false;
    associationsRequireConfirmation: true;
  };
};

type DocumentSummary = {
  unassociated: number;
  pendingReview: number;
};

type AlertSnapshot = {
  input: GlobalAlertInput;
  degradedReads: string[];
  generatedAt: string;
};

function alertPriorityLabel(tone: "danger" | "warning" | "info") {
  if (tone === "danger") return "Atención prioritaria";
  if (tone === "warning") return "Conviene revisar";
  return "Información útil";
}

const CATEGORY_LABELS = {
  source: "Fuente",
  forecast: "Previsión",
  budget: "Presupuesto",
  transaction: "Movimientos",
  document: "Documentos",
  analysis: "Análisis",
} as const;

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

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonnegativeCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function moneyCents(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function isBudgetAmountRow(value: unknown): boolean {
  if (!isObject(value) || !nonnegativeCount(value.effectiveAmountCents)
    || !nonnegativeCount(value.actualExpenseCents)
    || !moneyCents(value.remainingCents)
    || (value.progressBps !== null && !nonnegativeCount(value.progressBps))
    || !["empty", "unfunded", "on_track", "over"].includes(String(value.status))) return false;
  const effective = value.effectiveAmountCents as number;
  const actual = value.actualExpenseCents as number;
  const remaining = value.remainingCents as number;
  return Number.isSafeInteger(effective - actual)
    && remaining === effective - actual
    && (value.status !== "over" || remaining < 0)
    && (value.status !== "on_track" || remaining >= 0);
}

function isDashboardEnvelope(value: unknown): value is DashboardEnvelope {
  // A 200 response can still contain another dashboard scope, forged money
  // from a failed source, or a partial list of sources. Reject it before
  // deriving financial alerts rather than treating unverified totals as true.
  if (!isDashboardEnvelopeForScope(value, "all") || !isObject(value.data)) return false;
  const data = value.data;
  const day = value.asOfDate;
  const month = day.slice(0, 7);
  if (data.financial !== null) {
    if (!isObject(data.financial) || !isObject(data.financial.period)
      || data.financial.period.dateFrom !== `${month}-01`
      || data.financial.period.dateTo !== day
      || !moneyCents(data.financial.period.operatingNetCents)
      || !nonnegativeCount(data.financial.period.incomeCents)
      || !nonnegativeCount(data.financial.period.expenseCents)
      || !Number.isSafeInteger(
        (data.financial.period.incomeCents as number) - (data.financial.period.expenseCents as number),
      )
      || data.financial.period.operatingNetCents !==
        (data.financial.period.incomeCents as number) - (data.financial.period.expenseCents as number)
      || !isObject(data.financial.period.quality)
      || !nonnegativeCount(data.financial.period.quality.suspectedDuplicateRows)
      || !nonnegativeCount(data.financial.period.quality.signMismatchRows)) return false;
  }
  if (data.budgets !== null) {
    if (!isObject(data.budgets) || data.budgets.month !== month
      || !isBudgetAmountRow(data.budgets.total)
      || !Array.isArray(data.budgets.categories)
      || !data.budgets.categories.every((item: unknown) =>
        isObject(item)
        && (item.categoryName === null || typeof item.categoryName === "string")
        && isBudgetAmountRow(item))) return false;
  }
  if (data.forecast !== null) {
    if (!isObject(data.forecast) || !isObject(data.forecast.summary)
      || !isObject(data.forecast.period)
      || data.forecast.period.dateFrom !== day
      || data.forecast.period.dateTo !== addDays(day, 30)
      || data.forecast.period.accountId !== null
      || !isForecastSummaryArithmeticConsistent(data.forecast.summary)
      || !areForecastItemsWithinSelection(data.forecast.items, data.forecast.period)
      || !nonnegativeCount(data.forecast.summary.plannedItems)
      || !Array.isArray(data.forecast.items)
      || !data.forecast.items.every((item: unknown) =>
        isObject(item)
        && typeof item.date === "string"
        && item.date >= day && item.date <= addDays(day, 30)
        && typeof item.concept === "string"
        && moneyCents(item.amountCents)
        && ["planned", "excluded", "confirmed"].includes(String(item.status))
        && typeof item.affectsProjection === "boolean"
        && item.affectsProjection === (item.status === "planned"))) return false;
  }
  if (data.forecast !== null && isObject(data.forecast)
    && isObject(data.forecast.summary) && Array.isArray(data.forecast.items)
    && data.forecast.summary.plannedItems !== data.forecast.items.filter(
      (item: unknown) => isObject(item) && item.status === "planned",
    ).length) return false;
  return true;
}

function isSyncStatus(value: unknown): value is SyncStatus {
  if (!isObject(value)) return false;
  if (value.run === null) return true;
  return isObject(value.run)
    && ["success", "failed", "started", "partial"].includes(String(value.run.status))
    && (value.run.finishedAt === null || typeof value.run.finishedAt === "string")
    && nonnegativeCount(value.run.rowsSeen)
    && nonnegativeCount(value.run.rowsFailed)
    && (value.run.status !== "success" || hasCompletedSourceSyncEvidence(value.run as NonNullable<SyncStatus["run"]>))
    && nonnegativeCount(value.run.rowsMissing)
    && nonnegativeCount(value.run.duplicatesDetected)
    && nonnegativeCount(value.run.warningsCount);
}

function isTransactionCount(value: unknown): value is TransactionCount {
  return isObject(value) && nonnegativeCount(value.totalCount);
}

async function readJson<T>(url: string, timeoutMs = 8_000, verify?: (value: unknown) => value is T): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`request_failed_${response.status}`);
    const payload: unknown = await response.json();
    if (verify && !verify(payload)) throw new Error("invalid_read_contract");
    return payload as T;
  } finally {
    window.clearTimeout(timer);
  }
}

function syncDetail(run: SyncStatus["run"]) {
  if (!run || run.status !== "success") return null;
  const incidents = normalizeSourceSyncIncidents(run);
  const parts: string[] = [];
  if (incidents.failedRows > 0) {
    parts.push(incidents.failedRows === 1
      ? "No se pudo importar 1 movimiento en la última sincronización."
      : `No se pudieron importar ${incidents.failedRows} movimientos en la última sincronización.`);
  }
  if (incidents.missingRows > 0) {
    parts.push(incidents.missingRows === 1
      ? "1 movimiento importado anteriormente ya no aparece en la fuente."
      : `${incidents.missingRows} movimientos importados anteriormente ya no aparecen en la fuente.`);
  }
  if (incidents.duplicates > 0) {
    parts.push(incidents.duplicates === 1
      ? "1 posible duplicado apareció durante la sincronización."
      : `${incidents.duplicates} posibles duplicados aparecieron durante la sincronización.`);
  }
  if (incidents.additionalWarnings > 0) {
    parts.push(incidents.additionalWarnings === 1
      ? "1 aviso adicional requiere revisión."
      : `${incidents.additionalWarnings} avisos adicionales requieren revisión.`);
  }
  return parts.join(" ") || null;
}

function documentCount(value: unknown): number {
  // v1/v2 can silently ignore scope=ordinary or unassociated=true.
  // Never count documents from a legacy or unverified response as personal
  // pending tasks: they may include archived or designated test documents.
  if (!isObject(value) || value.contractVersion !== 3
    || !nonnegativeCount(value.total)
    || value.limit !== 1 || value.offset !== 0
    || !Array.isArray(value.items) || value.items.length > 1
    || !isObject(value.principles)
    || value.principles.bankSource !== "read_only"
    || value.principles.getHasSideEffects !== false
    || value.principles.suggestionsPersisted !== false
    || value.principles.associationsRequireConfirmation !== true) {
    throw new Error("invalid_document_summary_contract");
  }
  return value.total as number;
}

async function loadDocumentSummary(): Promise<DocumentSummary> {
  // El contrato document.list_filtered del gateway ya aplica scope=ordinary,
  // excluye archivados del filtro unassociated y calcula total ANTES de paginar.
  // No descargamos el listado entero para contar alertas.
  const [unassociatedPage, pendingPage] = await Promise.all([
    readJson<DocumentCount>("/api/documents?scope=ordinary&unassociated=true&limit=1&offset=0"),
    readJson<DocumentCount>("/api/documents?scope=ordinary&status=pending_review&limit=1&offset=0"),
  ]);
  return {
    unassociated: documentCount(unassociatedPage),
    pendingReview: documentCount(pendingPage),
  };
}

export default function AlertsClient() {
  const [snapshot, setSnapshot] = useState<AlertSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    const today = madridToday();
    const [dashboardResult, syncResult, uncategorizedResult, documentsResult, freshnessResult] = await Promise.allSettled([
      readJson<DashboardEnvelope>("/api/dashboard?scope=all", 10_000, isDashboardEnvelope),
      readJson<SyncStatus>("/api/source/google/sync", 6_000, isSyncStatus),
      readJson<TransactionCount>("/api/transactions?uncategorized=true&limit=1", 8_000, isTransactionCount),
      loadDocumentSummary(),
      readJson<unknown>("/api/analysis/source-freshness", 8_000),
    ]);

    // StrictMode, navigation and refresh must never publish an older result.
    if (sequence !== loadSequence.current) return;
    const degradedReads: string[] = [];
    const dashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
    const sync = syncResult.status === "fulfilled" ? syncResult.value : null;
    const uncategorized = uncategorizedResult.status === "fulfilled" ? uncategorizedResult.value : null;
    const documents = documentsResult.status === "fulfilled" ? documentsResult.value : null;
    const freshness = freshnessResult.status === "fulfilled"
      ? parseHomeBankFreshness(freshnessResult.value) : null;

    if (!dashboard) degradedReads.push("resumen financiero");
    if (!sync) degradedReads.push("sincronización");
    if (!uncategorized) degradedReads.push("movimientos sin categorizar");
    if (!documents) degradedReads.push("documentos");
    if (!freshness) degradedReads.push("cobertura bancaria");

    if (!dashboard && !sync && !uncategorized && !documents) {
      setSnapshot(null);
      setError("No se han podido leer las señales de alertas. Tus datos no se han modificado.");
      setLoading(false);
      return;
    }

    const syncRun = sync?.run ?? null;
    const syncState: GlobalAlertInput["syncState"] = !syncRun
      ? "unknown"
      : syncRun.status === "failed"
        ? "failed"
        : syncRun.status === "success" && hasSourceSyncIncidents(syncRun)
          ? "warning"
          : syncRun.status === "success"
            ? "ok"
            : "unknown";

    setSnapshot({
      input: {
        today,
        syncState,
        bankCoverageVerified: resolveHomeBankCoverage({
          dateFrom: `${today.slice(0, 7)}-01`,
          dateTo: today,
          freshness,
          activityLatestDate: dashboard?.dataThroughDate ?? null,
        }).state === "covered",
        syncDetail: syncDetail(syncRun),
        failedSourceCount: dashboard?.failedSources.length ?? 0,
        quality: dashboard?.data.financial?.period.quality ?? null,
        month: dashboard?.data.financial
          ? { operatingNetCents: dashboard.data.financial.period.operatingNetCents }
          : null,
        budgets: dashboard?.data.budgets?.categories ?? null,
        forecast: dashboard?.data.forecast
          ? {
              projectedClosingBalanceCents: dashboard.data.forecast.summary.projectedClosingBalanceCents,
              plannedItems: dashboard.data.forecast.summary.plannedItems,
              items: dashboard.data.forecast.items,
            }
          : null,
        uncategorizedCount: uncategorized?.totalCount ?? null,
        unassociatedDocumentCount: documents?.unassociated ?? null,
        pendingDocumentReviewCount: documents?.pendingReview ?? null,
      },
      degradedReads,
      generatedAt: new Date().toISOString(),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  const alerts = useMemo(() => snapshot ? deriveGlobalAlerts(snapshot.input) : [], [snapshot]);
  const summary = useMemo(() => summarizeGlobalAlerts(alerts), [alerts]);

  return (
    <main className={styles.shell} aria-busy={loading}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Control financiero</p>
          <h1>Alertas</h1>
          <p className={styles.lead}>Señales agrupadas para decidir qué revisar primero, sin modificar la fuente bancaria ni actuar por ti.</p>
        </div>
        <button className={styles.refreshButton} type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar alertas"}
        </button>
      </header>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {snapshot?.degradedReads.length ? (
        <div className={styles.partialNotice} role="status">
          Lectura parcial: no se pudo consultar {snapshot.degradedReads.join(", ")}. Se muestran únicamente señales verificadas con los datos disponibles.
        </div>
      ) : null}

      <section className={styles.summaryGrid} aria-label="Resumen de alertas">
        <article className={`${styles.summaryCard} ${styles.dangerSummary}`}><span>Críticas</span><strong>{snapshot ? summary.danger : "—"}</strong><small>Requieren atención prioritaria</small></article>
        <article className={`${styles.summaryCard} ${styles.warningSummary}`}><span>Avisos</span><strong>{snapshot ? summary.warning : "—"}</strong><small>Conviene revisarlos</small></article>
        <article className={`${styles.summaryCard} ${styles.infoSummary}`}><span>Informativas</span><strong>{snapshot ? summary.info : "—"}</strong><small>Próximos pasos y contexto</small></article>
      </section>

      <section className={styles.alertSection} aria-labelledby="active-alerts-title">
        <div className={styles.sectionHeading}>
          <div><span>PRIORIDAD</span><h2 id="active-alerts-title">Alertas activas</h2></div>
          <strong>{snapshot ? summary.total : "—"}</strong>
        </div>

        {loading && !snapshot ? <div className={styles.loading} role="status">Leyendo señales persistidas…</div> : null}
        {!loading && snapshot && alerts.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No hay alertas activas con las señales disponibles.</strong>
            <p>La pantalla volverá a evaluarlas cuando actualices los datos o cambien tus movimientos, presupuestos, previsiones o documentos.</p>
          </div>
        ) : null}

        <div className={styles.alertList}>
          {alerts.map((alert) => (
            <article key={alert.id} className={`${styles.alertCard} ${styles[alert.tone]}`}>
              <div className={styles.alertCopy}>
                <div className={styles.alertMeta}>
                  <span>{CATEGORY_LABELS[alert.category]}</span>
                  <span>{alertPriorityLabel(alert.tone)}</span>
                  <details className={styles.priorityDetail}>
                    <summary>Orden técnico</summary>
                    <span>Índice de prioridad {alert.priority}; determina el orden de presentación, no es una puntuación de riesgo financiero.</span>
                  </details>
                </div>
                <h3>{alert.title}</h3>
                <p>{alert.detail}</p>
              </div>
              <Link prefetch={false} className={styles.alertAction} href={alert.href}>{alert.action}</Link>
            </article>
          ))}
        </div>
      </section>

      <aside className={styles.guardrail} aria-label="Cómo funcionan las alertas">
        <strong>Alertas de solo lectura</strong>
        <p>Financial App agrupa señales ya calculadas o persistidas. Esta pantalla no corrige movimientos, no confirma documentos y no ejecuta OCR en segundo plano.</p>
      </aside>
    </main>
  );
}
