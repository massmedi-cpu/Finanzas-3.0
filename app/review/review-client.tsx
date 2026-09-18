"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./review.module.css";

type SignalItem = {
  name: string;
  href: string;
  count: number | null;
  description: string;
};

type TransactionCount = { totalCount?: number };
type RecurrenceSnapshot = { candidates?: Array<{ existingStatus?: string | null }> };
type DocumentList = { total?: number };
type BudgetSnapshot = { categories?: Array<{ status?: string }> };
type ForecastSnapshot = { items?: Array<{ status?: string; confidence?: string }> };
type GoogleStatus = { configured?: boolean; connection?: { connected?: boolean } | null };
type SyncStatus = {
  run?: {
    status?: string;
    rowsFailed?: number;
    warningsCount?: number;
    errorCode?: string | null;
  } | null;
};

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthOf(value: string) {
  return value.slice(0, 7);
}

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("review_source_unavailable");
  return response.json() as Promise<T>;
}

function valueOf<T>(result: PromiseSettledResult<T>) {
  return result.status === "fulfilled" ? result.value : null;
}

export default function ReviewClient() {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Array<number | null>>([null, null, null, null, null, null, null]);

  useEffect(() => {
    const controller = new AbortController();
    const today = madridToday();
    const month = monthOf(today);
    const dateTo = addDays(today, 30);

    void (async () => {
      const results = await Promise.allSettled([
        readJson<TransactionCount>("/api/transactions?reviewState=needs_review&limit=1", controller.signal),
        readJson<TransactionCount>("/api/transactions?duplicateState=suspected&limit=1", controller.signal),
        readJson<RecurrenceSnapshot>("/api/recurrences?minOccurrences=3", controller.signal),
        readJson<DocumentList>("/api/documents?status=pending_review&limit=1&offset=0", controller.signal),
        readJson<BudgetSnapshot>(`/api/budgets?month=${month}`, controller.signal),
        readJson<ForecastSnapshot>(`/api/forecast?dateFrom=${today}&dateTo=${dateTo}`, controller.signal),
        readJson<GoogleStatus>("/api/source/google/status", controller.signal),
        readJson<SyncStatus>("/api/source/google/sync", controller.signal),
      ] as const);

      if (controller.signal.aborted) return;

      const reviewTransactions = valueOf(results[0]);
      const suspectedDuplicates = valueOf(results[1]);
      const recurrences = valueOf(results[2]);
      const documents = valueOf(results[3]);
      const budgets = valueOf(results[4]);
      const forecast = valueOf(results[5]);
      const sourceStatus = valueOf(results[6]);
      const syncStatus = valueOf(results[7]);

      const sourceCount = sourceStatus === null || syncStatus === null
        ? null
        : (
            sourceStatus.configured !== true ||
            sourceStatus.connection?.connected !== true ||
            Boolean(
              syncStatus.run && (
                syncStatus.run.status === "failed" ||
                (syncStatus.run.rowsFailed ?? 0) > 0 ||
                (syncStatus.run.warningsCount ?? 0) > 0 ||
                Boolean(syncStatus.run.errorCode)
              )
            )
          )
          ? 1
          : 0;

      setCounts([
        reviewTransactions && Number.isInteger(reviewTransactions.totalCount) ? reviewTransactions.totalCount! : null,
        suspectedDuplicates && Number.isInteger(suspectedDuplicates.totalCount) ? suspectedDuplicates.totalCount! : null,
        recurrences?.candidates
          ? recurrences.candidates.filter((candidate) => candidate.existingStatus == null).length
          : null,
        documents && Number.isInteger(documents.total) ? documents.total! : null,
        budgets?.categories
          ? budgets.categories.filter((category) => category.status === "over").length
          : null,
        forecast?.items
          ? forecast.items.filter((item) => item.status === "planned" && item.confidence === "low").length
          : null,
        sourceCount,
      ]);
      setLoading(false);
    })().catch(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
  }, []);

  const items = useMemo<SignalItem[]>(() => [
    {
      name: "Movimientos por revisar",
      href: "/transactions?reviewState=needs_review",
      count: counts[0],
      description: "Movimientos que requieren una decisión explícita.",
    },
    {
      name: "Posibles duplicados",
      href: "/transactions?duplicateState=suspected",
      count: counts[1],
      description: "Coincidencias que conviene confirmar o descartar.",
    },
    {
      name: "Recurrentes sin decidir",
      href: "/recurrences",
      count: counts[2],
      description: "Patrones detectados que aún no tienen una decisión guardada.",
    },
    {
      name: "Documentos pendientes",
      href: "/documents",
      count: counts[3],
      description: "Documentos que siguen esperando revisión.",
    },
    {
      name: "Presupuestos excedidos",
      href: "/budgets",
      count: counts[4],
      description: "Categorías del mes actual que ya superaron su límite.",
    },
    {
      name: "Previsiones con baja confianza",
      href: "/forecast",
      count: counts[5],
      description: "Elementos planificados cuya estimación merece revisión.",
    },
    {
      name: "Sincronización bancaria",
      href: "/configuration/source",
      count: counts[6],
      description: "Conexión, avisos o incidencias de la fuente bancaria.",
    },
  ], [counts]);

  const actionItems = useMemo(() => items.filter((item) => typeof item.count === "number" && item.count > 0), [items]);
  const clearItems = useMemo(() => items.filter((item) => item.count === 0), [items]);
  const unavailableItems = useMemo(() => loading ? [] : items.filter((item) => item.count === null), [items, loading]);
  const actionableCount = actionItems.reduce((sum, item) => sum + (item.count ?? 0), 0);

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>CENTRO DE ACCIÓN</p>
          <h1>Para revisar</h1>
        </div>
        <div className={styles.heroStatus} aria-live="polite">
          <strong>{loading ? "…" : actionableCount.toLocaleString("es-ES")}</strong>
          <span>{loading ? "Comprobando" : actionableCount === 1 ? "acción pendiente" : "acciones pendientes"}</span>
        </div>
      </header>

      {loading ? (
        <section className={styles.loadingPanel} role="status">Comprobando qué necesita tu atención…</section>
      ) : (
        <>
          <section className={styles.section} aria-labelledby="review-actions-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.kicker}>PRIORIDAD</p>
                <h2 id="review-actions-heading">Requiere atención</h2>
              </div>
              <span>{actionItems.length.toLocaleString("es-ES")} áreas</span>
            </div>

            {actionItems.length > 0 ? (
              <div className={styles.actionList}>
                {actionItems.map((item) => (
                  <article key={item.name} className={styles.actionCard} aria-label={item.name}>
                    <div className={styles.count} aria-label={`${item.count} elementos`}>{item.count!.toLocaleString("es-ES")}</div>
                    <div className={styles.cardCopy}>
                      <h3>{item.name}</h3>
                      <p>{item.description}</p>
                    </div>
                    <Link prefetch={false} className={styles.action} href={item.href}>Revisar</Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.allClear} role="status">
                <strong>No hay acciones confirmadas pendientes</strong>
                <span>Las fuentes disponibles no han detectado nada que requiera intervención.</span>
              </div>
            )}
          </section>

          {clearItems.length > 0 && (
            <section className={styles.compactPanel} aria-labelledby="review-clear-heading">
              <div className={styles.compactHeading}>
                <div>
                  <p className={styles.kicker}>SIN INCIDENCIAS</p>
                  <h2 id="review-clear-heading">Todo en orden</h2>
                </div>
                <strong>{clearItems.length.toLocaleString("es-ES")}</strong>
              </div>
              <ul className={styles.compactList}>
                {clearItems.map((item) => <li key={item.name}><span aria-hidden="true">✓</span><span>{item.name}</span></li>)}
              </ul>
            </section>
          )}

          {unavailableItems.length > 0 && (
            <section className={`${styles.compactPanel} ${styles.unavailable}`} aria-labelledby="review-unavailable-heading">
              <div className={styles.compactHeading}>
                <div>
                  <p className={styles.kicker}>SIN CONFIRMAR</p>
                  <h2 id="review-unavailable-heading">No se pudo comprobar</h2>
                </div>
                <strong>{unavailableItems.length.toLocaleString("es-ES")}</strong>
              </div>
              <ul className={styles.unavailableList}>
                {unavailableItems.map((item) => (
                  <li key={item.name}>
                    <span>{item.name}</span>
                    <Link prefetch={false} href={item.href}>Abrir sección</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className={styles.note}>
        Las acciones se resuelven en su módulo propietario. La fuente bancaria sigue siendo estrictamente de solo lectura.
      </p>
    </main>
  );
}
