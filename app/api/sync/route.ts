import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api/response";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) return apiError("session_unavailable", 401);

  try {
    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/financial-app-sync`, {
      method: "POST",
      headers: {apikey: SUPABASE_PUBLISHABLE_KEY,authorization: `Bearer ${accessToken}`,"content-type": "application/json"},
      body: JSON.stringify({ action: "sync" }),
      cache: "no-store",
    });
    const raw = await upstream.text();
    let payload: Record<string, unknown> | null = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (!upstream.ok || !payload || payload.ok === false) {
      console.error("financial_app_api_failure", { context:"sync.upstream", status:upstream.status });
      return apiError("sync_failed", upstream.status >= 500 ? 502 : Math.max(400, upstream.status));
    }
    return apiJson(payload, upstream.status);
  } catch {
    console.error("financial_app_api_failure", { context:"sync.fetch", publicCode:"sync_unavailable" });
    return apiError("sync_unavailable", 502);
  }
}
