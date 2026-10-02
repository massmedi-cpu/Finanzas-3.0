"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SourceClient from "./source-client";

type GoogleStatus = {
  configured: boolean;
  connection: null | {
    connected: true;
    accountEmail: string;
    sourceFileName: string;
    lastVerifiedAt: string | null;
    readonly: true;
  };
};

type SyncRun = {
  status: string;
  startedAt: string;
  finishedAt: string | null;
  rowsInserted: number;
  rowsRevised: number;
  rowsSkipped: number;
  rowsFailed: number;
  rowsMissing: number;
  duplicatesDetected: number;
  warningsCount: number;
};

type SyncStatus = { run: SyncRun | null };

type SyncResult = {
  rowsInserted?: number;
  rowsRevised?: number;
  rowsSkipped?: number;
  rowsMissing?: number;
  duplicatesDetected?: number;
  warningsCount?: number;
  error?: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Aún no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function hasIncidents(run: SyncRun | null) {
  if (!run) return false;
  return run.status === "failed"
    || run.rowsFailed > 0
    || run.rowsMissing > 0
    || run.duplicatesDetected > 0
    || run.warningsCount > 0;
}

export default function SourceSimpleClient() {
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ run: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [googleResponse, syncResponse] = await Promise.all([
        fetch("/api/source/google/status", { cache: "no-store" }),
        fetch("/api/source/google/sync", { cache: "no-store" }),
      ]);
      if (!googleResponse.ok) throw new Error("google_status_failed");
      const googlePayload = await googleResponse.json() as GoogleStatus;
      const syncPayload = syncResponse.ok ? await syncResponse.json() as SyncStatus : { run: null };
      setGoogle(googlePayload);
      setSync(syncPayload);
    } catch {
      setError("No se ha podido comprobar el estado de la fuente bancaria.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateData() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch("/api/source/google/sync", { method: "POST", cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as SyncResult;
      if (!response.ok) throw new Error(payload.error ?? "sync_failed");
      const changed = Math.max(0, payload.rowsInserted ?? 0) + Math.max(0, payload.rowsRevised ?? 0);
      setFeedback(changed > 0 ? `${changed} cambios incorporados.` : "Datos comprobados: no hay cambios nuevos.");
      await load();
    } catch {
      setError("No se ha podido actualizar. Los datos ya importados permanecen intactos.");
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(google?.configured && google.connection?.connected);
  const run = sync.run;
  const incidents = hasIncidents(run);
  const statusLabel = loading
    ? "Comprobando…"
    : !connected
      ? "Pendiente de conexión"
      : run?.status === "failed"
        ? "Necesita revisión"
        : incidents
          ? "Con avisos"
          : "Conectada";
  const lastUpdate = useMemo(() => formatDateTime(run?.finishedAt ?? run?.startedAt), [run]);

  return (
    <main className="configuration-shell">
      <header className="configuration-hero">
        <div>
          <a className="back-link" href="/configuration">← Configuración</a>
          <p className="eyebrow">FINANCIAL APP · FUENTE BANCARIA</p>
          <h1>Fuente bancaria</h1>
          <p className="hero-copy">Consulta y actualiza tus datos bancarios sin modificar nunca el archivo original de Google Drive.</p>
        </div>
        <div className="configuration-summary" aria-label="Resumen de la fuente bancaria">
          <div><strong>{statusLabel}</strong><span>Estado</span></div>
          <div><strong>{lastUpdate}</strong><span>Última actualización</span></div>
          <div><strong>Solo lectura</strong><span>Protección de la fuente</span></div>
        </div>
      </header>

      {error && <div className="config-message error" role="alert">{error}</div>}
      {feedback && <div className="config-message success" role="status">{feedback}</div>}

      <section className="config-panel" aria-labelledby="source-simple-heading">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">ESTADO ACTUAL</p>
            <h2 id="source-simple-heading">{connected ? "Fuente conectada" : "Fuente pendiente"}</h2>
          </div>
          <span className="status-chip">{incidents ? "Revisar" : connected ? "Lista" : "Pendiente"}</span>
        </div>
        <p>
          {connected
            ? `${google?.connection?.sourceFileName ?? "Fuente bancaria"} está disponible en modo solo lectura.`
            : "La fuente todavía no está disponible para actualizar datos."}
        </p>
        {incidents && (
          <div className="config-message warning" role="status">
            La última actualización contiene avisos. Puedes revisar los detalles técnicos sin perder ni modificar los movimientos ya importados.
          </div>
        )}
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <button className="primary-button" type="button" disabled={!connected || busy} onClick={() => void updateData()}>
            {busy ? "Actualizando…" : "Actualizar datos"}
          </button>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void load()}>
            Comprobar estado
          </button>
        </div>
      </section>

      <details className="config-panel" style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Diagnóstico técnico y opciones avanzadas</summary>
        <p style={{ marginTop: ".75rem" }}>
          Aquí se muestran prevalidación, cursores, revisiones de fuente, conexión y trazabilidad completa para diagnóstico.
        </p>
        <SourceClient />
      </details>
    </main>
  );
}
