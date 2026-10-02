"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeSourceSyncIncidents } from "../../../src/application/source-sync-incidents";
import { formatMoneyCents } from "../../../src/core/money";
import { useActionFeedback } from "../../action-feedback";
import styles from "./source.module.css";

type GoogleConnection = {
  connected: true;
  accountEmail: string;
  sourceFileName: string;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  readonly: true;
  managed?: boolean;
};

type GoogleStatus = {
  configured: boolean;
  authMode?: "oauth" | "service-account";
  connection: GoogleConnection | null;
  missing?: string[];
};

type RuntimeHealth = { status: "ok" | "failed"; compatible: boolean; error?: string };
type SyncRun = {
  id: string;
  sourceFileId: string;
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
  errorCode: string | null;
};
type SyncCursor = {
  sourceFileId: string;
  sourceSheetId: string;
  sourceRevision: string | null;
  lastSourceRowKey: string | null;
  lastSuccessfulRunId: string | null;
  updatedAt: string;
};
type SyncStatus = { run: SyncRun | null; cursors: SyncCursor[] };
type Notice = { message: string; tone: "success" | "warning" };
type SyncResult = {
  syncRunId: string;
  status: "success";
  rowsSeen: number;
  rowsInserted: number;
  rowsRevised: number;
  rowsSkipped: number;
  rowsMissing: number;
  duplicatesDetected: number;
  warningsCount: number;
  cursorsAdvanced: number;
  sourceRevision: string | null;
};
type PreflightAccount = {
  accountExternalKey: string;
  accountName: string;
  accountType: string;
  lifecycle: string;
  authoritativeRows: number;
  openingBalanceCents: number;
  latestBalanceAfterCents: number | null;
};
type PreflightCursor = { sourceSheetId: string; sheetTitle: string; authoritativeRows: number; lastSourceRowKey: string };
type PreflightSummary = {
  sourceFileId: string;
  sourceRevision: string | null;
  schemaFingerprint: string;
  totalAuthoritativeRows: number;
  accounts: PreflightAccount[];
  cursors: PreflightCursor[];
};

const EMPTY_SYNC_STATUS: SyncStatus = { run: null, cursors: [] };
const CONFIG_LABELS: Record<string, string> = {
  clientId: "Cliente OAuth de Google",
  clientSecret: "Secreto OAuth de Google",
  allowedEmail: "Cuenta Google autorizada",
  redirectUri_https: "URL de retorno OAuth con HTTPS",
  allowedEmail_invalid: "Cuenta Google autorizada válida",
  serviceAccountJson: "Credencial privada de Financial App Reader",
  serviceAccountJson_invalid: "Credencial válida de Financial App Reader",
};
const GOOGLE_CALLBACK_ERRORS: Record<string, string> = {
  google_oauth_denied: "La autorización de Google se canceló o fue rechazada.",
  google_oauth_code_missing: "Google no devolvió un código de autorización válido.",
  google_account_not_allowed: "La cuenta Google utilizada no es la autorizada para Financial App.",
  google_oauth_not_configured: "La conexión Google todavía no está configurada en el servidor.",
  google_oauth_store_failed: "La autorización se completó, pero no se pudo guardar la conexión de forma segura.",
  google_oauth_callback_failed: "No se pudo completar la conexión con Google.",
  google_source_historical_regression: "La fuente bancaria ha perdido o reclasificado parte del histórico validado. La conexión no se ha guardado.",
  invalid_google_oauth_state: "La respuesta de Google no coincide con la sesión que inició la autorización.",
  google_oauth_state_missing: "La sesión de autorización de Google ha caducado. Iníciala de nuevo.",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Aún no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no válida";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(date);
}

function formatSourceMoney(value: number | null) {
  return value === null ? "Sin saldo" : formatMoneyCents(value);
}

function sourceIncidentMessage(value: SyncRun | SyncResult) {
  const incidents = normalizeSourceSyncIncidents(value);
  if (incidents.missingRows === 0 && incidents.duplicates === 0 && incidents.additionalWarnings === 0) return null;
  const parts: string[] = [];
  if (incidents.missingRows > 0) parts.push(`${incidents.missingRows} ${incidents.missingRows === 1 ? "movimiento ya no aparece" : "movimientos ya no aparecen"} en la fuente.`);
  if (incidents.duplicates > 0) parts.push(`${incidents.duplicates} ${incidents.duplicates === 1 ? "posible duplicado detectado" : "posibles duplicados detectados"}.`);
  if (incidents.additionalWarnings > 0) parts.push(`${incidents.additionalWarnings} ${incidents.additionalWarnings === 1 ? "aviso adicional requiere" : "avisos adicionales requieren"} revisión.`);
  parts.push("La fuente bancaria original no se ha modificado.");
  return parts.join(" ");
}

function sourceActionErrorMessage(code: string | undefined) {
  if (code === "google_oauth_not_connected") return "Google ya no está conectado. Vuelve a autorizar la fuente.";
  if (code === "google_service_account_unavailable") return "Financial App Reader no ha podido autenticarse con Google. La importación permanece bloqueada sin escribir datos.";
  if (code === "source_runtime_incompatible") return "La sincronización está detenida porque faltan comprobaciones de seguridad. Inténtalo más tarde.";
  if (code === "google_connection_contract_mismatch") return "La conexión Google no coincide con la cuenta autorizada.";
  if (code === "google_oauth_refresh_unavailable") return "Google no ha podido renovar temporalmente la autorización. Vuelve a intentarlo; si persiste, reconecta la fuente.";
  if (code === "google_source_changed_during_read") return "La fuente bancaria cambió mientras se estaba leyendo. No se ha aceptado una fotografía mezclada. Vuelve a intentarlo.";
  if (code === "google_source_historical_regression") return "La fuente bancaria ha perdido o reclasificado parte del histórico validado. No se ha persistido ningún cambio.";
  if (code === "google_source_contract_invalid") return "La fuente bancaria no cumple el contrato validado. No se ha importado ningún movimiento.";
  return "La operación no se ha completado. No se mostrará como correcta sin confirmación real.";
}

async function jsonOrEmpty<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export default function SourceClient() {
  const actionFeedback = useActionFeedback();
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeHealth | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(EMPTY_SYNC_STATUS);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [preflight, setPreflight] = useState<PreflightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [googleResponse, runtimeResponse, syncResponse] = await Promise.all([
        fetch("/api/source/google/status", { cache: "no-store" }),
        fetch("/api/health/source-runtime", { cache: "no-store" }),
        fetch("/api/source/google/sync", { cache: "no-store" }),
      ]);
      const googlePayload = await jsonOrEmpty<GoogleStatus>(googleResponse);
      const runtimePayload = await jsonOrEmpty<RuntimeHealth>(runtimeResponse);
      const syncPayload = syncResponse.ok ? await jsonOrEmpty<SyncStatus>(syncResponse) : EMPTY_SYNC_STATUS;
      setGoogle(googlePayload);
      setRuntime(runtimePayload);
      setSyncStatus(syncPayload);
      if (!googleResponse.ok && googlePayload.configured) setError("No se ha podido comprobar el estado de la conexión con Google.");
      else if (!runtimeResponse.ok && runtimePayload.error !== "source_runtime_incompatible") setError("No se han podido comprobar las condiciones para sincronizar de forma segura.");
      else if (!syncResponse.ok) setError("No se ha podido leer el historial de sincronización.");
    } catch {
      setError("No se ha podido leer el estado de la fuente bancaria.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get("google");
    const callbackCode = params.get("code") ?? "";
    void (async () => {
      await load();
      if (googleResult === "connected") setNotice({ message: "Google se ha conectado y la fuente oficial se ha validado en modo solo lectura.", tone: "success" });
      else if (googleResult === "error") setError(GOOGLE_CALLBACK_ERRORS[callbackCode] ?? "No se pudo completar la conexión con Google.");
      if (googleResult) window.history.replaceState({}, "", "/configuration/source");
    })();
  }, [load]);

  const connected = Boolean(google?.configured && google.connection?.connected);
  const serviceAccountMode = google?.authMode === "service-account";
  const managedConnection = google?.connection?.managed === true;
  const runtimeReady = runtime?.compatible === true;
  const hasSuccessfulSync = syncStatus.cursors.length > 0;
  const firstImportNeedsPreflight = connected && !hasSuccessfulSync;
  const readyToPreflight = connected && runtimeReady && !busy;
  const readyToSync = connected && runtimeReady && !busy && (!firstImportNeedsPreflight || preflight !== null);
  const latestAttemptFailed = syncStatus.run?.status === "failed";
  const persistentIncidentCounts = normalizeSourceSyncIncidents(syncStatus.run);
  const persistentIncident = syncStatus.run ? sourceIncidentMessage(syncStatus.run) : null;
  const missingLabels = useMemo(() => (google?.missing ?? []).map((item) => CONFIG_LABELS[item] ?? item), [google?.missing]);

  async function preflightSource() {
    if (!readyToPreflight) return;
    setBusy(true); setError(null); setNotice(null);
    const feedbackId = "source:preflight";
    actionFeedback.begin(feedbackId, "Validando la fuente bancaria en modo solo lectura…");
    try {
      const response = await fetch("/api/source/google/preflight", { method: "POST" });
      const payload = await jsonOrEmpty<PreflightSummary & { error?: string }>(response);
      if (!response.ok) throw new Error(sourceActionErrorMessage(payload.error));
      setPreflight(payload);
      const message = `Validación correcta: ${payload.totalAuthoritativeRows} movimientos y ${payload.accounts.length} productos, sin modificar la fuente.`;
      setNotice({ message, tone: "success" });
      actionFeedback.success(feedbackId, message);
    } catch (cause) {
      setPreflight(null);
      const message = cause instanceof Error ? cause.message : "La validación no se ha podido completar.";
      setError(message); actionFeedback.error(feedbackId, message);
    } finally { setBusy(false); }
  }

  async function synchronize() {
    if (!readyToSync) return;
    setBusy(true); setError(null); setNotice(null); setSyncResult(null);
    const feedbackId = "source:sync";
    actionFeedback.begin(feedbackId, "Actualizando datos desde Google…");
    try {
      const response = await fetch("/api/source/google/sync", { method: "POST" });
      const payload = await jsonOrEmpty<SyncResult & { error?: string }>(response);
      if (!response.ok) throw new Error(sourceActionErrorMessage(payload.error));
      setSyncResult(payload);
      const incident = sourceIncidentMessage(payload);
      const summary = `Actualización completada: ${payload.rowsInserted} nuevos, ${payload.rowsRevised} revisados y ${payload.rowsSkipped} sin cambios.`;
      setNotice({ message: incident ? `${summary} ${incident}` : summary, tone: incident ? "warning" : "success" });
      await load();
      actionFeedback.success(feedbackId, summary);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "La actualización no se ha podido completar.";
      await load(); setError(message); actionFeedback.error(feedbackId, message);
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!connected || busy || managedConnection) return;
    setBusy(true); setError(null); setNotice(null);
    const feedbackId = "source:disconnect";
    actionFeedback.begin(feedbackId, "Desconectando Google…");
    try {
      const response = await fetch("/api/source/google/status", { method: "DELETE" });
      if (!response.ok) throw new Error("No se ha podido desconectar Google.");
      setSyncResult(null); setPreflight(null);
      const message = "Conexión Google eliminada. Los movimientos ya importados permanecen intactos.";
      setNotice({ message, tone: "success" });
      await load(); actionFeedback.success(feedbackId, message);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se ha podido desconectar Google.";
      setError(message); actionFeedback.error(feedbackId, message);
    } finally { setBusy(false); }
  }

  const lastSyncLabel = syncStatus.run
    ? `${syncStatus.run.status === "success" ? "Completada" : "Con incidencias"} · ${formatDateTime(syncStatus.run.finishedAt ?? syncStatus.run.startedAt)}`
    : "Aún no realizada";

  return (
    <main className="configuration-shell">
      <header className="configuration-hero">
        <div>
          <a className="back-link" href="/configuration">← Configuración</a>
          <p className="eyebrow">FINANCIAL APP · FUENTE BANCARIA</p>
          <h1>Fuente bancaria</h1>
          <p className="hero-copy">Consulta aquí si la fuente está conectada, cuándo se actualizó por última vez y si necesita atención. Google Drive y Google Sheets se usan exclusivamente en lectura.</p>
        </div>
        <div className="configuration-summary" aria-label="Estado de la fuente bancaria">
          <div><strong>{connected ? "Sí" : "No"}</strong><span>Fuente conectada</span></div>
          <div><strong>{runtimeReady ? "Sí" : "No"}</strong><span>Lista para actualizar</span></div>
          <div><strong>{syncStatus.run?.status === "success" ? "Correcta" : syncStatus.run ? "Revisar" : "Pendiente"}</strong><span>Última actualización</span></div>
        </div>
      </header>

      {error && <div className="config-message error" role="alert">{error}</div>}
      {notice && <div className={`config-message ${notice.tone}`} role="status">{notice.message}</div>}

      {loading ? (
        <section className="config-panel loading-state">Comprobando conexión y última actualización…</section>
      ) : (
        <div className={styles.grid}>
          <section className={`config-panel ${styles.mainPanel}`} aria-labelledby="source-status-heading">
            <div className="panel-heading">
              <div><p className="panel-kicker">ESTADO</p><h2 id="source-status-heading">Tu fuente de datos</h2></div>
              <span className="status-chip">Solo lectura</span>
            </div>

            <div className={styles.statusList}>
              <div><span>Conexión</span><strong>{connected ? "Conectada" : "Sin conectar"}</strong><p>{google?.connection?.sourceFileName ?? "No hay una fuente autorizada."}</p></div>
              <div><span>Última actualización</span><strong>{lastSyncLabel}</strong><p>{persistentIncident ?? "Sin avisos pendientes detectados."}</p></div>
              <div><span>Protección</span><strong>{runtimeReady ? "Activa" : "Bloqueada"}</strong><p>{runtimeReady ? "La fuente original permanece intacta y se comprueba antes de importar." : "No se actualizarán datos hasta recuperar las comprobaciones de seguridad."}</p></div>
            </div>

            {!google?.configured && missingLabels.length > 0 && <div className={styles.missingBox}><strong>Configuración pendiente</strong><ul>{missingLabels.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {firstImportNeedsPreflight && !preflight && <div className={styles.missingBox}><strong>Primera actualización protegida</strong><p>Antes de importar por primera vez, Financial App comprobará la fuente completa sin modificarla.</p></div>}

            <div className={styles.actions}>
              {google?.configured && runtimeReady && !connected && !serviceAccountMode ? (
                <a className={`primary-button ${styles.buttonLink}`} href="/api/source/google/connect">Conectar Google</a>
              ) : firstImportNeedsPreflight && !preflight ? (
                <button className="primary-button" type="button" disabled={!readyToPreflight} onClick={() => void preflightSource()}>{busy ? "Validando…" : "Validar y preparar primera actualización"}</button>
              ) : (
                <button className="primary-button" type="button" disabled={!readyToSync} onClick={() => void synchronize()}>{busy ? "Actualizando…" : "Actualizar datos"}</button>
              )}
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void load()}>Comprobar estado</button>
              {connected && !managedConnection && <button className="secondary-button" type="button" disabled={busy} onClick={() => void disconnect()}>Desconectar Google</button>}
            </div>
          </section>

          <aside className={`config-panel ${styles.sidePanel}`}>
            <div className="panel-heading"><div><p className="panel-kicker">GARANTÍAS</p><h2>Qué protege Financial App</h2></div></div>
            <ul className={styles.guarantees}>
              <li>Google solo concede permisos de lectura.</li>
              <li>La fuente bancaria original no se modifica.</li>
              <li>Las cuentas y movimientos se comprueban antes de incorporarlos.</li>
              <li>Si falta una comprobación de seguridad, la actualización se detiene.</li>
            </ul>
          </aside>

          <section className={`config-panel ${styles.mainPanel} ${styles.diagnosticsPanel}`} aria-labelledby="diagnostics-heading">
            <details className={styles.technicalDetails}>
              <summary id="diagnostics-heading">Detalles técnicos y diagnóstico</summary>
              <p className={styles.technicalIntro}>Información avanzada para comprobar trazabilidad, prevalidación y cursores. No necesitas usarla para actualizar tus datos normalmente.</p>

              <div className={styles.diagnosticsSection}>
                <div className="panel-heading"><div><p className="panel-kicker">TRAZABILIDAD</p><h3>{latestAttemptFailed ? "Último intento" : "Última sincronización persistida"}</h3></div></div>
                {syncStatus.run ? (
                  <>
                    <dl className={styles.metrics}>
                      <div><dt>Vistos</dt><dd>{syncStatus.run.rowsSeen}</dd></div><div><dt>Nuevos</dt><dd>{syncStatus.run.rowsInserted}</dd></div><div><dt>Revisados</dt><dd>{syncStatus.run.rowsRevised}</dd></div><div><dt>Sin cambios</dt><dd>{syncStatus.run.rowsSkipped}</dd></div><div><dt>Fallidas</dt><dd>{syncStatus.run.rowsFailed}</dd></div><div><dt>Avisos</dt><dd>{persistentIncidentCounts.additionalWarnings}</dd></div>
                    </dl>
                    <div className={styles.metaRows}><p><span>Inicio</span><strong>{formatDateTime(syncStatus.run.startedAt)}</strong></p><p><span>Fin</span><strong>{formatDateTime(syncStatus.run.finishedAt)}</strong></p><p><span>Revisión fuente</span><strong>{syncStatus.run.sourceRevision ?? "Sin revisión"}</strong></p></div>
                  </>
                ) : <div className={styles.empty}>Todavía no existe una sincronización persistida.</div>}
                {syncResult && <div className={styles.lastResult}>Último resultado confirmado: {syncResult.rowsSeen} filas vistas · {syncResult.cursorsAdvanced} cursores avanzados.</div>}
              </div>

              {preflight && <div className={styles.diagnosticsSection}>
                <div className="panel-heading"><div><p className="panel-kicker">PREVALIDACIÓN READ-ONLY</p><h3>Fotografía autoritativa</h3></div><span className="status-chip">Validada</span></div>
                <dl className={styles.metrics}><div><dt>Movimientos</dt><dd>{preflight.totalAuthoritativeRows}</dd></div><div><dt>Productos</dt><dd>{preflight.accounts.length}</dd></div><div><dt>Pestañas</dt><dd>{preflight.cursors.length}</dd></div></dl>
                <div className={styles.preflightProducts}>{preflight.accounts.map((account) => <article key={account.accountExternalKey}><span>{account.lifecycle === "archived" ? "Archivada" : "Activa"} · {account.accountType}</span><strong>{account.accountName}</strong><small>{account.authoritativeRows} movimientos · saldo inicial {formatSourceMoney(account.openingBalanceCents)}</small><small>Último saldo observado: {formatSourceMoney(account.latestBalanceAfterCents)}</small></article>)}</div>
              </div>}

              <div className={styles.diagnosticsSection}>
                <div className="panel-heading"><div><p className="panel-kicker">CURSORES</p><h3>Pestañas físicas</h3></div></div>
                {syncStatus.cursors.length ? <div className={styles.cursorList}>{syncStatus.cursors.map((cursor) => <article key={cursor.sourceSheetId}><span>Pestaña {cursor.sourceSheetId}</span><strong>{cursor.lastSourceRowKey ?? "Sin fila"}</strong><small>{formatDateTime(cursor.updatedAt)}</small></article>)}</div> : <div className={styles.empty}>Los cursores aparecerán después de la primera sincronización válida.</div>}
              </div>

              {connected && (!firstImportNeedsPreflight || preflight) && <div className={styles.actions}><button className="secondary-button" type="button" disabled={!readyToPreflight} onClick={() => void preflightSource()}>{preflight ? "Volver a validar fuente" : "Validar fuente"}</button></div>}
            </details>
          </section>
        </div>
      )}
    </main>
  );
}
