"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./drive-auto-sync.module.css";

type DriveSyncResult = {
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

type Phase = "idle" | "syncing" | "ready" | "error";

const SESSION_KEY = "financial-app:document-drive-sync:10.0.72";
const SESSION_TTL_MS = 2 * 60 * 1000;

function validStoredResult(value: unknown): StoredResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Partial<StoredResult>;
  if (typeof stored.savedAt !== "number" || !stored.result || typeof stored.result !== "object") return null;
  if (Date.now() - stored.savedAt > SESSION_TTL_MS) return null;
  return stored as StoredResult;
}

function summary(result: DriveSyncResult) {
  if (result.imported > 0) {
    const suffix = result.imported === 1 ? "documento nuevo" : "documentos nuevos";
    return `${result.imported} ${suffix} detectados en Drive y añadidos a Documentos.`;
  }
  if (result.detectedChanges > 0 && result.failed > 0) {
    return "Drive se ha comprobado, pero algún documento no pudo validarse. Puedes seguir usando la app.";
  }
  return "Drive al día · no hay documentos nuevos que importar.";
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
      const body = await response.json().catch(() => null) as DriveSyncResult | null;
      if (!response.ok || !body || typeof body.imported !== "number") throw new Error("drive_sync_failed");

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
          <span>La detección automática de Drive no está disponible ahora. Documentos sigue funcionando con normalidad.</span>
        ) : null}
        {phase === "idle" ? <span>Preparando comprobación automática…</span> : null}
      </div>
      <button
        type="button"
        className={styles.action}
        onClick={() => void run(true)}
        disabled={phase === "syncing"}
      >
        {phase === "syncing" ? "Comprobando…" : "Comprobar ahora"}
      </button>
    </section>
  );
}
