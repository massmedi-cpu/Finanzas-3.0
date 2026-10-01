"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { normalizeSourceSyncIncidents } from "../src/application/source-sync-incidents";
import {
  getCachedSourceTrust,
  getLastSafeSourceTrust,
  invalidateSourceTrustCache,
  loadSourceTrustFreshness,
  shouldRevalidateSourceTrust,
  type SourceFreshness,
} from "./source-trust-cache";
import { usePwaRuntime } from "./pwa-runtime";
import styles from "./source-trust-status.module.css";

type RequestState =
  | { kind: "loading" }
  | { kind: "ready"; payload: SourceFreshness }
  | { kind: "offline"; payload: SourceFreshness; checkedAt: number }
  | { kind: "offline-empty" }
  | { kind: "unknown" };

type Tone = "ok" | "warning" | "danger" | "unknown";

type Summary = {
  label: string;
  detail: string | null;
  tone: Tone;
  showReviewLink: boolean;
};

const guardedRoutes = [
  "/accounts",
  "/transactions",
  "/budgets",
  "/cash-flow",
  "/forecast",
  "/recurrences",
  "/documents",
] as const;

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

function formatMovementDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date).replace(".", "");
}

function formatSyncDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateTimeFormatter.format(date).replace(".", "");
}

function formatCheckedAt(value: number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateTimeFormatter.format(date).replace(".", "");
}

function formatInteger(value: number) {
  return Math.trunc(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function plural(count: number, singular: string, pluralValue: string) {
  return `${formatInteger(count)} ${count === 1 ? singular : pluralValue}`;
}

function incidentText(sync: NonNullable<SourceFreshness["sync"]>) {
  const incidents = normalizeSourceSyncIncidents(sync);
  const parts: string[] = [];
  if (incidents.failedRows > 0) parts.push(plural(incidents.failedRows, "fila no procesada", "filas no procesadas"));
  if (incidents.missingRows > 0) parts.push(plural(incidents.missingRows, "movimiento ausente", "movimientos ausentes"));
  if (incidents.duplicates > 0) parts.push(plural(incidents.duplicates, "posible duplicado", "posibles duplicados"));
  if (incidents.additionalWarnings > 0) parts.push(plural(incidents.additionalWarnings, "aviso adicional", "avisos adicionales"));
  return { incidents, text: parts.join(" · ") || null };
}

export function shouldShowSourceTrust(pathname: string) {
  return guardedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function summarize(payload: SourceFreshness): Summary {
  const movementDate = formatMovementDate(payload.latestMovementDate);
  const movement = movementDate ? `Último movimiento ${movementDate}` : null;
  const sync = payload.sync;

  if (!payload.available) {
    return {
      label: "Fuente no comprobable",
      detail: "No hay evidencia suficiente para afirmar que los datos estén actualizados.",
      tone: "unknown",
      showReviewLink: true,
    };
  }

  if (!sync) {
    return {
      label: "Fuente disponible",
      detail: movement,
      tone: "ok",
      showReviewLink: false,
    };
  }

  const when = formatSyncDate(sync.finishedAt ?? sync.startedAt);
  const checkedRows = sync.rowsSeen !== null ? `${formatInteger(sync.rowsSeen)} filas revisadas` : null;
  const { incidents, text: incidentsText } = incidentText(sync);
  const context = [when ? `Comprobado ${when}` : null, checkedRows, movement].filter(Boolean).join(" · ") || null;
  const details = [context, incidentsText].filter(Boolean).join(" · ") || null;
  const hasDataIncident = incidents.failedRows > 0 || incidents.missingRows > 0 || incidents.duplicates > 0;
  const hasAnyIncident = hasDataIncident || incidents.additionalWarnings > 0;

  if (sync.status === "started") {
    return {
      label: "Fuente actualizándose",
      detail: details,
      tone: "warning",
      showReviewLink: false,
    };
  }

  if (sync.status === "failed") {
    return {
      label: "Fuente con incidencias",
      detail: details ?? "La última sincronización no terminó correctamente.",
      tone: "danger",
      showReviewLink: true,
    };
  }

  if (sync.status === "partial") {
    return {
      label: "Fuente sincronizada parcialmente",
      detail: details,
      tone: hasDataIncident ? "danger" : "warning",
      showReviewLink: true,
    };
  }

  if (hasAnyIncident) {
    return {
      label: hasDataIncident ? "Fuente con incidencias" : "Fuente con avisos",
      detail: details,
      tone: "warning",
      showReviewLink: true,
    };
  }

  return {
    label: "Fuente comprobada",
    detail: details,
    tone: "ok",
    showReviewLink: false,
  };
}

export default function SourceTrustStatus({ pathname }: { pathname: string }) {
  const visible = useMemo(() => shouldShowSourceTrust(pathname), [pathname]);
  const { online } = usePwaRuntime();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RequestState>(() => {
    const cached = getCachedSourceTrust();
    return cached ? { kind: "ready", payload: cached } : { kind: "loading" };
  });

  useEffect(() => {
    if (pathname === "/configuration/source" || pathname.startsWith("/configuration/source/")) {
      invalidateSourceTrustCache();
    }
  }, [pathname]);

  useEffect(() => {
    function revalidateAfterFocus() {
      if (visible && online && shouldRevalidateSourceTrust()) {
        setAttempt((value) => value + 1);
      }
    }
    function revalidateAfterConnectivity() {
      if (!visible) return;
      invalidateSourceTrustCache();
      setAttempt((value) => value + 1);
    }

    window.addEventListener("focus", revalidateAfterFocus);
    window.addEventListener("financial-app:source-revalidate", revalidateAfterConnectivity);
    return () => {
      window.removeEventListener("focus", revalidateAfterFocus);
      window.removeEventListener("financial-app:source-revalidate", revalidateAfterConnectivity);
    };
  }, [online, visible]);

  useEffect(() => {
    if (!visible) return;

    if (!online) {
      const snapshot = getLastSafeSourceTrust();
      setState(snapshot
        ? { kind: "offline", payload: snapshot.payload, checkedAt: snapshot.checkedAt }
        : { kind: "offline-empty" });
      return;
    }

    const cached = getCachedSourceTrust();
    if (cached) {
      setState((current) => (
        current.kind === "ready" && current.payload === cached
          ? current
          : { kind: "ready", payload: cached }
      ));
      return;
    }

    let active = true;
    setState({ kind: "loading" });

    void loadSourceTrustFreshness().then((payload) => {
      if (!active) return;
      setState(payload ? { kind: "ready", payload } : { kind: "unknown" });
    });

    return () => {
      active = false;
    };
  }, [attempt, visible, pathname, online]);

  if (!visible) return null;

  const summary: Summary = state.kind === "ready"
    ? summarize(state.payload)
    : state.kind === "offline"
      ? (() => {
          const previous = summarize(state.payload);
          const checkedAt = formatCheckedAt(state.checkedAt);
          return {
            label: "Fuente sin conexión",
            detail: [
              checkedAt ? `Última comprobación segura ${checkedAt}` : "Última comprobación segura disponible",
              previous.label,
              previous.detail,
            ].filter(Boolean).join(" · "),
            tone: "warning" as const,
            showReviewLink: false,
          };
        })()
      : state.kind === "offline-empty"
        ? {
            label: "Fuente sin conexión",
            detail: "No hay una comprobación segura guardada en este dispositivo.",
            tone: "unknown" as const,
            showReviewLink: false,
          }
        : state.kind === "loading"
          ? {
              label: "Comprobando fuente",
              detail: "Verificando el estado real de sincronización…",
              tone: "unknown" as const,
              showReviewLink: false,
            }
          : {
              label: "Fuente no comprobable",
              detail: "No se ha podido verificar el estado real de la fuente. No se asume que esté actualizada.",
              tone: "unknown" as const,
              showReviewLink: true,
            };

  return (
    <section className={styles.frame} aria-label="Estado de la fuente bancaria">
      <div className={`${styles.status} ${styles[summary.tone]}`}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.copy} role="status" aria-live="polite">
          <strong>{summary.label}</strong>
          {summary.detail && <small>{summary.detail}</small>}
        </span>
        <span className={styles.actions}>
          {state.kind === "unknown" && (
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              Reintentar
            </button>
          )}
          {summary.showReviewLink && (
            <Link prefetch={false} href="/configuration/source">Revisar fuente</Link>
          )}
        </span>
      </div>
    </section>
  );
}
