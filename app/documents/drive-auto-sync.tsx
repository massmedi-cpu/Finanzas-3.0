"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./drive-auto-sync.module.css";

type DriveSyncResult = {
  contractVersion: 1;
  source: "google_drive";
  mode: "automatic_incremental_read_only";
  principles: { bankSource: "read_only"; driveSource: "read_only"; duplicateSafe: true; nonBlocking: true };
  imported: number;
  scanned: number;
  detectedChanges: number;
  unchanged: number;
  failed: number;
  pending: number;
  skippedUnsupported: number;
  skippedInvalid: number;
  truncated: boolean;
  completedAt: string;
};

type StoredResult = {
  savedAt: number;
  result: DriveSyncResult;
};

type Phase = "idle" | "syncing" | "ready" | "error" | "preview_readonly";

const SESSION_KEY = "financial-app:document-drive-sync:10.0.72";
const SESSION_TTL_MS = 2 * 60 * 1000;

function validDriveSyncResult(value: unknown): value is DriveSyncResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<DriveSyncResult>;
  if (result.contractVersion !== 1 || result.source !== "google_drive"
    || result.mode !== "automatic_incremental_read_only"
    || result.principles?.bankSource !== "read_only"
    || result.principles?.driveSource !== "read_only"
    || result.principles?.duplicateSafe !== true
    || result.principles?.nonBlocking !== true
    || result.truncated !== true && result.truncated !== false
    || typeof result.completedAt !== "string" || !Number.isFinite(Date.parse(result.completedAt))) return false;
  const counters = [
    result.imported, result.scanned, result.detectedChanges, result.unchanged,
    result.failed, result.pending, result.skippedUnsupported, result.skippedInvalid,
  ];
  if (!counters.every((value) => Number.isSafeInteger(value) && Number(value) >= 0)) return false;
  return result.detectedChanges! + result.unchanged! === result.scanned!
    && result.imported! <= result.detectedChanges!
    && result.failed! <= result.detectedChanges!
    && result.pending! <= result.detectedChanges!;
}

function validStoredResult(value: unknown): StoredResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Partial<StoredResult>;
  if (typeof stored.savedAt !== "number" || !Number.isFinite(stored.savedAt)
    || stored.savedAt > Date.now() || Date.now() - stored.savedAt > SESSION_TTL_MS
    || !validDriveSyncResult(stored.result)) return null;
  return stored as StoredResult;
}

function summary(result: DriveSyncResult) {
  const partial = result.failed > 0 || result.pending > 0 || result.truncated
    || result.skippedInvalid > 0;
  const notes: string[] = [];
  if (result.imported > 0) {
    notes.push(result.imported + " " + (result.imported === 1 ? "documento nuevo incorporado" : "documentos nuevos incorporados") + " desde Drive.");
  }
  if (result.failed > 0) {
    notes.push(result.failed + " " + (result.failed === 1 ? "documento no pudo validarse" : "documentos no pudieron validarse") + ".");
  }
  if (result.pending > 0) {
    notes.push(result.pending + " " + (result.pending === 1 ? "cambio pendiente" : "cambios pendientes") + " de procesar.");
  }
  if (result.truncated) notes.push("La exploración de Drive está incompleta.");
  if (result.skippedInvalid > 0) {
    notes.push(result.skippedInvalid + " " + (result.skippedInvalid === 1 ? "archivo inválido omitido" : "archivos inválidos omitidos") + ".");
  }
  if (result.skippedUnsupported > 0) {
    notes.push(result.skippedUnsupported + " " + (result.skippedUnsupported === 1 ? "archivo con formato no admitido" : "archivos con formato no admitido") + " ignorados.");
  }
  if (partial) return notes.join(" ") + " La sincronización no está completa; comprueba Drive de nuevo.";
  if (result.detectedChanges > result.imported) {
    return notes.join(" ") + " Hay cambios detectados que no se han incorporado. Comprueba el archivo antes de dar Drive por actualizado.";
  }
  if (notes.length) return notes.join(" ");
  return "Carpeta comprobada. No hay documentos nuevos que importar.";
}

export function DriveAutoSync() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<DriveSyncResult | null>(null);
  const syncingRef = useRef(false);
  const autoStartedRef = useRef(false);

  const run = useCallback(async (force = false) => {
    if (syncingRef.current) return;
    if (!force) {
      try {
        const raw = window.sessionStorage.getItem(SESSION_KEY);
        const stored = raw ? validStoredResult(JSON.parse(raw)) : null;
        if (stored) {
          setResult(stored.result);
          setPhase("ready");
          return;
        }
      } catch {
        try {
          window.sessionStorage.removeItem(SESSION_KEY);
        } catch {
          // La detección automática no depende de que sessionStorage esté disponible.
        }
      }
    }

    syncingRef.current = true;
    setPhase("syncing");
    try {
      const response = await fetch("/api/documents/drive-sync", {
        method: "POST",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (response.status === 409 && body && typeof body === "object"
        && (body as { code?: unknown }).code === "preview_drive_sync_read_only") {
        setPhase("preview_readonly");
        return;
      }
      if (!response.ok || !validDriveSyncResult(body)) throw new Error("drive_sync_failed");

      setResult(body);
      setPhase("ready");
      try {
        window.sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ savedAt: Date.now(), result: body } satisfies StoredResult),
        );
      } catch {
        // La sincronización no depende de que sessionStorage esté disponible.
      }

      if (body.imported > 0) {
        window.location.reload();
      }
    } catch {
      setPhase("error");
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    void run(false);
  }, [run]);

  return (
    <section className={styles.surface} aria-live="polite" data-testid="drive-auto-sync">
      <div className={styles.copy}>
        <strong>Documentos de Google Drive</strong>
        {phase === "syncing" ? (
          <span>Comprobando novedades en segundo plano… Puedes seguir usando Documentos.</span>
        ) : null}
        {phase === "ready" && result ? (
          <span>{summary(result)}</span>
        ) : null}
        {phase === "error" ? (
          <span>No se ha podido verificar Drive. El estado de los documentos debe comprobarse por separado; pulsa «Comprobar ahora» para reintentar.</span>
        ) : null}
        {phase === "preview_readonly" ? (
          <span>Vista previa de solo lectura: la importación automática de Drive está desactivada para proteger producción. Puedes consultar los documentos existentes si tu sesión lo permite.</span>
        ) : null}
        {phase === "idle" ? <span>Preparando comprobación automática…</span> : null}
      </div>
      <button
        type="button"
        className={styles.action}
        onClick={() => void run(true)}
        disabled={phase === "syncing" || phase === "preview_readonly"}
      >
        {phase === "syncing" ? "Comprobando…" : phase === "preview_readonly" ? "Solo en producción" : "Comprobar ahora"}
      </button>
    </section>
  );
}
