"use client";

import { useEffect, useState } from "react";
import styles from "./analysis-source-freshness.module.css";

type SyncStatus = "success" | "failed" | "started";

type SourceFreshness = {
  available: boolean;
  latestMovementDate: string | null;
  sync: null | {
    status: SyncStatus;
    finishedAt: string | null;
    startedAt: string | null;
    rowsSeen: number | null;
    rowsFailed: number | null;
    warningsCount: number | null;
  };
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
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

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFreshness(value: unknown): value is SourceFreshness {
  if (!record(value) || typeof value.available !== "boolean") return false;
  if (value.latestMovementDate !== null && typeof value.latestMovementDate !== "string") return false;
  if (value.sync === null) return true;
  if (!record(value.sync)) return false;
  return value.sync.status === "success" || value.sync.status === "failed" || value.sync.status === "started";
}

function formatBankDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

function formatSyncDate(value: string) {
  return dateTimeFormatter.format(new Date(value)).replace(".", "");
}

function statusText(freshness: SourceFreshness) {
  const sync = freshness.sync;
  const movement = freshness.latestMovementDate
    ? ` · último movimiento ${formatBankDate(freshness.latestMovementDate)}`
    : "";

  if (!sync) return freshness.latestMovementDate ? `Datos ·${movement.slice(2)}` : null;

  const timestamp = sync.finishedAt ?? sync.startedAt;
  const when = timestamp ? ` ${formatSyncDate(timestamp)}` : "";

  if (sync.status === "success") {
    const rows = sync.rowsSeen !== null ? ` · ${sync.rowsSeen.toLocaleString("es-ES")} filas revisadas` : "";
    return `Fuente sincronizada${when}${rows}${movement}`;
  }
  if (sync.status === "started") return `Actualización de fuente en curso${when}${movement}`;
  return `Última sincronización con incidencias${when}${movement}`;
}

export default function AnalysisSourceFreshness() {
  const [freshness, setFreshness] = useState<SourceFreshness | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/analysis/source-freshness", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload: unknown = await response.json().catch(() => null);
        return isFreshness(payload) ? payload : null;
      })
      .then((payload) => {
        if (!controller.signal.aborted && payload?.available) setFreshness(payload);
      })
      .catch(() => {
        // La frescura es información auxiliar: nunca bloquea ni degrada Análisis.
      });

    return () => controller.abort();
  }, []);

  if (!freshness) return null;
  const text = statusText(freshness);
  if (!text) return null;
  const warning = freshness.sync?.status === "failed" || freshness.sync?.status === "started";

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.status} ${warning ? styles.warning : ""}`}
        role="status"
        aria-live="polite"
        aria-label="Estado de actualización de los datos"
      >
        <span className={styles.dot} aria-hidden="true" />
        <span>{text}</span>
      </div>
    </div>
  );
}
