"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const AUTO_SYNC_INTERVAL = 15 * 60 * 1000;
const AUTO_SYNC_KEY = "financial-app-last-auto-sync";

type SyncState = "idle" | "busy" | "done" | "warning" | "error";

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function sync(silent=false) {
    if (!silent) setState("busy");
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
        if (silent) localStorage.removeItem(AUTO_SYNC_KEY);
        return;
      }
      localStorage.setItem(AUTO_SYNC_KEY,String(Date.now()));
      if (data?.documents?.ok === false) {
        setErrorMessage(`Documentos Drive: ${String(data.documents.error || "no disponibles")}`);
        setState("warning");
      } else {
        setState("done");
      }
      router.refresh();
    } catch {
      setErrorMessage("sync_unavailable");
      setState("error");
      if (silent) localStorage.removeItem(AUTO_SYNC_KEY);
    }
  }

  useEffect(()=>{
    const last=Number(localStorage.getItem(AUTO_SYNC_KEY)||0);
    if(Number.isFinite(last)&&Date.now()-last<AUTO_SYNC_INTERVAL)return;
    localStorage.setItem(AUTO_SYNC_KEY,String(Date.now()));
    void sync(true);
  // La sincronización automática se agenda una vez al montar; el bloqueo temporal vive en localStorage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const label = state === "busy" ? "Actualizando…" : state === "done" ? "Actualizado" : state === "warning" ? "Actualizado con aviso" : state === "error" ? "Error al actualizar" : "Actualizar datos";
  return <button className="ghost" type="button" onClick={()=>sync(false)} disabled={state === "busy"} title={errorMessage || "Actualiza movimientos y documentos de Google Drive"}>{label}</button>;
}
