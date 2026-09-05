"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./source.module.css";

type GoogleConnection = {
  connected: true;
  accountEmail: string;
  sourceFileName: string;
  connectedAt: string;
  lastVerifiedAt: string | null;
  readonly: true;
};

type GoogleStatus = {
  configured: boolean;
  connection: GoogleConnection | null;
  missing?: string[];
  error?: string;
};

type RuntimeHealth = {
  status: "ok" | "failed";
  compatible: boolean;
  capabilities?: {
    contractVersion: number;
    sourceAccountLifecycle: boolean;
    canonicalProductSelection: boolean;
  };
  error?: string;
};

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
  duplicatesDetected: number;
  warningsCount: number;
  errorCode: string | null;
  errorMessage: string | null;
};

type SyncCursor = {
  sourceFileId: string;
  sourceSheetId: string;
  sourceRevision: string | null;
  lastSourceRowKey: string | null;
  lastSuccessfulRunId: string | null;
  updatedAt: string;
};

type SyncStatus = {
  run: SyncRun | null;
  cursors: SyncCursor[];
};

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
  newestBankDate: string | null;
  oldestBankDate: string | null;
  latestBalanceAfterCents: number | null;
};

type PreflightCursor = {
  sourceSheetId: string;
  sheetTitle: string;
  authoritativeRows: number;
  lastSourceRowKey: string;
};

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
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function formatMoneyCents(value: number | null) {
  if (value === null) return "Sin saldo";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function sourceActionErrorMessage(code: string | undefined) {
  if (code === "google_oauth_not_connected") return "Google ya no está conectado. Vuelve a autorizar la fuente.";
  if (code === "source_runtime_incompatible") return "El runtime de sincronización no cumple el contrato seguro requerido.";
  if (code === "google_connection_contract_mismatch") return "La conexión Google no coincide con la cuenta autorizada.";
  if (code === "google_oauth_refresh_unavailable") {
    return "Google no ha podido renovar temporalmente la autorización. Vuelve a intentarlo; si el problema persiste, reconecta la fuente.";
  }
  if (code === "google_source_changed_during_read") {
    return "La fuente bancaria cambió mientras se estaba leyendo. No se ha aceptado una fotografía mezclada. Vuelve a intentarlo.";
  }
  if (code === "google_source_historical_regression") {
    return "La fuente bancaria ha perdido o reclasificado parte del histórico validado. La operación se ha bloqueado y no se ha persistido ningún cambio.";
  }
  if (code === "google_source_contract_invalid") {
    return "La fuente bancaria no cumple el contrato validado. No se ha importado ningún movimiento.";
  }
  return "La operación no se ha completado. No se mostrará como correcta sin confirmación real.";
}

async function jsonOrEmpty<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export default function SourceClient() {
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeHealth | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(EMPTY_SYNC_STATUS);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [preflight, setPreflight] = useState<PreflightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [googleResponse, runtimeResponse] = await Promise.all([
        fetch("/api/source/google/status", { cache: "no-store" }),
        fetch("/api/health/source-runtime", { cache: "no-store" }),
      ]);
      const googlePayload = await jsonOrEmpty<GoogleStatus>(googleResponse);
      const runtimePayload = await jsonOrEmpty<RuntimeHealth>(runtimeResponse);

      setGoogle(googlePayload);
      setRuntime(runtimePayload);

      if (googlePayload.configured) {
        const syncResponse = await fetch("/api/source/google/sync", { cache: "no-store" });
        if (syncResponse.ok) {
          setSyncStatus(await jsonOrEmpty<SyncStatus>(syncResponse));
        } else {
          setSyncStatus(EMPTY_SYNC_STATUS);
        }
      } else {
        setSyncStatus(EMPTY_SYNC_STATUS);
      }

      if (!googleResponse.ok && googlePayload.configured) {
        setError("La configuración de Google existe, pero no se ha podido comprobar el estado de la conexión.");
      } else if (!runtimeResponse.ok && runtimePayload.error !== "source_runtime_incompatible") {
        setError("No se ha podido verificar el runtime seguro de sincronización.");
      }
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
      if (googleResult === "connected") {
        setNotice("Google se ha conectado y la fuente oficial ha superado la validación previa de solo lectura.");
      } else if (googleResult === "error") {
        setError(GOOGLE_CALLBACK_ERRORS[callbackCode] ?? "No se pudo completar la conexión con Google.");
      }
      if (googleResult) {
        window.history.replaceState({}, "", "/configuration/source");
      }
    })();
  }, [load]);

  const connected = Boolean(google?.configured && google.connection?.connected);
  const runtimeReady = runtime?.compatible === true;
  const hasSuccessfulSync = syncStatus.cursors.length > 0;
  const firstImportNeedsPreflight = connected && !hasSuccessfulSync;
  const readyToPreflight = connected && runtimeReady && !busy;
  const readyToSync = connected && runtimeReady && !busy && (!firstImportNeedsPreflight || preflight !== null);
  const latestAttemptFailed = syncStatus.run?.status === "failed";
  const missingLabels = useMemo(
    () => (google?.missing ?? []).map((item) => CONFIG_LABELS[item] ?? item),
    [google?.missing],
  );

  async function preflightSource() {
    if (!readyToPreflight) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/source/google/preflight", { method: "POST" });
      const payload = await jsonOrEmpty<PreflightSummary & { error?: string }>(response);
      if (!response.ok) throw new Error(sourceActionErrorMessage(payload.error));

      setPreflight(payload);
      setNotice(
        `Prevalidación correcta: ${payload.totalAuthoritativeRows} movimientos autoritativos y ${payload.accounts.length} productos, sin escribir en la base de datos.`,
      );
    } catch (cause) {
      setPreflight(null);
      setError(cause instanceof Error ? cause.message : "La prevalidación no se ha podido completar.");
    } finally {
      setBusy(false);
    }
  }

  async function synchronize() {
    if (!readyToSync) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSyncResult(null);

    try {
      const response = await fetch("/api/source/google/sync", { method: "POST" });
      const payload = await jsonOrEmpty<SyncResult & { error?: string }>(response);
      if (!response.ok) throw new Error(sourceActionErrorMessage(payload.error));

      setSyncResult(payload);
      setNotice(
        `Actualización completada: ${payload.rowsInserted} nuevos, ${payload.rowsRevised} revisados y ${payload.rowsSkipped} sin cambios.`,
      );
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "La actualización no se ha podido completar.";
      await load();
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!connected || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/source/google/status", { method: "DELETE" });
      if (!response.ok) throw new Error("No se ha podido desconectar Google.");
      setSyncResult(null);
      setPreflight(null);
      setNotice("Conexión Google eliminada. Los movimientos ya importados permanecen intactos.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido desconectar Google.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="configuration-shell">
      <header className="configuration-hero">
        <div>
          <a className="back-link" href="/">← Fundamentos</a>
          <p className="eyebrow">FASE 2 · FUENTE OFICIAL</p>
          <h1>Fuente bancaria</h1>
          <p className="hero-copy">
            Google Drive y Google Sheets se usan exclusivamente en lectura. La fuente original nunca se modifica;
            Financial App guarda sus revisiones, trazabilidad y cambios manuales en su propia base de datos.
          </p>
        </div>
        <div className="configuration-summary" aria-label="Estado de la fuente bancaria">
          <div><strong>{google?.configured ? "Sí" : "No"}</strong><span>Servidor configurado</span></div>
          <div><strong>{connected ? "Sí" : "No"}</strong><span>Google conectado</span></div>
          <div><strong>{runtimeReady ? "v2" : "—"}</strong><span>Runtime seguro</span></div>
        </div>
      </header>

      {error && <div className="config-message error" role="alert">{error}</div>}
      {notice && <div className="config-message success" role="status">{notice}</div>}

      {loading ? (
        <section className="config-panel loading-state">Comprobando conexión, runtime y última sincronización…</section>
      ) : (
        <div className={styles.grid}>
          <section className={`config-panel ${styles.mainPanel}`} aria-labelledby="source-status-heading">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">CONEXIÓN CONTROLADA</p>
                <h2 id="source-status-heading">Google · solo lectura</h2>
              </div>
              <span className="status-chip">Read-only</span>
            </div>

            <div className={styles.statusList}>
              <div>
                <span>Configuración privada</span>
                <strong>{google?.configured ? "Preparada" : "Pendiente"}</strong>
                <p>{google?.configured ? "Las variables privadas necesarias están disponibles en el servidor." : "Faltan parámetros privados; no se intenta conectar ni importar."}</p>
              </div>
              <div>
                <span>Runtime de persistencia</span>
                <strong>{runtimeReady ? "Compatible · contrato v2" : "No disponible"}</strong>
                <p>{runtimeReady ? "Lifecycle y selección canónica de productos están exigidos antes de escribir." : "La sincronización permanece bloqueada de forma segura."}</p>
              </div>
              <div>
                <span>Cuenta Google</span>
                <strong>{google?.connection?.accountEmail ?? "Sin conectar"}</strong>
                <p>{google?.connection?.sourceFileName ?? "No se ha autorizado ninguna fuente."}</p>
                {google?.connection?.lastVerifiedAt && <p>Última verificación: {formatDateTime(google.connection.lastVerifiedAt)}</p>}
              </div>
            </div>

            {!google?.configured && missingLabels.length > 0 && (
              <div className={styles.missingBox}>
                <strong>Configuración pendiente en preview</strong>
                <ul>{missingLabels.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}

            {firstImportNeedsPreflight && !preflight && (
              <div className={styles.missingBox}>
                <strong>Primera importación protegida</strong>
                <p>Antes de escribir el primer movimiento se exige una lectura completa de control. La prevalidación no persiste movimientos ni modifica el Google Sheet.</p>
              </div>
            )}

            <div className={styles.actions}>
              {google?.configured && runtimeReady && !connected ? (
                <a className={`primary-button ${styles.buttonLink}`} href="/api/source/google/connect">Conectar Google</a>
              ) : firstImportNeedsPreflight && !preflight ? (
                <button className="primary-button" type="button" disabled={!readyToPreflight} onClick={() => void preflightSource()}>
                  {busy ? "Validando…" : "Validar fuente antes de importar"}
                </button>
              ) : (
                <button className="primary-button" type="button" disabled={!readyToSync} onClick={() => void synchronize()}>
                  {busy ? "Actualizando…" : "Actualizar desde Google"}
                </button>
              )}
              {connected && (!firstImportNeedsPreflight || preflight) && (
                <button className="secondary-button" type="button" disabled={!readyToPreflight} onClick={() => void preflightSource()}>
                  {preflight ? "Volver a validar fuente" : "Validar fuente"}
                </button>
              )}
              {connected && (
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void disconnect()}>
                  Desconectar Google
                </button>
              )}
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void load()}>
                Comprobar estado
              </button>
            </div>

            {preflight && (
              <div className={styles.preflightBlock} aria-label="Prevalidación de la fuente bancaria">
                <div className="panel-heading">
                  <div><p className="panel-kicker">PREVALIDACIÓN READ-ONLY</p><h3>Fotografía autoritativa antes de importar</h3></div>
                  <span className="status-chip">Validada</span>
                </div>
                <dl className={styles.metrics}>
                  <div><dt>Movimientos</dt><dd>{preflight.totalAuthoritativeRows}</dd></div>
                  <div><dt>Productos</dt><dd>{preflight.accounts.length}</dd></div>
                  <div><dt>Pestañas</dt><dd>{preflight.cursors.length}</dd></div>
                </dl>
                <div className={styles.preflightProducts}>
                  {preflight.accounts.map((account) => (
                    <article key={account.accountExternalKey}>
                      <span>{account.lifecycle === "archived" ? "Archivada" : "Activa"} · {account.accountType}</span>
                      <strong>{account.accountName}</strong>
                      <small>{account.authoritativeRows} movimientos · saldo inicial {formatMoneyCents(account.openingBalanceCents)}</small>
                      <small>Último saldo observado: {formatMoneyCents(account.latestBalanceAfterCents)}</small>
                    </article>
                  ))}
                </div>
                <div className={styles.metaRows}>
                  {preflight.cursors.map((cursor) => (
                    <p key={cursor.sourceSheetId}>
                      <span>{cursor.sheetTitle} · {cursor.authoritativeRows} filas</span>
                      <strong>Cursor previsto: {cursor.lastSourceRowKey}</strong>
                    </p>
                  ))}
                  <p><span>Revisión fuente</span><strong>{preflight.sourceRevision ?? "Sin revisión"}</strong></p>
                </div>
              </div>
            )}
          </section>

          <aside className={`config-panel ${styles.sidePanel}`}>
            <div className="panel-heading">
              <div><p className="panel-kicker">GARANTÍAS</p><h2>Contrato de seguridad</h2></div>
            </div>
            <ul className={styles.guarantees}>
              <li>Scopes de Google estrictamente de solo lectura.</li>
              <li>La fuente bancaria original no recibe escrituras.</li>
              <li>La identidad de cuenta autorizada se valida antes de sincronizar.</li>
              <li>La primera importación exige prevalidación completa sin persistencia.</li>
              <li>El libro completo se vuelve a validar antes de persistir datos.</li>
              <li>Runtime v2 obligatorio antes de cualquier escritura en PostgreSQL.</li>
            </ul>
          </aside>

          <section className={`config-panel ${styles.mainPanel}`} aria-labelledby="last-sync-heading">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">TRAZABILIDAD</p>
                <h2 id="last-sync-heading">
                  {latestAttemptFailed ? "Último intento de sincronización" : "Última sincronización persistida"}
                </h2>
              </div>
              <span className={`lifecycle ${syncStatus.run?.status === "success" ? "active" : "archived"}`}>
                {syncStatus.run?.status ?? "Sin ejecuciones"}
              </span>
            </div>

            {syncStatus.run ? (
              <>
                <dl className={styles.metrics}>
                  <div><dt>Vistos</dt><dd>{syncStatus.run.rowsSeen}</dd></div>
                  <div><dt>Nuevos</dt><dd>{syncStatus.run.rowsInserted}</dd></div>
                  <div><dt>Revisados</dt><dd>{syncStatus.run.rowsRevised}</dd></div>
                  <div><dt>Sin cambios</dt><dd>{syncStatus.run.rowsSkipped}</dd></div>
                  <div><dt>Fallidas</dt><dd>{syncStatus.run.rowsFailed}</dd></div>
                  <div><dt>Duplicados</dt><dd>{syncStatus.run.duplicatesDetected}</dd></div>
                  <div><dt>Avisos</dt><dd>{syncStatus.run.warningsCount}</dd></div>
                </dl>
                <div className={styles.metaRows}>
                  <p><span>Inicio</span><strong>{formatDateTime(syncStatus.run.startedAt)}</strong></p>
                  <p><span>Fin</span><strong>{formatDateTime(syncStatus.run.finishedAt)}</strong></p>
                  <p><span>Revisión fuente</span><strong>{syncStatus.run.sourceRevision ?? "Sin revisión"}</strong></p>
                </div>
                {latestAttemptFailed && (
                  <div className={styles.lastResult}>
                    Último intento fallido: {syncStatus.run.rowsFailed} filas no persistidas. Los cursores permanecen en la última sincronización válida.
                    {syncStatus.run.errorCode ? ` Código: ${syncStatus.run.errorCode}.` : ""}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.empty}>Todavía no existe una sincronización real persistida para esta fuente.</div>
            )}

            {syncResult && (
              <div className={styles.lastResult}>
                Último resultado confirmado en esta sesión: {syncResult.rowsSeen} filas vistas · {syncResult.cursorsAdvanced} cursores avanzados.
              </div>
            )}
          </section>

          <aside className={`config-panel ${styles.sidePanel}`}>
            <div className="panel-heading">
              <div><p className="panel-kicker">CURSORES</p><h2>Pestañas físicas</h2></div>
            </div>
            {latestAttemptFailed && syncStatus.cursors.length > 0 && (
              <div className={styles.lastResult}>
                Cursores conservados desde la última sincronización válida; el intento fallido no los ha avanzado.
              </div>
            )}
            {syncStatus.cursors.length ? (
              <div className={styles.cursorList}>
                {syncStatus.cursors.map((cursor) => (
                  <article key={cursor.sourceSheetId}>
                    <span>Pestaña {cursor.sourceSheetId}</span>
                    <strong>{cursor.lastSourceRowKey ?? "Sin fila"}</strong>
                    <small>{formatDateTime(cursor.updatedAt)}</small>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Los cursores aparecerán después de la primera sincronización válida.</div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
