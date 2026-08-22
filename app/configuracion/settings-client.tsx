"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { SettingsOverview } from "@/lib/financial/settings";
import { PRIVATE_BACKUP_RESTORE_CONFIRMATION } from "@/lib/financial/backup-recovery";

type BackupPreview = {
  ok: boolean;
  safe: boolean;
  errors: string[];
  warnings: string[];
  backupFingerprint: string;
  formatVersion: number | null;
  backupAppVersion: string | null;
  currentAppVersion: string;
  source?: {
    fileMatches?: boolean;
    backupTransactions?: number | null;
    currentTransactions?: number | null;
    newerTransactions?: number | null;
    invalidAnchors?: number | null;
  };
  sections?: Record<string, { backup: number; current: number; delta: number }>;
};

type LoadedBackup = { fileName: string; payload: Record<string, unknown>; preview: BackupPreview };

const sectionLabels: Record<string, string> = {
  transactionOverrides: "Ediciones de movimientos",
  splits: "Divisiones",
  budgets: "Presupuestos",
  forecasts: "Previsiones",
  forecastOccurrences: "Ocurrencias de previsión",
  netWorthItems: "Patrimonio",
  goals: "Objetivos",
  rules: "Reglas",
  reconciliationPairs: "Conciliaciones",
  preferences: "Preferencias",
  controlAlertStates: "Alertas",
  monthCloses: "Cierres mensuales",
  documents: "Documentos",
  transactionDocuments: "Vínculos documento-movimiento",
};

function backupMessage(code: string) {
  if (code === "legacy_backup_requires_1_8_reexport_for_restore") return "La copia es anterior a 1.8. Puede revisarse, pero debe volver a exportarse con 1.8 para restaurarla automáticamente.";
  if (code.startsWith("source_contains_newer_transactions:")) return `La fuente contiene ${code.split(":")[1] || ""} movimientos posteriores a la copia. Se conservarán.`;
  if (code === "source_file_mismatch") return "La copia pertenece a otra fuente bancaria.";
  if (code.startsWith("source_anchor_mismatch:")) return "Uno o más movimientos de origen han cambiado desde que se creó la copia.";
  if (code.startsWith("invalid_references:")) return "La copia contiene referencias que ya no existen en esta instalación.";
  if (code.startsWith("duplicate_keys:")) return "La copia contiene identificadores duplicados.";
  if (code === "unsupported_format_version") return "La versión del formato de copia no es compatible.";
  return code.replaceAll("_", " ");
}

export function SettingsClient({ initialData }: { initialData: SettingsOverview }) {
  const [data, setData] = useState(initialData);
  const [theme, setTheme] = useState(initialData.preferences.theme);
  const [timezone, setTimezone] = useState(initialData.preferences.timezone || "Europe/Madrid");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedBackup, setLoadedBackup] = useState<LoadedBackup | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme, timezone }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar");
      localStorage.setItem("financial-app-theme", theme);
      const fresh = await fetch("/api/settings", { cache: "no-store" });
      const freshBody = await fresh.json();
      if (fresh.ok) setData(freshBody.data);
      setMessage("Preferencias guardadas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  async function downloadBackup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/backup", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "No se pudo crear la copia");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const name = disposition.match(/filename="([^"]+)"/)?.[1] || "financial-app-private-backup.json";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("Copia privada 1.8 exportada correctamente.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error al exportar");
    } finally {
      setBusy(false);
    }
  }

  async function previewBackup(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    setLoadedBackup(null);
    setRestoreConfirmation("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("La copia supera 10 MB.");
      const payload = JSON.parse(await file.text()) as Record<string, unknown>;
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview", backup: payload }),
      });
      const preview = (await response.json()) as BackupPreview & { error?: string };
      if (!response.ok) throw new Error(preview.error || "No se pudo analizar la copia");
      setLoadedBackup({ fileName: file.name, payload, preview });
      if (preview.safe) setMessage("Copia revisada. La restauración está disponible después de comprobar el resumen.");
      else setMessage("Copia revisada en modo solo lectura. La restauración automática está bloqueada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Copia no válida");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function restoreBackup() {
    if (!loadedBackup?.preview.safe) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "restore",
          backup: loadedBackup.payload,
          expectedFingerprint: loadedBackup.preview.backupFingerprint,
          confirmation: restoreConfirmation,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "No se pudo restaurar la copia");
      setLoadedBackup(null);
      setRestoreConfirmation("");
      const fresh = await fetch("/api/settings", { cache: "no-store" });
      const freshBody = await fresh.json();
      if (fresh.ok) setData(freshBody.data);
      setMessage(`Restauración completada. Checkpoint previo: ${String(body.checkpointId || "creado")}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error durante la restauración");
    } finally {
      setBusy(false);
    }
  }

  const sync = data.lastSync as any;
  const source = data.source as any;
  const storage = data.storage as any;
  const preview = loadedBackup?.preview;

  return (
    <div className="settings-module">
      <section className="settings-grid">
        <form className="settings-card" onSubmit={save}>
          <h2>Preferencias</h2>
          <label><span>Apariencia</span><select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}><option value="system">Seguir sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>
          <label><span>Zona horaria</span><input value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label>
          <dl><div><dt>Idioma</dt><dd>Español (España)</dd></div><div><dt>Moneda</dt><dd>EUR (€)</dd></div></dl>
          <button className="primary-action" disabled={busy} type="submit">Guardar preferencias</button>
        </form>

        <section className="settings-card"><h2>Acceso y seguridad</h2><dl><div><dt>Usuario</dt><dd>{data.userEmail}</dd></div><div><dt>Acceso previsto</dt><dd>Google OAuth</dd></div><div><dt>Allowlist servidor</dt><dd>{data.auth.serverAllowlist ? "Activa" : "No"}</dd></div><div><dt>Contraseñas propias</dt><dd>{data.auth.passwordLogin ? "Sí" : "No"}</dd></div><div><dt>Almacenamiento documental</dt><dd>{storage?.private ? "Privado" : "Revisar"}</dd></div></dl></section>
        <section className="settings-card"><h2>Fuente bancaria</h2><dl><div><dt>Modo</dt><dd>{String(source?.mode || source?.read_only || "Solo lectura")}</dd></div><div><dt>Última sincronización</dt><dd>{sync?.status || "—"}</dd></div><div><dt>Finalizada</dt><dd>{sync?.finishedAt ? new Date(sync.finishedAt).toLocaleString("es-ES") : "—"}</dd></div><div><dt>Nuevos / actualizados</dt><dd>{Number(sync?.newCount || 0)} / {Number(sync?.updatedCount || 0)}</dd></div></dl></section>
        <section className="settings-card"><h2>Integridad de datos</h2><dl><div><dt>Movimientos</dt><dd>{data.health.transactions.toLocaleString("es-ES")}</dd></div><div><dt>ID origen duplicados</dt><dd>{data.health.sourceIdDuplicates}</dd></div><div><dt>Origen ausente</dt><dd>{data.health.missingSource}</dd></div><div><dt>Traspasos internos</dt><dd>{data.health.internalTransfers}</dd></div><div><dt>Pendientes de revisar</dt><dd>{data.health.needsReview}</dd></div><div><dt>Violaciones ahorro → Cash Flow</dt><dd>{data.health.savingsCashFlowViolations}</dd></div></dl></section>

        <section className="settings-card backup-card">
          <h2>Copia privada y recuperación</h2>
          <p className="settings-note">Exporta la capa privada de Financial App. La fuente bancaria permanece fuera de la copia y siempre en solo lectura.</p>
          <button className="primary-action" type="button" disabled={busy} onClick={downloadBackup}>Descargar copia privada</button>
          <label><span>Revisar una copia</span><input ref={fileRef} type="file" accept="application/json,.json" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void previewBackup(file); }} /></label>

          {preview && loadedBackup && (
            <div className="backup-preview" aria-live="polite">
              <div className="backup-preview-header"><div><strong>{loadedBackup.fileName}</strong><span>Formato {preview.formatVersion ?? "—"} · Financial App {preview.backupAppVersion || "—"}</span></div><span className={preview.safe ? "backup-status safe" : "backup-status blocked"}>{preview.safe ? "Restaurable" : "Solo revisión"}</span></div>

              {preview.source && <dl className="backup-source"><div><dt>Movimientos de la copia</dt><dd>{preview.source.backupTransactions ?? "—"}</dd></div><div><dt>Movimientos actuales</dt><dd>{preview.source.currentTransactions ?? "—"}</dd></div><div><dt>Movimientos posteriores</dt><dd>{preview.source.newerTransactions ?? "—"}</dd></div><div><dt>Anclas inválidas</dt><dd>{preview.source.invalidAnchors ?? "—"}</dd></div></dl>}

              {preview.warnings.length > 0 && <div className="backup-notices warning"><strong>Avisos</strong><ul>{preview.warnings.map((item) => <li key={item}>{backupMessage(item)}</li>)}</ul></div>}
              {preview.errors.length > 0 && <div className="backup-notices danger"><strong>Bloqueos</strong><ul>{preview.errors.map((item) => <li key={item}>{backupMessage(item)}</li>)}</ul></div>}

              {preview.sections && <div className="backup-diff"><div className="backup-diff-row heading"><span>Área</span><span>Copia</span><span>Actual</span><span>Δ</span></div>{Object.entries(preview.sections).map(([key, value]) => <div className="backup-diff-row" key={key}><span>{sectionLabels[key] || key}</span><span>{value.backup}</span><span>{value.current}</span><span>{value.delta > 0 ? `+${value.delta}` : value.delta}</span></div>)}</div>}

              {preview.safe && (
                <div className="restore-zone">
                  <p id="restore-confirmation-help" className="settings-note">Antes de escribir nada se crea un checkpoint automático. Para ejecutar la restauración escribe exactamente <strong>{PRIVATE_BACKUP_RESTORE_CONFIRMATION}</strong>.</p>
                  <label><span>Confirmación</span><input aria-describedby="restore-confirmation-help" autoComplete="off" value={restoreConfirmation} onChange={(e) => setRestoreConfirmation(e.target.value)} placeholder={PRIVATE_BACKUP_RESTORE_CONFIRMATION} /></label>
                  <button className="danger-action" type="button" disabled={busy || restoreConfirmation !== PRIVATE_BACKUP_RESTORE_CONFIRMATION} onClick={() => void restoreBackup()}>Restaurar capa privada</button>
                </div>
              )}
            </div>
          )}
        </section>
      </section>

      {message && <p className="settings-ok" role="status">{message}</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}

      <section className="settings-card technical-card"><h2>Sistema</h2><dl><div><dt>Versión única</dt><dd>{data.version}</dd></div><div><dt>Schema</dt><dd>{data.schemaVersion || "—"}</dd></div><div><dt>Objetivo</dt><dd>{data.targetVersion || data.version}</dd></div><div><dt>Cuentas configuradas</dt><dd>{data.accounts.length}</dd></div><div><dt>Usuarios autorizados</dt><dd>{data.health.authorizedUsers}</dd></div><div><dt>Bucket Archivo</dt><dd>{storage?.id || "financial-app-documents"}</dd></div></dl><p className="settings-note">Financial App mantiene la fuente bancaria en solo lectura y guarda las ediciones únicamente en su propia base de datos.</p></section>
    </div>
  );
}
