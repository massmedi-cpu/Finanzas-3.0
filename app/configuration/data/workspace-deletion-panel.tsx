"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./data-trust.module.css";

type Blocker = { code?: unknown; resolved?: unknown };
type Intent = {
  intentId?: unknown;
  status?: unknown;
  effectiveStatus?: unknown;
  expiresAt?: unknown;
};
type Readiness = {
  canExecute?: unknown;
  destructiveOperationExecuted?: unknown;
  intent?: Intent | null;
  blockers?: Blocker[];
  runtimeFoundation?: {
    commercialPolicyConfigured?: unknown;
    productionActivated?: unknown;
    selfServiceExecutionEndpointExposed?: unknown;
  };
  preservedExternalSources?: {
    officialBankSource?: unknown;
    googleDriveFiles?: unknown;
  };
};
type ReadinessEnvelope = {
  readiness?: Readiness;
  available?: boolean;
  error?: string;
  code?: string | null;
};
type OperationResult = Record<string, unknown>;

type FlowState = "idle" | "prepared" | "confirmed" | "completed";

const CONFIRMATION_TEXT = "ELIMINAR MIS DATOS";

const BLOCKER_LABELS: Record<string, string> = {
  workspace_deletion_intent_not_confirmed: "Aún no existe una solicitud confirmada.",
  deletion_runtime_policy_missing: "Falta la política técnica de ejecución.",
  post_deletion_receipt_retention_policy_not_defined:
    "La política de conservación del recibo todavía no está aprobada.",
  production_activation_not_approved: "La activación comercial del borrado todavía no está aprobada.",
  self_service_execution_endpoint_not_exposed: "El autoservicio todavía no está habilitado.",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fallback;
  const body = payload as Record<string, unknown>;
  const code = text(body.code) ?? text(body.error);
  if (code === "workspace_deletion_commercial_policy_not_active") {
    return "El borrado sigue desactivado hasta que exista una política de retención aprobada y una activación explícita.";
  }
  if (code === "workspace_deletion_confirmation_required") {
    return "La solicitud debe estar confirmada y vigente antes de la ejecución final.";
  }
  return fallback;
}

async function jsonResponse(response: Response) {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

export default function WorkspaceDeletionPanel() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowState>("idle");
  const [intentId, setIntentId] = useState<string | null>(null);
  const [confirmationNonce, setConfirmationNonce] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [receipt, setReceipt] = useState<OperationResult | null>(null);
  const requestKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/data/deletion", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as ReadinessEnvelope | null;
      if (!response.ok || !body?.readiness) {
        throw new Error(errorMessage(body, "No se ha podido comprobar el estado del borrado."));
      }
      setReadiness(body.readiness);
      setAvailable(body.available === true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido comprobar el estado del borrado.");
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(operation: "prepare" | "confirm" | "cancel" | "execute") {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { operation };
      if (operation === "prepare") {
        requestKey.current ??= crypto.randomUUID();
        payload.requestKey = requestKey.current;
      }
      if (operation === "confirm") {
        payload.intentId = intentId;
        payload.confirmationNonce = confirmationNonce;
      }
      if (operation === "cancel" || operation === "execute") payload.intentId = intentId;

      const response = await fetch("/api/data/deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await jsonResponse(response);
      if (!response.ok || !body) {
        throw new Error(errorMessage(body, "No se ha podido completar este paso del borrado."));
      }

      if (operation === "prepare") {
        const nextIntentId = text(body.intentId);
        const nextNonce = text(body.confirmationNonce);
        if (!nextIntentId || !nextNonce) throw new Error("La solicitud preparada no contiene la confirmación segura esperada.");
        setIntentId(nextIntentId);
        setConfirmationNonce(nextNonce);
        setFlow("prepared");
      } else if (operation === "confirm") {
        setFlow("confirmed");
      } else if (operation === "cancel") {
        requestKey.current = null;
        setIntentId(null);
        setConfirmationNonce(null);
        setConfirmation("");
        setFlow("idle");
      } else {
        setReceipt(body);
        setFlow("completed");
      }

      if (operation !== "execute") await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido completar este paso del borrado.");
    } finally {
      setBusy(false);
    }
  }

  function downloadReceipt() {
    if (!receipt) return;
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `financial-app-recibo-borrado-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const unresolved = (readiness?.blockers ?? []).filter((item) => item?.resolved !== true);
  const preservedBank = readiness?.preservedExternalSources?.officialBankSource === "untouched";
  const preservedDrive = readiness?.preservedExternalSources?.googleDriveFiles === "untouched";
  const typedConfirmation = confirmation === CONFIRMATION_TEXT;

  return (
    <div className={styles.deletionPanel} data-testid="workspace-deletion-panel">
      <div className={styles.deletionHeading}>
        <div>
          <strong>Borrado de datos del workspace</strong>
          <p>
            El proceso elimina únicamente datos gestionados por Financial App. La fuente bancaria oficial y los archivos externos de Google Drive no forman parte del borrado.
          </p>
        </div>
        <span className={styles.deletionStatus} data-ready={available ? "true" : "false"}>
          {loading ? "Comprobando…" : available ? "Disponible" : "Bloqueado"}
        </span>
      </div>

      {error ? <p className={styles.errorNotice} role="alert">{error}</p> : null}

      {!loading && !available ? (
        <div className={styles.blockedNotice} role="status">
          <strong>No se puede borrar nada ahora mismo.</strong>
          <p>El sistema permanece cerrado hasta que exista una política de retención aprobada y una activación comercial explícita.</p>
          {unresolved.length > 0 ? (
            <ul>
              {unresolved.map((item, index) => {
                const code = text(item.code);
                return <li key={`${code ?? "blocker"}-${index}`}>{code ? BLOCKER_LABELS[code] ?? code : "Control pendiente"}</li>;
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {available && flow === "idle" ? (
        <div className={styles.deletionActions}>
          <p>Primero se prepara una solicitud temporal. Prepararla no borra nada.</p>
          <button className={styles.action} type="button" disabled={busy} onClick={() => void run("prepare")}>
            {busy ? "Preparando…" : "Preparar solicitud de borrado"}
          </button>
        </div>
      ) : null}

      {available && flow === "prepared" ? (
        <div className={styles.confirmationBox}>
          <strong>Confirmación 1 de 2</strong>
          <p>Escribe exactamente <b>{CONFIRMATION_TEXT}</b>. Esta confirmación aún no ejecuta el borrado.</p>
          <label htmlFor="workspace-deletion-confirmation">Texto de confirmación</label>
          <input
            id="workspace-deletion-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <div className={styles.deletionActions}>
            <button className={styles.secondaryAction} type="button" disabled={busy} onClick={() => void run("cancel")}>Cancelar solicitud</button>
            <button className={styles.dangerAction} type="button" disabled={busy || !typedConfirmation} onClick={() => void run("confirm")}>
              Confirmar solicitud
            </button>
          </div>
        </div>
      ) : null}

      {available && flow === "confirmed" ? (
        <div className={styles.finalWarning} role="alert">
          <strong>Confirmación 2 de 2 · acción irreversible</strong>
          <p>El siguiente botón inicia el borrado gestionado en Storage, Vault y la base local. No elimina la hoja bancaria oficial ni archivos externos de Google Drive.</p>
          <div className={styles.deletionActions}>
            <button className={styles.secondaryAction} type="button" disabled={busy} onClick={() => void run("cancel")}>Cancelar solicitud</button>
            <button className={styles.dangerAction} type="button" disabled={busy} onClick={() => void run("execute")}>
              {busy ? "Ejecutando…" : "Eliminar definitivamente"}
            </button>
          </div>
        </div>
      ) : null}

      {flow === "completed" && receipt ? (
        <div className={styles.receiptBox} role="status">
          <strong>Borrado completado</strong>
          <p>El servidor ha devuelto el recibo de finalización. Guárdalo ahora: su conservación posterior depende de la política de retención aprobada.</p>
          <button className={styles.action} type="button" onClick={downloadReceipt}>Descargar recibo JSON</button>
        </div>
      ) : null}

      <div className={styles.preservedSources} aria-label="Fuentes externas preservadas">
        <span data-verified={preservedBank ? "true" : "false"}>Fuente bancaria: {preservedBank ? "preservada" : "verificación pendiente"}</span>
        <span data-verified={preservedDrive ? "true" : "false"}>Google Drive externo: {preservedDrive ? "preservado" : "verificación pendiente"}</span>
      </div>
    </div>
  );
}
