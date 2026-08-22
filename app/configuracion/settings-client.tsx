"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { SettingsOverview } from "@/lib/financial/settings";
import {
  BACKUP_MAX_BYTES,
  PRIVATE_BACKUP_RESTORE_CONFIRMATION,
} from "@/lib/financial/backup-recovery";

type BackupPreview = {
  ok: boolean;
  safe: boolean;
  errors: string[];
  warnings: string[];
  backupFingerprint: string;
  formatVersion: number | null;
  backupAppVersion: string | null;
  currentAppVersion: string | null;
  source: {
    fileMatches?: boolean;
    backupTransactions?: number | null;
    currentTransactions?: number | null;
    newerTransactions?: number | null;
    invalidAnchors?: number | null;
  };
  sections: Record<string, { backup: number; current: number; delta: number }>;
};

const sectionLabels: Record<string, string> = {
  transactionOverrides: "Ediciones de movimientos",
  splits: "Divisiones",
  budgets: "Presupuestos",
  forecasts: "Previsiones",
  forecastOccurrences: "Ocurrencias previstas",
  netWorthItems: "Patrimonio",
  goals: "Objetivos",
  rules: "Reglas",
  reconciliationPairs: "Conciliaciones",
  preferences: "Preferencias",
  controlAlertStates: "Estados de alertas",
  monthCloses: "Cierres mensuales",
  documents: "Documentos",
  transactionDocuments: "Vínculos documento-movimiento",
};

function backupIssueLabel(code: string) {
  if (code.startsWith("invalid_section:")) return `Sección inválida: ${code.split(":")[1]}`;
  if (code.startsWith("invalid_rows:")) return `Filas inválidas: ${code.split(":")[1]}`;
  if (code.startsWith("duplicate_keys:")) return `Claves duplicadas detectadas (${code.split(":")[1]}).`;
  if (code.startsWith("invalid_references:")) return `Referencias internas no válidas (${code.split(":")[1]}).`;
  if (code.startsWith("source_anchor_mismatch:")) return `La fuente ha cambiado en ${code.split(":")[1]} movimientos existentes.`;
  if (code === "source_file_mismatch") return "La copia pertenece a otra fuente bancaria.";
  if (code === "source_transaction_count_regressed") return "La fuente actual contiene menos movimientos que cuando se creó la copia.";
  if (code === "unsupported_format_version") return "La versión de la copia no es compatible.";
  if (code === "invalid_format") return "El archivo no es una copia privada de Financial App.";
  if (code === "legacy_backup_requires_1_8_reexport_for_restore") return "La copia es de Financial App 1.7: puede revisarse, pero debe volver a exportarse con 1.8 para restaurarla con seguridad.";
  if (code.startsWith("source_contains_newer_transactions:")) return `La fuente tiene ${code.split(":")[1]} movimientos posteriores a esta copia; se conservarán.`;
  return code;
}

export function SettingsClient({ initialData }: { initialData: SettingsOverview }) {
  const [data, setData] = useState(initialData);
  const [theme, setTheme] = useState(initialData.preferences.theme);
  const [timezone, setTimezone] = useState(initialData.preferences.timezone || "Europe/Madrid");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<Record<string, unknown> | null>(null);
  const [backupName, setBackupName] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function refreshSettings() {
    const fresh = await fetch("/api/settings", { cache: "no-store" });
    const freshBody = await fresh.json();
    if (fresh.ok) setData(freshBody.data);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme, timezone }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "No se pudo guardar");
      localStorage.setItem("financial-app-theme", theme);
      await refreshSettings();
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
      const r = await fetch("/api/backup", { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error || "No se pudo crear la copia");
      }
      const blob = await r.blob();
      const disposition = r.headers.get("content-disposition") || "";
      const name = disposition.match(/filename="([^"]+)"/)?.[1] || "financial-app-private-backup.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
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
    setPreview(null);
    setBackup(null);
    setBackupName(null);
    setRestoreConfirmation("");
    try {
      if (file.size > BACKUP_MAX_BYTES) throw new Error("La copia supera 10 MB.");
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("El JSON no contiene una copia válida.");
      const candidate = parsed as Record<string, unknown>;
      const r = await fetch("/api/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview", backup: candidate }),
      });
      const body = (await r.json()) as BackupPreview & { error?: string };
      if (!r.ok) throw new Error(body.error || "No se pudo analizar la copia");
      setBackup(candidate);
      setBackupName(file.name);
      setPreview(body);
      if (body.safe) setMessage("Copia compatible. Revisa las diferencias antes de decidir si quieres restaurarla.");
      else setMessage("La copia se ha analizado, pero la restauración permanece bloqueada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Copia no válida");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    if (!backup || !preview?.safe) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await fetch("/api/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "restore",
          backup,
          expectedFingerprint: preview.backupFingerprint,
          confirmation: restoreConfirmation,
        }),
      });
      const body = await r.json();
      if (!r.ok || !body.ok) throw new Error(body.error || "No se pudo restaurar la copia");
      await refreshSettings();
      setMessage(`Restauración completada de forma atómica. Checkpoint previo: ${String(body.checkpointId || "creado")}.`);
      setBackup(null);
      setBackupName(null);
      setPreview(null);
      setRestoreConfirmation("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error al restaurar");
    } finally {
      setBusy(false);
    }
  }

  const sync = data.lastSync as any;
  const source = data.source as any;
  const storage = data.storage as any;

  return (
    <div className="settings-module">
      <section className="settings-grid">
        <form className="settings-card" onSubmit={save}>
          <h2>Preferencias</h2>
          <label>
            <span>Apariencia</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
              <option value="system">Seguir sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </label>
          <label>
            <span>Zona horaria</span>
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </label>
          <dl>
            <div><dt>Idioma</dt><dd>Español (España)</dd></div>
            <div><dt>Moneda</dt><dd>EUR (€)</dd></div>
          </dl>
          <button className="primary-action" disabled={busy} type="submit">Guardar preferencias</button>
        </form>

        <section className="settings-card">
          <h2>Acceso y seguridad</h2>
          <dl>
            <div><dt>Usuario</dt><dd>{data.userEmail}</dd></div>
            <div><dt>Acceso previsto</dt><dd>Google OAuth</dd></div>
            <div><dt>Allowlist servidor</dt><dd>{data.auth.serverAllowlist ? "Activa" : "No"}</dd></div>
            <div><dt>Contraseñas propias</dt><dd>{data.auth.passwordLogin ? "Sí" : "No"}</dd></div>
            <div><dt>Almacenamiento documental</dt><dd>{storage?.private ? "Privado" : "Revisar"}</dd></div>
          </dl>
        </section>

        <section className="settings-card">
          <h2>Fuente bancaria</h2>
          <dl>
            <div><dt>Modo</dt><dd>{String(source?.mode || source?.read_only || "Solo lectura")}</dd></div>
            <div><dt>Última sincronización</dt><dd>{sync?.status || "—"}</dd></div>
            <div><dt>Finalizada</dt><dd>{sync?.finishedAt ? new Date(sync.finishedAt).toLocaleString("es-ES") : "—"}</dd></div>
            <div><dt>Nuevos / actualizados</dt><dd>{Number(sync?.newCount || 0)} / {Number(sync?.updatedCount || 0)}</dd></div>
          </dl>
        </section>

        <section className="settings-card">
          <h2>Integridad de datos</h2>
          <dl>
            <div><dt>Movimientos</dt><dd>{data.health.transactions.toLocaleString("es-ES")}</dd></div>
            <div><dt>ID origen duplicados</dt><dd>{data.health.sourceIdDuplicates}</dd></div>
            <div><dt>Origen ausente</dt><dd>{data.health.missingSource}</dd></div>
            <div><dt>Traspasos internos</dt><dd>{data.health.internalTransfers}</dd></div>
            <div><dt>Pendientes de revisar</dt><dd>{data.health.needsReview}</dd></div>
            <div><dt>Violaciones ahorro → Cash Flow</dt><dd>{data.health.savingsCashFlowViolations}</dd></div>
          </dl>
        </section>

        <section className="settings-card backup-card">
          <h2>Copia privada y recuperación</h2>
          <p className="settings-note">
            Exporta la capa privada de Financial App sin copiar ni modificar la fuente bancaria. La restauración 1.8 valida primero el origen, muestra las diferencias y crea un checkpoint automático antes de escribir.
          </p>
          <button className="primary-action" type="button" disabled={busy} onClick={downloadBackup}>Descargar copia privada</button>
          <label>
            <span>Analizar una copia</span>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void previewBackup(file);
              }}
            />
          </label>

          {preview && (
            <div className="backup-preview" aria-live="polite">
              <div className="backup-preview-head">
                <div>
                  <strong>{backupName || "Copia seleccionada"}</strong>
                  <span>Formato {preview.formatVersion ?? "—"} · Financial App {preview.backupAppVersion || "—"}</span>
                </div>
                <span className={preview.safe ? "backup-status safe" : "backup-status blocked"}>
                  {preview.safe ? "Lista para restaurar" : "Restauración bloqueada"}
                </span>
              </div>

              <dl className="backup-source-check">
                <div><dt>Fuente</dt><dd>{preview.source?.fileMatches ? "Coincide" : "No coincide"}</dd></div>
                <div><dt>Movimientos en la copia</dt><dd>{preview.source?.backupTransactions ?? "—"}</dd></div>
                <div><dt>Movimientos actuales</dt><dd>{preview.source?.currentTransactions ?? "—"}</dd></div>
                <div><dt>Movimientos posteriores</dt><dd>{preview.source?.newerTransactions ?? "—"}</dd></div>
              </dl>

              {(preview.errors.length > 0 || preview.warnings.length > 0) && (
                <div className="backup-messages">
                  {preview.errors.map((item) => <p className="settings-error" key={`e-${item}`}>{backupIssueLabel(item)}</p>)}
                  {preview.warnings.map((item) => <p className="settings-warning" key={`w-${item}`}>{backupIssueLabel(item)}</p>)}
                </div>
              )}

              <div className="backup-diff" role="table" aria-label="Diferencias entre la copia y el estado actual">
                <div className="backup-diff-row backup-diff-head" role="row">
                  <span role="columnheader">Área</span><span role="columnheader">Copia</span><span role="columnheader">Actual</span><span role="columnheader">Δ</span>
                </div>
                {Object.entries(preview.sections || {}).map(([key, values]) => (
                  <div className="backup-diff-row" role="row" key={key}>
                    <span role="cell">{sectionLabels[key] || key}</span>
                    <span role="cell">{values.backup}</span>
                    <span role="cell">{values.current}</span>
                    <span role="cell">{values.delta > 0 ? `+${values.delta}` : values.delta}</span>
                  </div>
                ))}
              </div>

              {preview.safe && (
                <div className="restore-box">
                  <p className="settings-note" id="restore-confirmation-help">
                    La operación es atómica y crea una copia de seguridad interna justo antes de restaurar. Para habilitarla escribe <strong>{PRIVATE_BACKUP_RESTORE_CONFIRMATION}</strong> exactamente.
                  </p>
                  <label>
                    <span>Confirmación</span>
                    <input
                      value={restoreConfirmation}
                      onChange={(e) => setRestoreConfirmation(e.target.value)}
                      autoComplete="off"
                      aria-describedby="restore-confirmation-help"
                    />
                  </label>
                  <button
                    className="danger-action"
                    type="button"
                    disabled={busy || restoreConfirmation !== PRIVATE_BACKUP_RESTORE_CONFIRMATION}
                    onClick={() => void restoreBackup()}
                  >
                    Restaurar copia privada
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </section>

      {message && <p className="settings-ok" role="status">{message}</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}

      <section className="settings-card technical-card">
        <h2>Sistema</h2>
        <dl>
          <div><dt>Versión única</dt><dd>{data.version}</dd></div>
          <div><dt>Schema</dt><dd>{data.schemaVersion || "—"}</dd></div>
          <div><dt>Objetivo</dt><dd>{data.targetVersion || data.version}</dd></div>
          <div><dt>Cuentas configuradas</dt><dd>{data.accounts.length}</dd></div>
          <div><dt>Usuarios autorizados</dt><dd>{data.health.authorizedUsers}</dd></div>
          <div><dt>Bucket Archivo</dt><dd>{storage?.id || "financial-app-documents"}</dd></div>
        </dl>
        <p className="settings-note">Financial App mantiene la fuente bancaria en solo lectura y guarda las ediciones únicamente en su propia base de datos.</p>
      </section>
    </div>
  );
}
