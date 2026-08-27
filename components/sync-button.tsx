"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SyncState = "idle" | "busy" | "done" | "unchanged" | "warning" | "error";

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>("idle");
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
      if(documentWarning){
        setErrorMessage(`Documentos Drive: ${String(data.documents.error || "no disponibles")}`);
        setState("warning");
      }else if(data?.changed===true){
        setState("done");
      }else{
        setState("unchanged");
      }

      // Una sincronización sin cambios no vuelve a renderizar toda la aplicación.
      // Cuando sí cambian datos, React mantiene la vista actual interactiva mientras llega el RSC actualizado.
      if(data?.changed===true){
        startRefresh(()=>router.refresh());
      }
    } catch {
      setErrorMessage("sync_unavailable");
      setState("error");
    }
  }

  const label = refreshing ? "Aplicando cambios…" : state === "busy" ? "Actualizando…" : state === "done" ? "Actualizado" : state === "unchanged" ? "Sin cambios" : state === "warning" ? "Actualizado con aviso" : state === "error" ? "Error al actualizar" : "Actualizar datos";
  return <button className="ghost" type="button" onClick={()=>sync()} disabled={state === "busy" || refreshing} title={errorMessage || "Actualiza movimientos y documentos de Google Drive"}>{label}</button>;
}
