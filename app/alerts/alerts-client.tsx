"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deriveGlobalAlerts,
  summarizeGlobalAlerts,
  type GlobalAlertInput,
} from "../../src/application/global-alerts";
import {
  hasSourceSyncIncidents,
  normalizeSourceSyncIncidents,
} from "../../src/application/source-sync-incidents";
import styles from "./alerts.module.css";

type DashboardEnvelope = {
  failedSources: string[];
  data: {
    financial: null | {
      period: {
        operatingNetCents: number;
        quality: {
          suspectedDuplicateRows: number;
          signMismatchRows: number;
        };
      };
    };
    budgets: null | {
      categories: Array<{
        categoryName: string | null;
        progressBps: number | null;
        status: "empty" | "unfunded" | "on_track" | "over";
      }>;
    };
    forecast: null | {
      summary: {
        projectedClosingBalanceCents: number;
        plannedItems: number;
      };
      items: Array<{
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
    rowsMissing: number;
    duplicatesDetected: number;
    warningsCount: number;
  };
};

type TransactionCount = {
  totalCount: number;
};

type DocumentCount = { total: number };

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

function syncDetail(run: SyncStatus["run"]) {
  if (!run || run.status !== "success") return null;
  const incidents = normalizeSourceSyncIncidents(run);
  const parts: string[] = [];
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

function documentCount(page: DocumentCount): number {
  if (!Number.isSafeInteger(page.total) || page.total < 0) throw new Error("invalid_document_summary_total");
  return page.total;
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = madridToday();
    const [dashboardResult, syncResult, uncategorizedResult, documentsResult] = await Promise.allSettled([
      readJson<DashboardEnvelope>("/api/dashboard?scope=all", 10_000),
      readJson<SyncStatus>("/api/source/google/sync", 6_000),
      readJson<TransactionCount>("/api/transactions?uncategorized=true&limit=1", 8_000),
      loadDocumentSummary(),
    ]);

    const degradedReads: string[] = [];
    const dashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
    const sync = syncResult.status === "fulfilled" ? syncResult.value : null;
    const uncategorized = uncategorizedResult.status === "fulfilled" ? uncategorizedResult.value : null;
    const documents = documentsResult.status === "fulfilled" ? documentsResult.value : null;

    if (!dashboard) degradedReads.push("resumen financiero");
    if (!sync) degradedReads.push("sincronización");
    if (!uncategorized) degradedReads.push("movimientos sin categorizar");
    if (!documents) degradedReads.push("documentos");

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
        <article className={`${styles.summaryCard} ${styles.dangerSummary}`}><span>Críticas</span><strong>{summary.danger}</strong><small>Requieren atención prioritaria</small></article>
        <article className={`${styles.summaryCard} ${styles.warningSummary}`}><span>Avisos</span><strong>{summary.warning}</strong><small>Conviene revisarlos</small></article>
        <article className={`${styles.summaryCard} ${styles.infoSummary}`}><span>Informativas</span><strong>{summary.info}</strong><small>Próximos pasos y contexto</small></article>
      </section>

      <section className={styles.alertSection} aria-labelledby="active-alerts-title">
        <div className={styles.sectionHeading}>
          <div><span>PRIORIDAD</span><h2 id="active-alerts-title">Alertas activas</h2></div>
          <strong>{summary.total}</strong>
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
