"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function sync() {
    setState("busy");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("financial-app-sync", {
      method: "POST",
      body: { action: "sync" },
    });
    if (error || !data?.ok) {
      setState("error");
      return;
    }
    setState("done");
    router.refresh();
  }

  const label = state === "busy" ? "Actualizando…" : state === "done" ? "Actualizado" : state === "error" ? "Error al actualizar" : "Actualizar datos";
  return <button className="ghost" type="button" onClick={sync} disabled={state === "busy"}>{label}</button>;
}
