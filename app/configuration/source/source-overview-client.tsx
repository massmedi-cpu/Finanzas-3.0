"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readOfficialSourcePreflight, synchronizeOfficialSource, SourceSyncClientError } from "../../../src/application/source-sync-client";
import { hasRecentSourceSyncEvidence, normalizeSourceSyncIncidents } from "../../../src/application/source-sync-incidents";
import type { OfficialSourcePreflightSummary } from "../../../src/application/source-preflight";
import { isConfirmedSourcePostflightReport, type PublicSourcePostflightReport } from "../../../src/domain/source-postflight-reconciliation";
import { SourcePostflightReportPanel } from "./source-postflight-report";
import { SourcePreflightReport } from "./source-preflight-report";
import styles from "./source-overview.module.css";

type GoogleConnection = {
  connected: true;
  accountEmail: string;
  sourceFileName: string;
  lastVerifiedAt: string | null;
  readonly: true;
  managed?: boolean;
};

type GoogleStatus = {
  configured: boolean;
  authMode?: "oauth" | "service-account";
  connection: GoogleConnection | null;
  error?: string;
};

type RuntimeHealth = {
  status: "ok" | "failed";
  compatible: boolean;
  error?: string;
};

type SyncRun = {
  status: string;
  startedAt: string;
  finishedAt: string | null;
  rowsSeen: number;
  rowsInserted: number;
  rowsRevised: number;
  rowsSkipped: number;
  rowsFailed: number;
  rowsMissing: number;
  duplicatesDetected: number;
  warningsCount: number;
};

type SyncStatus = {
  run: SyncRun | null;
  cursors: Array<unknown>;
};

type SyncResult = {
  status: "success";
  rowsInserted: number;
  rowsRevised: number;
  rowsSkipped: number;
  rowsMissing: number;
  duplicatesDetected: number;
  warningsCount: number;
  error?: string;
};

type Notice = { tone: "success" | "warning"; message: string };

const EMPTY_SYNC_STATUS: SyncStatus = { run: null, cursors: [] };

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Aún no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Aún no disponible";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date);
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

function incidentSummary(value: SyncRun | SyncResult | null) {
  if (!value) return null;
  const incidents = normalizeSourceSyncIncidents(value);
  const parts: string[] = [];
  if (incidents.missingRows > 0) {
    parts.push(`${incidents.missingRows} ${incidents.missingRows === 1 ? "movimiento ya no aparece" : "movimientos ya no aparecen"} en la fuente`);
  }
  if (incidents.duplicates > 0) {
    parts.push(`${incidents.duplicates} ${incidents.duplicates === 1 ? "posible duplicado" : "posibles duplicados"}`);
  }
  if (incidents.additionalWarnings > 0) {
    parts.push(`${incidents.additionalWarnings} ${incidents.additionalWarnings === 1 ? "aviso adicional" : "avisos adicionales"}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function actionError(code: string | undefined) {
  if (code === "google_source_preflight_changed") return "La fuente ha cambiado desde la comprobación previa. Vuelve a comprobarla antes de importar. No se ha guardado ningún cambio.";
  if (code === "google_source_preflight_required") return "Vuelve a comprobar la fuente antes de importar movimientos.";
  if (code === "source_preflight_invalid") return "La validación previa no devolvió resultados completos. No se ha iniciado la importación.";
  if (code === "google_source_sync_unconfirmed") return "No se puede confirmar la actualización con la respuesta recibida. Consulta el estado antes de repetirla.";
  if (code === "google_oauth_not_connected") return "Google ya no está conectado. Vuelve a conectar la fuente.";
  if (code === "source_runtime_incompatible") return "La actualización está temporalmente bloqueada para proteger tus datos.";
  if (code === "google_source_changed_during_read") return "La fuente cambió mientras se estaba leyendo. Vuelve a intentarlo.";
  if (code === "google_source_historical_regression") return "La fuente ha cambiado de forma incompatible con el histórico validado. No se ha guardado ningún cambio.";
  if (code === "google_source_contract_invalid") return "La fuente no tiene el formato esperado. No se ha importado ningún movimiento.";
  // A gateway timeout/503 can happen after the database committed the batch.
  // An unconfirmed HTTP response does not prove that its transaction rolled back.
  return "No se ha podido confirmar el resultado de la actualización. Comprueba el último estado de la fuente antes de repetirla.";
}

export default function SourceOverviewClient() {
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeHealth | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(EMPTY_SYNC_STATUS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<OfficialSourcePreflightSummary | null>(null);
  const [postflight, setPostflight] = useState<PublicSourcePostflightReport | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setPreflight(null);
    setPostflight(null);
    setLoading(true);
    setError(null);
    try {
      const [googleResponse, runtimeResponse, syncResponse] = await Promise.all([
        fetch("/api/source/google/status", { cache: "no-store" }),
        fetch("/api/health/source-runtime", { cache: "no-store" }),
        fetch("/api/source/google/sync", { cache: "no-store" }),
      ]);
      const googlePayload = await readJson<GoogleStatus>(googleResponse);
      const runtimePayload = await readJson<RuntimeHealth>(runtimeResponse);
      const syncPayload = syncResponse.ok ? await readJson<SyncStatus>(syncResponse) : EMPTY_SYNC_STATUS;

      // An expired session must never leave previously authenticated source
      // metadata or actions visible while the next request is denied.
      if ([googleResponse, runtimeResponse, syncResponse].some((r) => r.status === 401 || r.status === 403)) {
        setGoogle(null);
        setRuntime(null);
        setSyncStatus(EMPTY_SYNC_STATUS);
        setNotice(null);
        setError([googleResponse, runtimeResponse, syncResponse].some((r) => r.status === 401)
          ? "Inicia sesión para consultar la fuente bancaria."
          : "Tu usuario no tiene acceso al espacio de trabajo de esta fuente.");
        return;
      }

      setGoogle(googleResponse.ok ? googlePayload : null);
      setRuntime(runtimePayload);
      setSyncStatus(syncPayload);

      if ([googleResponse, runtimeResponse, syncResponse].some((r) => r.status === 401)) {
        setError("Inicia sesión para consultar la fuente bancaria.");
      } else if ([googleResponse, runtimeResponse, syncResponse].some((r) => r.status === 403)) {
        setError("Tu usuario no tiene acceso al espacio de trabajo de esta fuente.");
      } else if (!googleResponse.ok) setError("No se ha podido comprobar la conexión con Google.");
      else if (!runtimeResponse.ok && runtimePayload.error !== "source_runtime_incompatible") {
        setError("No se ha podido comprobar si la actualización está disponible.");
      } else if (!syncResponse.ok) setError("No se ha podido consultar la última actualización.");
    } catch {
      // Network failures do not prove that a former connection is still
      // usable; fail closed and remove stale bank metadata and success notices.
      setGoogle(null);
      setRuntime(null);
      setSyncStatus(EMPTY_SYNC_STATUS);
      setNotice(null);
      setError("No se ha podido leer el estado de la fuente bancaria.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connected = Boolean(google?.configured && google.connection?.connected);
  const runtimeReady = runtime?.compatible === true;
  const firstImport = connected && syncStatus.cursors.length === 0;
  const run = syncStatus.run;
  const incidents = useMemo(() => incidentSummary(run), [run]);
  const hasProblem = run?.status === "failed" || run?.status === "partial"
    || (run?.rowsFailed ?? 0) > 0 || Boolean(incidents);
  const staleSuccess = run?.status === "success" && !hasProblem
    && !hasRecentSourceSyncEvidence(run);

  async function checkWithoutImporting() {
    if (!connected || !runtimeReady || busy) return;
    setBusy(true);
    setPreflight(null);
    setPostflight(null);
    setNotice(null);
    setError(null);
    try {
      const payload = await readOfficialSourcePreflight();
      setPreflight(payload);
    } catch (cause) {
      setError(cause instanceof SourceSyncClientError ? actionError(cause.code) : cause instanceof Error ? cause.message : "No se ha podido comprobar la fuente.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcileWithoutImporting() {
    if (!connected || !runtimeReady || busy) return;
    setBusy(true);
    setPreflight(null);
    setPostflight(null);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/source/google/postflight", { cache: "no-store" });
      const payload = await readJson<Partial<PublicSourcePostflightReport>>(response);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setGoogle(null);
          setRuntime(null);
          setSyncStatus(EMPTY_SYNC_STATUS);
          throw new Error(response.status === 401
            ? "Inicia sesión para consultar la fuente bancaria."
            : "Tu usuario no tiene acceso al espacio de trabajo de esta fuente.");
        }
        throw new Error("La conciliación no está disponible. No se han modificado datos.");
      }
      // The same fail-closed contract used in domain tests protects UI.
      if (!isConfirmedSourcePostflightReport(payload)) {
        throw new Error("La conciliación no ha devuelto resultados completos y verificables.");
      }
      setPostflight(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido completar la conciliación sin importar.");
    } finally {
      setBusy(false);
    }
  }

  async function updateFromGoogle() {
    if (!connected || !runtimeReady || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setPreflight(null);
    setPostflight(null);
    let syncWasRequested = false;
    try {
      const payload = await synchronizeOfficialSource();
      syncWasRequested = true;

      const changed = Math.max(0, payload.rowsInserted ?? 0) + Math.max(0, payload.rowsRevised ?? 0);
      const warning = incidentSummary(payload);
      setNotice({
        tone: warning ? "warning" : "success",
        message: warning
          ? `Actualización completada con avisos: ${warning}. El archivo original no se ha modificado.`
          : changed > 0
            ? `Actualización completada: ${changed} ${changed === 1 ? "cambio incorporado" : "cambios incorporados"}.`
            : "Actualización completada. No hay cambios nuevos.",
      });
      await load();
    } catch (cause) {
      // Only a status GET may follow an ambiguous mutation response. Never
      // automatically repeat the POST: a first attempt could have committed.
      if (syncWasRequested || (cause instanceof SourceSyncClientError && cause.syncRequested)) await load();
      setError(cause instanceof SourceSyncClientError ? actionError(cause.code) : cause instanceof Error ? cause.message : "No se ha podido confirmar el resultado de la actualización. Consulta el estado antes de repetirla.");
    } finally {
      setBusy(false);
    }
  }

  const stateLabel = !connected
    ? "Sin conectar"
    : !runtimeReady
      ? "Requiere atención"
      : hasProblem
        ? "Requiere revisión"
        : run?.status === "started"
          ? "Actualizando"
          : run?.status === "success"
            ? staleSuccess ? "Pendiente de comprobar" : "Comprobación reciente"
            : "Preparada";

  return (
    <main className="configuration-shell">
      <header className="configuration-hero">
        <div>
          <Link prefetch={false} className="back-link" href="/configuration">← Configuración</Link>
          <p className="eyebrow">FINANCIAL APP · DATOS</p>
          <h1>Fuente bancaria</h1>
          <p className="hero-copy">Conecta y actualiza tus movimientos sin modificar el archivo original de Google.</p>
        </div>
        <div className="configuration-summary" role="group" aria-label="Resumen de la fuente bancaria">
          <div><strong>{connected ? "Sí" : "No"}</strong><span>Fuente conectada</span></div>
          <div><strong>{formatDateTime(run?.finishedAt ?? run?.startedAt)}</strong><span>Última actualización</span></div>
          <div><strong>{stateLabel}</strong><span>Estado</span></div>
        </div>
      </header>

      {error && <div className="config-message error" role="alert">
        {error}
        {error === "Inicia sesión para consultar la fuente bancaria." && (
          <> <Link prefetch={false} href="/login?next=%2Fconfiguration%2Fsource">Iniciar sesión</Link></>
        )}
      </div>}
      {notice && <div className={`config-message ${notice.tone}`} role="status">{notice.message}</div>}

      {loading ? (
        <section className="config-panel loading-state">Comprobando la fuente bancaria…</section>
      ) : (
        <div className={styles.grid}>
          <section className={`config-panel ${styles.main}`} aria-labelledby="source-overview-heading">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">ESTADO</p>
                <h2 id="source-overview-heading">{connected ? "Google conectado" : "Conecta tu fuente bancaria"}</h2>
              </div>
              <span className="status-chip">Solo lectura</span>
            </div>

            <dl className={styles.statusGrid}>
              <div>
                <dt>Archivo</dt>
                <dd>{google?.connection?.sourceFileName ?? "Sin fuente conectada"}</dd>
              </div>
              <div>
                <dt>Cuenta</dt>
                <dd>{google?.connection?.accountEmail ?? "Sin cuenta conectada"}</dd>
              </div>
              <div>
                <dt>Último resultado</dt>
                <dd>{run?.status === "success" ? "Completado" : run?.status === "failed" ? "Fallido" : "Sin actualizaciones"}</dd>
              </div>
              <div>
                <dt>Cambios de la última actualización</dt>
                <dd>{run ? `${Math.max(0, run.rowsInserted) + Math.max(0, run.rowsRevised)} incorporados` : "Aún no disponible"}</dd>
              </div>
            </dl>

            {hasProblem && (
              <div className={styles.warning} role="status">
                <strong>Hay elementos que necesitan revisión</strong>
                <p>
                  {run?.status === "failed"
                    ? "La última actualización no terminó correctamente. Los datos anteriores siguen disponibles."
                    : incidents ?? "La actualización contiene avisos."}
                </p>
              </div>
            )}

            {staleSuccess && (
              <div className={styles.warning} role="status">
                <strong>Comprueba la actualización</strong>
                <p>La última sincronización correcta tiene más de 48 horas o una fecha futura. No demuestra que los movimientos de Google estén actualizados.</p>
              </div>
            )}

            {firstImport && (
              <div className={styles.firstImport} role="note">
                <strong>Primera actualización protegida</strong>
                <p>Antes de incorporar movimientos, Financial App comprobará la fuente completa sin modificar Google.</p>
              </div>
            )}

            <div className={styles.actions}>
              {connected && runtimeReady && (
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void checkWithoutImporting()}>
                  Comprobar sin importar
                </button>
              )}
              {connected && runtimeReady && (
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void reconcileWithoutImporting()}>
                  Conciliar con datos guardados
                </button>
              )}
              {google?.configured && runtimeReady && !connected && google.authMode !== "service-account" ? (
                <a className="primary-button" href="/api/source/google/connect">Conectar Google</a>
              ) : (
                <button className="primary-button" type="button" disabled={!connected || !runtimeReady || busy} onClick={() => void updateFromGoogle()}>
                  {busy ? "Actualizando…" : "Actualizar desde Google"}
                </button>
              )}
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void load()}>
                Comprobar estado
              </button>
              <Link prefetch={false} className={styles.technicalLink} href="/configuration/source/diagnostics">Detalles técnicos</Link>
            </div>
            {preflight && <SourcePreflightReport summary={preflight} />}
            {postflight && <SourcePostflightReportPanel report={postflight} />}

          </section>

          <aside className={`config-panel ${styles.guarantees}`} aria-labelledby="source-guarantees-heading">
            <div className="panel-heading">
              <div><p className="panel-kicker">PROTECCIÓN</p><h2 id="source-guarantees-heading">Tu archivo original permanece intacto</h2></div>
            </div>
            <ul>
              <li>Google se utiliza únicamente en modo lectura.</li>
              <li>Financial App nunca modifica el archivo bancario original.</li>
              <li>Las revisiones y cambios manuales se guardan solo dentro de Financial App.</li>
              <li>Si una comprobación falla, la actualización se detiene sin fingir éxito.</li>
            </ul>
          </aside>
        </div>
      )}
    </main>
  );
}
