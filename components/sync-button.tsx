"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setState("done");
      router.refresh();
    } catch {
      setErrorMessage("sync_unavailable");
      setState("error");
    }
  }

  const label = state === "busy" ? "Actualizando…" : state === "done" ? "Actualizado" : state === "error" ? "Error al actualizar" : "Actualizar datos";
  return <button className="ghost" type="button" onClick={sync} disabled={state === "busy"} title={errorMessage || undefined}>{label}</button>;
}
