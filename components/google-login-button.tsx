"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { SUPABASE_PUBLIC_CONFIGURED } from "@/lib/supabase/config";

export function GoogleLoginButton() {
  const [busy, setBusy] = useState(false);

  function showOAuthError() {
    window.location.assign("/login?error=oauth");
  }

  async function login() {
    if (!SUPABASE_PUBLIC_CONFIGURED) return;
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
      if (error) showOAuthError();
    } catch {
      showOAuthError();
    }
  }

  return (
    <button className="google-button" type="button" onClick={login} disabled={!SUPABASE_PUBLIC_CONFIGURED || busy}>
      <span className="google-g" aria-hidden="true">G</span>
      {!SUPABASE_PUBLIC_CONFIGURED ? "Google OAuth pendiente" : busy ? "Conectando…" : "Continuar con Google"}
    </button>
  );
}
