"use client";

import { useEffect, useState } from "react";
import styles from "./analysis-source-freshness.module.css";

type SyncStatus = "success" | "partial" | "failed" | "started";

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

type FreshnessTone = "ok" | "warning" | "danger";

type FreshnessSummary = {
  label: string;
  detail: string | null;
  incidentDetail: string | null;
  tone: FreshnessTone;
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

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isFreshness(value: unknown): value is SourceFreshness {
  if (!record(value) || typeof value.available !== "boolean") return false;
  if (!nullableString(value.latestMovementDate)) return false;
  if (value.sync === null) return true;
  if (!record(value.sync)) return false;

  const statusValid = value.sync.status === "success"
    || value.sync.status === "partial"
    || value.sync.status === "failed"
    || value.sync.status === "started";
  if (!statusValid) return false;

  return nullableString(value.sync.finishedAt)
    && nullableString(value.sync.startedAt)
    && nullableFiniteNumber(value.sync.rowsSeen)
    && nullableFiniteNumber(value.sync.rowsFailed)
    && nullableFiniteNumber(value.sync.warningsCount);
}

function formatBankDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormatter.format(date).replace(".", "");
}

function formatSyncDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateTimeFormatter.format(date).replace(".", "");
}

function syncHasIncidents(sync: NonNullable<SourceFreshness["sync"]>) {
  return sync.status === "partial"
    || (sync.rowsFailed ?? 0) > 0
    || (sync.warningsCount ?? 0) > 0;
}

function syncHealth(sync: NonNullable<SourceFreshness["sync"]>) {
  const failedRows = sync.rowsFailed ?? 0;
  const warnings = sync.warningsCount ?? 0;
  const parts: string[] = [];

  if (failedRows > 0) {
    parts.push(`${failedRows.toLocaleString("es-ES")} ${failedRows === 1 ? "fila fallida" : "filas fallidas"}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings.toLocaleString("es-ES")} ${warnings === 1 ? "aviso" : "avisos"}`);
  }

  return {
    labelSuffix: failedRows > 0 ? " con incidencias" : warnings > 0 ? " con avisos" : "",
    detail: parts.length ? ` · ${parts.join(" · ")}` : "",
  };
}

function statusText(freshness: SourceFreshness) {
  const sync = freshness.sync;
  const movementLabel = freshness.latestMovementDate ? formatBankDate(freshness.latestMovementDate) : null;
  const movement = movementLabel ? ` · último movimiento ${movementLabel}` : "";

  if (!sync) return movementLabel ? `Datos · último movimiento ${movementLabel}` : null;

  const timestamp = sync.finishedAt ?? sync.startedAt;
  const timestampLabel = timestamp ? formatSyncDate(timestamp) : null;
  const when = timestampLabel ? ` ${timestampLabel}` : "";
  const rows = sync.rowsSeen !== null ? ` · ${sync.rowsSeen.toLocaleString("es-ES")} filas revisadas` : "";
  const health = syncHealth(sync);

  if (sync.status === "success") {
    return `Fuente sincronizada${health.labelSuffix}${when}${rows}${health.detail}${movement}`;
  }
  if (sync.status === "partial") {
    return `Fuente sincronizada parcialmente${health.labelSuffix}${when}${rows}${health.detail}${movement}`;
  }
  if (sync.status === "started") return `Actualización de fuente en curso${when}${movement}`;
  return `Última sincronización con incidencias${when}${rows}${health.detail}${movement}`;
}

function userSummary(freshness: SourceFreshness): FreshnessSummary {
  const movementLabel = freshness.latestMovementDate ? formatBankDate(freshness.latestMovementDate) : null;
  const movement = movementLabel ? `Último movimiento ${movementLabel}` : null;
  const sync = freshness.sync;

  if (!sync) {
    return {
      label: "Datos bancarios disponibles",
      detail: movement,
      incidentDetail: null,
      tone: "ok",
    };
  }

  const timestamp = sync.finishedAt ?? sync.startedAt;
  const timestampLabel = timestamp ? formatSyncDate(timestamp) : null;
  const timeDetail = timestampLabel
    ? sync.status === "started"
      ? `Actualización iniciada ${timestampLabel}`
      : sync.status === "failed"
        ? `Último intento ${timestampLabel}`
        : sync.status === "partial"
          ? `Sincronización parcial ${timestampLabel}`
          : `Sincronizado ${timestampLabel}`
    : null;
  const detail = [movement, timeDetail].filter(Boolean).join(" · ") || null;
  const failedRows = sync.rowsFailed ?? 0;
  const warnings = sync.warningsCount ?? 0;
  const incidentParts: string[] = [];

  if (failedRows > 0) {
    incidentParts.push(`${failedRows.toLocaleString("es-ES")} ${failedRows === 1 ? "fila no procesada" : "filas no procesadas"}`);
  }
  if (warnings > 0) {
    incidentParts.push(`${warnings.toLocaleString("es-ES")} ${warnings === 1 ? "aviso" : "avisos"}`);
  }

  if (sync.status === "started") {
    return {
      label: "Actualizando datos",
      detail,
      incidentDetail: null,
      tone: "warning",
    };
  }

  if (sync.status === "failed") {
    return {
      label: "Sincronización con incidencias",
      detail,
      incidentDetail: incidentParts.length ? incidentParts.join(" · ") : "La última actualización no terminó correctamente",
      tone: "danger",
    };
  }

  if (sync.status === "partial") {
    return {
      label: failedRows > 0 ? "Sincronización parcial con incidencias" : "Datos sincronizados parcialmente",
      detail,
      incidentDetail: incidentParts.length ? incidentParts.join(" · ") : "La última actualización terminó de forma parcial",
      tone: failedRows > 0 ? "danger" : "warning",
    };
  }

  if (failedRows > 0) {
    return {
      label: "Sincronización con incidencias",
      detail,
      incidentDetail: incidentParts.join(" · "),
      tone: "danger",
    };
  }

  if (warnings > 0) {
    return {
      label: "Datos sincronizados con avisos",
      detail,
      incidentDetail: incidentParts.join(" · "),
      tone: "warning",
    };
  }

  return {
    label: "Datos al día",
    detail,
    incidentDetail: null,
    tone: "ok",
  };
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
  const summary = userSummary(freshness);
  const warning = freshness.sync
    ? freshness.sync.status === "failed"
      || freshness.sync.status === "partial"
      || freshness.sync.status === "started"
      || syncHasIncidents(freshness.sync)
    : false;

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.status} ${styles[summary.tone]} ${warning ? styles.warning : ""}`}
        role="status"
        aria-live="polite"
        aria-label={text}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.copy}>
          <strong>{summary.label}</strong>
          {summary.detail && <span>{summary.detail}</span>}
          {summary.incidentDetail && <small>{summary.incidentDetail}</small>}
        </span>
      </div>
    </div>
  );
}
