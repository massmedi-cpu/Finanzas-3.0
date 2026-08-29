"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SyncState = "idle" | "busy" | "done" | "unchanged" | "warning" | "error";

type SyncButtonProps = {
  reconciliationPending?: boolean;
};

export function SyncButton({ reconciliationPending = false }: SyncButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<SyncState>("idle");
  const [pendingReconciliation, setPendingReconciliation] = useState(reconciliationPending);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function sync() {
    setState("busy");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setErrorMessage(data?.error || `sync_${response.status}`);
        setState("error");
        return;
      }

      const documentWarning=data?.documents?.ok===false;
      const reconciliationCompleted=pendingReconciliation&&!documentWarning;
      if(reconciliationCompleted)setPendingReconciliation(false);

      if(documentWarning){
        setErrorMessage(`Documentos Drive: ${String(data.documents.error || "no disponibles")}`);
        setState("warning");
      }else if(data?.changed===true||reconciliationCompleted){
        setState("done");
      }else{
        setState("unchanged");
      }

      // El backend puede estar ya actualizado aunque esta pantalla conserve datos de una
      // renderización anterior. Tras cualquier sync correcto refrescamos Inicio para que
      // "Actualizar datos" signifique también volver a leer el estado actual de la app.
      startRefresh(()=>router.refresh());
    } catch {
      setErrorMessage("sync_unavailable");
      setState("error");
    }
  }

  const idleLabel=pendingReconciliation?"Reconciliar Drive":"Actualizar datos";
  const label = refreshing ? "Aplicando cambios…" : state === "busy" ? "Actualizando…" : state === "done" ? "Actualizado" : state === "unchanged" ? "Sin cambios" : state === "warning" ? "Actualizado con aviso" : state === "error" ? "Error al actualizar" : idleLabel;
  const title=errorMessage||(pendingReconciliation?"Drive necesita una reconciliación completa para confirmar qué documentos siguen presentes":"Actualiza movimientos y documentos de Google Drive");
  return <button className="ghost" type="button" onClick={()=>sync()} disabled={state === "busy" || refreshing} title={title}>{label}</button>;
}
