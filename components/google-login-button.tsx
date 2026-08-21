"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export function GoogleLoginButton() {
  const [busy, setBusy] = useState(false);

  async function login() {
    if (!configured) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "openid email profile",
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button className="google-button" type="button" onClick={login} disabled={!configured || busy}>
      <span className="google-g" aria-hidden="true">G</span>
      {!configured ? "Google OAuth pendiente" : busy ? "Conectando…" : "Continuar con Google"}
    </button>
  );
}
