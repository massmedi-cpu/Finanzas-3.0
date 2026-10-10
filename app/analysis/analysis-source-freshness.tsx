"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  hasSourceSyncIncidents,
  normalizeSourceSyncIncidents,
} from "../../src/application/source-sync-incidents";
import { formatInteger } from "../../src/core/formatters";
import styles from "./analysis-source-freshness.module.css";

type SyncStatus = "success" | "partial" | "failed" | "started";

export type SourceFreshness = {
  available: boolean;
  latestMovementDate: string | null;
  earliestMovementDate?: string | null;
  sync: null | {
    status: SyncStatus;
    finishedAt: string | null;
    startedAt: string | null;
    rowsSeen: number | null;
    rowsFailed: number | null;
    rowsMissing: number | null;
    duplicatesDetected: number | null;
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
  if (value.earliestMovementDate !== undefined && !nullableString(value.earliestMovementDate)) return false;
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
    && nullableFiniteNumber(value.sync.rowsMissing)
    && nullableFiniteNumber(value.sync.duplicatesDetected)
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
  return hasSourceSyncIncidents(sync);
}

function syncHealth(sync: NonNullable<SourceFreshness["sync"]>) {
  const incidents = normalizeSourceSyncIncidents(sync);
  const parts: string[] = [];

  if (incidents.failedRows > 0) {
    parts.push(`${formatInteger(incidents.failedRows)} ${incidents.failedRows === 1 ? "fila fallida" : "filas fallidas"}`);
  }
  if (incidents.missingRows > 0) {
    parts.push(`${formatInteger(incidents.missingRows)} ${incidents.missingRows === 1 ? "movimiento ausente de la fuente" : "movimientos ausentes de la fuente"}`);
  }
  if (incidents.duplicates > 0) {
    parts.push(`${formatInteger(incidents.duplicates)} ${incidents.duplicates === 1 ? "posible duplicado" : "posibles duplicados"}`);
  }
  if (incidents.additionalWarnings > 0) {
    parts.push(`${formatInteger(incidents.additionalWarnings)} ${incidents.additionalWarnings === 1 ? "aviso adicional" : "avisos adicionales"}`);
  }

  const hasIncidents = incidents.failedRows > 0 || incidents.missingRows > 0 || incidents.duplicates > 0;
  return {
    labelSuffix: hasIncidents ? " con incidencias" : incidents.additionalWarnings > 0 ? " con avisos" : "",
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
  const rows = sync.rowsSeen !== null ? ` · ${formatInteger(sync.rowsSeen)} filas revisadas` : "";
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
    // Legacy/partial freshness responses may have neither a sync report nor
    // any observed movement. Do not imply the account contains bank data.
    return movementLabel
      ? {
          label: "Último movimiento disponible",
          detail: movement,
          incidentDetail: "El estado de sincronización no está disponible; no se puede confirmar la cobertura completa.",
          tone: "warning",
        }
      : {
          label: "Cobertura bancaria sin verificar",
          detail: null,
          incidentDetail: "No hay fecha de movimiento ni estado de sincronización confirmados.",
          tone: "warning",
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
  const incidents = normalizeSourceSyncIncidents(sync);
  const incidentParts: string[] = [];

  if (incidents.failedRows > 0) {
    incidentParts.push(`${formatInteger(incidents.failedRows)} ${incidents.failedRows === 1 ? "fila no procesada" : "filas no procesadas"}`);
  }
  if (incidents.missingRows > 0) {
    incidentParts.push(`${formatInteger(incidents.missingRows)} ${incidents.missingRows === 1 ? "movimiento ausente de los datos importados" : "movimientos ausentes de los datos importados"}`);
  }
  if (incidents.duplicates > 0) {
    incidentParts.push(`${formatInteger(incidents.duplicates)} ${incidents.duplicates === 1 ? "posible duplicado" : "posibles duplicados"}`);
  }
  if (incidents.additionalWarnings > 0) {
    incidentParts.push(`${formatInteger(incidents.additionalWarnings)} ${incidents.additionalWarnings === 1 ? "aviso adicional" : "avisos adicionales"}`);
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
      label: incidents.failedRows > 0 ? "Sincronización parcial con incidencias" : "Datos sincronizados parcialmente",
      detail,
      incidentDetail: incidentParts.length ? incidentParts.join(" · ") : "La última actualización terminó de forma parcial",
      tone: incidents.failedRows > 0 ? "danger" : "warning",
    };
  }

  if (incidents.failedRows > 0) {
    return {
      label: "Sincronización con incidencias",
      detail,
      incidentDetail: incidentParts.join(" · "),
      tone: "danger",
    };
  }

  if (incidents.missingRows > 0 || incidents.duplicates > 0) {
    return {
      label: "Datos sincronizados con incidencias",
      detail,
      incidentDetail: incidentParts.join(" · "),
      tone: "warning",
    };
  }

  if (incidents.additionalWarnings > 0) {
    return {
      label: "Datos sincronizados con avisos",
      detail,
      incidentDetail: incidentParts.join(" · "),
      tone: "warning",
    };
  }

  // A successful sync is not evidence that any bank movement date was
  // imported. A missing date may mean an empty account or an unavailable
  // legacy bounds endpoint. Never display "Datos al día" in that situation.
  if (!movementLabel) {
    return {
      label: "Cobertura bancaria sin verificar",
      detail,
      incidentDetail: "No hay ninguna fecha de movimiento bancario confirmada.",
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

export default function AnalysisSourceFreshness({
  onChange,
  accountId = null,
}: {
  onChange?: (freshness: SourceFreshness | null) => void;
  accountId?: string | null;
}) {
  const [freshness, setFreshness] = useState<SourceFreshness | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // A different bank account must never temporarily reuse another account's coverage.
    onChange?.(null);
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    const url = params.size > 0
      ? `/api/analysis/source-freshness?${params.toString()}`
      : "/api/analysis/source-freshness";
    void fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload: unknown = await response.json().catch(() => null);
        return isFreshness(payload) ? payload : null;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          const next = payload?.available ? payload : null;
          setFreshness(next);
          onChange?.(next);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFreshness(null);
          onChange?.(null);
        }
        // La frescura es información auxiliar: nunca bloquea ni degrada Análisis.
      });

    return () => controller.abort();
  }, [accountId, onChange]);

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
  const actionable = freshness.sync ? syncHasIncidents(freshness.sync) : false;

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.status} ${styles[summary.tone]} ${warning ? styles.warning : ""}`}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.copy} role="status" aria-live="polite" aria-label={text}>
          <strong>{summary.label}</strong>
          {summary.detail && <span>{summary.detail}</span>}
          {summary.incidentDetail && <small>{summary.incidentDetail}</small>}
        </span>
        {actionable && (
          <Link prefetch={false} className={styles.action} href="/configuration/source">
            Revisar fuente
          </Link>
        )}
      </div>
    </div>
  );
}
