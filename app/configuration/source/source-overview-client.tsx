"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readOfficialSourcePreflight, synchronizeOfficialSource, SourceSyncClientError } from "../../../src/application/source-sync-client";
import { hasPersistedSourceSyncReceipt, hasRecentSourceSyncEvidence, isVerifiedSourceSyncStatus, normalizeSourceSyncIncidents } from "../../../src/application/source-sync-incidents";
import type { OfficialSourcePreflightSummary } from "../../../src/application/source-preflight";
import {
  isConfirmedSourcePostflightReport,
  type PublicSourcePostflightReport,
} from "../../../src/domain/source-postflight-reconciliation";
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
  id: string;
  sourceRevision: string | null;
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

// Spanish's default grouping threshold may omit separators for four digits.
// Source coverage counts must still show "3.218", as required by es-ES UX.
const SOURCE_COUNT_FORMATTER = new Intl.NumberFormat("es-ES", { useGrouping: true });
const formatSourceCount = (value: number) => SOURCE_COUNT_FORMATTER.format(value);

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
  if (code === "google_source_existing_rows_changed") return "Se han detectado cambios en movimientos que ya estaban guardados. La importación se ha bloqueado para proteger el histórico: no se ha reimportado, modificado ni borrado ningún movimiento. Comprueba la fuente original antes de volver a intentarlo.";
  if (code === "source_postflight_invalid_record" || code === "source_postflight_unavailable") return "No se ha podido verificar íntegramente el histórico guardado. No se ha iniciado la importación.";
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

export default function SourceOverviewClient({ previewReadOnly = false }: { previewReadOnly?: boolean }) {
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeHealth | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(EMPTY_SYNC_STATUS);
  const [syncStateVerified, setSyncStateVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<OfficialSourcePreflightSummary | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [coverage, setCoverage] = useState<PublicSourcePostflightReport | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPreflight(null);
    // A protected administrative append does not create a normal sync receipt.
    // Never reuse stale coverage from a previous read-only comparison.
    setCoverage(null);
    setCoverageError(null);
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
      const rawSync = syncResponse.ok ? await readJson<unknown>(syncResponse) : null;
      const syncValid = isVerifiedSourceSyncStatus(rawSync);
      const syncPayload = syncValid ? rawSync as SyncStatus : EMPTY_SYNC_STATUS;

      // An expired session must never leave previously authenticated source
      // metadata or actions visible while the next request is denied.
      if ([googleResponse, runtimeResponse, syncResponse].some((r) => r.status === 401 || r.status === 403)) {
        setGoogle(null);
        setRuntime(null);
        setSyncStatus(EMPTY_SYNC_STATUS);
        setSyncStateVerified(false);
        setNotice(null);
        setError([googleResponse, runtimeResponse, syncResponse].some((r) => r.status === 401)
          ? "Inicia sesión para consultar la fuente bancaria."
          : "La sesión actual no tiene acceso a esta fuente bancaria.");
        return null;
      }

      setGoogle(googleResponse.ok ? googlePayload : null);
      setRuntime(runtimeResponse.ok ? runtimePayload : null);
      setSyncStatus(syncPayload);
      setSyncStateVerified(syncValid);

      if ([googleResponse, runtimeResponse, syncResponse].some((r) => r.status === 401)) {
        setError("Inicia sesión para consultar la fuente bancaria.");
      } else if ([googleResponse, runtimeResponse, syncResponse].some((r) => r.status === 403)) {
        setError("La sesión actual no tiene acceso a esta fuente bancaria.");
      } else if (!googleResponse.ok) setError("No se ha podido comprobar la conexión con Google.");
      else if (!runtimeResponse.ok && runtimePayload.error !== "source_runtime_incompatible") {
        setError("No se ha podido comprobar si la actualización está disponible.");
      } else if (!syncResponse.ok || !syncValid) setError("No se ha podido verificar el estado de la última sincronización.");
      // Return the exact data from this GET, not React state from a previous
      // render. An unavailable status cannot confirm the preceding POST.
      return googleResponse.ok && runtimeResponse.ok && syncResponse.ok
        && syncValid ? syncPayload : null;
    } catch {
      // Network failures do not prove that a former connection is still
      // usable; fail closed and remove stale bank metadata and success notices.
      setGoogle(null);
      setRuntime(null);
      setSyncStatus(EMPTY_SYNC_STATUS);
      setSyncStateVerified(false);
      setNotice(null);
      setError("No se ha podido leer el estado de la fuente bancaria.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sourceVerified = google !== null && !loading;
  const connected = Boolean(google?.configured && google.connection?.connected);
  const runtimeReady = runtime?.status === "ok" && runtime?.compatible === true;
  const firstImport = connected && syncStateVerified && syncStatus.cursors.length === 0;
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

  async function verifyStoredMovements() {
    if (!connected || busy || checkingCoverage) return;
    setCheckingCoverage(true);
    setCoverage(null);
    setCoverageError(null);
    try {
      const response = await fetch("/api/source/google/postflight", {
        method: "GET", cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setCoverageError(response.status === 401
          ? "Tu sesión ha caducado. Inicia sesión para volver a comprobar los movimientos."
          : "Tu cuenta no tiene acceso a esta comprobación.");
        setGoogle(null);
        setSyncStateVerified(false);
        return;
      }
      if (!response.ok) {
        setCoverageError("No se pudo comparar la fuente con los movimientos guardados. No se ha modificado ningún dato.");
        return;
      }
      const raw = await readJson<unknown>(response);
      if (!isConfirmedSourcePostflightReport(raw)
        || raw.readConsistency !== "sequential_non_atomic") {
        setCoverageError("La comprobación ha devuelto datos incompletos. No se puede confirmar la cobertura.");
        return;
      }
      setCoverage(raw);
    } catch {
      setCoverageError("No se pudo completar la comprobación. No se ha modificado ningún movimiento.");
    } finally {
      setCheckingCoverage(false);
    }
  }

  async function updateFromGoogle() {
    if (previewReadOnly || !connected || !runtimeReady || !syncStateVerified || busy || checkingCoverage) return;
    setCoverage(null);
    setCoverageError(null);
    setBusy(true);
    setError(null);
    setNotice(null);
    setPreflight(null);
    let syncWasRequested = false;
    try {
      const payload = await synchronizeOfficialSource();
      syncWasRequested = true;

      const changed = Math.max(0, payload.rowsInserted ?? 0) + Math.max(0, payload.rowsRevised ?? 0);
      const persisted = await load();
      if (!hasPersistedSourceSyncReceipt(persisted?.run, payload)) {
        setNotice(null);
        setError("El servidor confirmó la solicitud, pero no se pudo verificar el mismo lote en el historial persistido. Puede haberse guardado: comprueba el estado antes de repetir la operación.");
        return;
      }
      const warning = incidentSummary(payload);
      setNotice({
        tone: warning ? "warning" : "success",
        message: warning
          ? `Actualización completada con avisos: ${warning}. El archivo original no se ha modificado.`
          : changed > 0
            ? `Actualización completada: ${changed} ${changed === 1 ? "cambio incorporado" : "cambios incorporados"}.`
            : "Actualización completada. No hay cambios nuevos.",
      });
    } catch (cause) {
      // Only a status GET may follow an ambiguous mutation response. Never
      // automatically repeat the POST: a first attempt could have committed.
      if (syncWasRequested || (cause instanceof SourceSyncClientError && cause.syncRequested)) await load();
      setError(cause instanceof SourceSyncClientError ? actionError(cause.code) : cause instanceof Error ? cause.message : "No se ha podido confirmar el resultado de la actualización. Consulta el estado antes de repetirla.");
    } finally {
      setBusy(false);
    }
  }

  const stateLabel = !sourceVerified
    ? "Sin verificar"
    : !connected
      ? "Sin conectar"
    : !runtimeReady
      ? "Requiere atención"
      : !syncStateVerified
        ? "Sin verificar"
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
          <div><strong>{!sourceVerified ? "—" : connected ? "Sí" : "No"}</strong><span>Fuente conectada</span></div>
          <div><strong>{formatDateTime(run?.finishedAt ?? run?.startedAt)}</strong><span>Última ejecución registrada</span></div>
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
                <h2 id="source-overview-heading">{!sourceVerified ? "Estado de Google sin verificar" : connected ? "Google conectado" : "Conecta tu fuente bancaria"}</h2>
              </div>
              <span className="status-chip">Solo lectura</span>
            </div>

            <dl className={styles.statusGrid}>
              <div>
                <dt>Archivo</dt>
                <dd>{google?.connection?.sourceFileName ?? (sourceVerified ? "Sin fuente conectada" : "No verificado")}</dd>
              </div>
              <div>
                <dt>Cuenta</dt>
                <dd>{google?.connection?.accountEmail ?? (sourceVerified ? "Sin cuenta conectada" : "No verificado")}</dd>
              </div>
              <div>
                <dt>Último resultado</dt>
                <dd>{!sourceVerified ? "No verificado" : run?.status === "success" ? hasProblem ? "Completada con avisos" : staleSuccess ? "Pendiente de comprobar" : "Completada" : run?.status === "failed" ? "Fallida" : run?.status === "partial" ? "Parcial" : run?.status === "started" ? "En curso" : run ? "En revisión" : syncStateVerified ? "Sin actualizaciones" : "No verificado"}</dd>
              </div>
              <div>
                <dt>Cambios confirmados en el último intento</dt>
                <dd>{run?.status === "success"
                  ? `${Math.max(0, run.rowsInserted) + Math.max(0, run.rowsRevised)} incorporados${hasProblem ? " · con avisos" : ""}`
                  : run ? "No confirmados" : "Aún no disponible"}</dd>
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
                <p>El último proceso de sincronización registrado tiene más de 48 horas o una fecha futura. Este historial no incluye posibles altas protegidas: comprueba los movimientos guardados antes de concluir que faltan datos.</p>
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
                <button className="secondary-button" type="button" disabled={busy || checkingCoverage} onClick={() => void checkWithoutImporting()}>
                  Comprobar sin importar
                </button>
              )}
              {connected && (
                <button className="secondary-button" type="button"
                  disabled={busy || checkingCoverage}
                  onClick={() => void verifyStoredMovements()}>
                  {checkingCoverage ? "Comparando…" : "Comparar movimientos guardados"}
                </button>
              )}
              {google?.configured && runtimeReady && !connected && google.authMode !== "service-account" ? (
                <a className="primary-button" href="/api/source/google/connect">Conectar Google</a>
              ) : (
                <button className="primary-button" type="button" disabled={previewReadOnly || !connected || !runtimeReady || !syncStateVerified || busy || checkingCoverage} onClick={() => void updateFromGoogle()}>
                  {previewReadOnly ? "Actualización desactivada en pruebas" : busy ? "Actualizando…" : "Actualizar desde Google"}
                </button>
              )}
              <button className="secondary-button" type="button" disabled={busy || checkingCoverage} onClick={() => void load()}>
                Comprobar estado
              </button>
              <Link prefetch={false} className={styles.technicalLink} href="/configuration/source/diagnostics">Detalles técnicos</Link>
            </div>
            {previewReadOnly && <p className={styles.previewNotice} role="note">Esta versión de pruebas permite comprobar los movimientos, pero no actualizarlos. La fuente bancaria y la producción permanecen protegidas.</p>}
            {preflight && <SourcePreflightReport summary={preflight} />}
            {coverageError && <p className="config-message warning" role="alert">{coverageError}</p>}
            {coverage && (
              <section className={styles.coverage} role="region" aria-label="Comparación de movimientos guardados">
                <h3>{coverage.status === "verified"
                  ? "Todos los movimientos comprobados coinciden"
                  : coverage.status === "pending"
                    ? "Hay movimientos pendientes de incorporar"
                    : "Se han encontrado diferencias que necesitan revisión"}</h3>
                <dl className={styles.statusGrid}>
                  <div><dt>En Google</dt><dd>{formatSourceCount(coverage.sourceRows)}</dd></div>
                  <div><dt>Guardados</dt><dd>{formatSourceCount(coverage.persistedRows)}</dd></div>
                  <div><dt>Coincidentes</dt><dd>{formatSourceCount(coverage.matchingRows)}</dd></div>
                  <div><dt>Pendientes</dt><dd>{formatSourceCount(coverage.pendingRows)}</dd></div>
                  <div><dt>Con diferencias</dt><dd>{formatSourceCount(coverage.differingRows)}</dd></div>
                  <div><dt>Sin origen localizado</dt><dd>{formatSourceCount(coverage.orphanRows)}</dd></div>
                </dl>
                <p>
                  {coverage.matchingUnknownBalances > 0
                    ? `${coverage.matchingUnknownBalances} ${coverage.matchingUnknownBalances === 1 ? "saldo no facilitado por el banco se mantiene" : "saldos no facilitados por el banco se mantienen"} sin inventar valores. `
                    : ""}
                  Comparación de solo lectura entre dos consultas sucesivas. No modifica Google ni los movimientos y no sustituye el historial de ejecuciones.
                </p>
              </section>
            )}

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
