"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function GoogleLoginButton() {
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        scopes: "openid email profile",
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) setBusy(false);
  }

  return (
    <button className="primaryButton" type="button" onClick={login} disabled={busy}>
      <span aria-hidden="true">G</span>
      {busy ? "Conectando…" : "Continuar con Google"}
    </button>
  );
}
