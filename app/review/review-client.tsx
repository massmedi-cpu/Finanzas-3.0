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
      description: "Movimientos cuyo estado actual requiere una revisión explícita.",
    },
    {
      name: "Posibles duplicados",
      href: "/transactions?duplicateState=suspected",
      count: counts[1],
      description: "Posibles duplicados detectados por el motor de Movimientos.",
    },
    {
      name: "Recurrentes sin decidir",
      href: "/recurrences",
      count: counts[2],
      description: "Patrones recurrentes detectados que todavía no tienen una decisión guardada.",
    },
    {
      name: "Documentos pendientes",
      href: "/documents",
      count: counts[3],
      description: "Documentos cuyo estado real sigue siendo pendiente de revisión.",
    },
    {
      name: "Presupuestos excedidos",
      href: "/budgets",
      count: counts[4],
      description: "Categorías del mes actual cuyo presupuesto ya se ha superado.",
    },
    {
      name: "Previsiones con baja confianza",
      href: "/forecast",
      count: counts[5],
      description: "Elementos planificados que el motor mantiene con confianza baja.",
    },
    {
      name: "Sincronización bancaria",
      href: "/configuration/source",
      count: counts[6],
      description: "Incidencias, avisos o falta de conexión en la fuente bancaria de solo lectura.",
    },
  ], [counts]);

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>CENTRO DE ACCIÓN</p>
        <h1>Para revisar</h1>
        <p>
          Reúne referencias vivas de los módulos que ya poseen cada estado. Resolver una tarea siempre te lleva a su sección original: esta vista no guarda ni duplica información financiera.
        </p>
      </header>

      <section className={styles.grid} aria-label="Elementos para revisar">
        {items.map((item) => (
          <article key={item.name} className={styles.card} aria-label={item.name}>
            <div className={styles.cardBody}>
              <div className={styles.cardHeader}>
                <h2>{item.name}</h2>
                <strong aria-label={item.count === null ? "Dato no disponible" : `${item.count} elementos`}>
                  {loading && item.count === null ? "…" : item.count === null ? "—" : item.count.toLocaleString("es-ES")}
                </strong>
              </div>
              <p>{item.description}</p>
            </div>
            <Link className={styles.action} href={item.href}>Abrir sección</Link>
          </article>
        ))}
      </section>

      <p className={styles.note}>
        Los cambios se realizan únicamente en el módulo propietario de cada dato. La fuente bancaria continúa siendo estrictamente de solo lectura.
      </p>
    </main>
  );
}
