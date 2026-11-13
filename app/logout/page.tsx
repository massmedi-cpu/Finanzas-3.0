"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export default function LogoutPage() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  const signOut = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setFailed(false);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("logout_not_confirmed");
      window.location.replace("/login");
    } catch {
      started.current = false;
      setFailed(true);
    }
  }, []);

  useEffect(() => { void signOut(); }, [signOut]);

  return (
    <main id="main-content" className="reset-screen">
      <section className="reset-card" aria-labelledby="logout-title">
        <p className="eyebrow">Financial App · Acceso privado</p>
        <h1 id="logout-title">Cerrar sesión</h1>
        {failed ? (
          <>
            <p role="alert">No se ha podido confirmar el cierre de sesión. Puede seguir abierta en este navegador.</p>
            <button type="button" className="primary-button" onClick={() => void signOut()}>
              Reintentar cierre de sesión
            </button>
            <p><Link href="/" prefetch={false}>Volver a Inicio sin cerrar sesión</Link></p>
          </>
        ) : (
          <p role="status" aria-live="polite">Cerrando la sesión de este navegador…</p>
        )}
      </section>
    </main>
  );
}
