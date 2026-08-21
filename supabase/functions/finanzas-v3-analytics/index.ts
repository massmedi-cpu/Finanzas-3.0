import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION = 2;
const NORMALIZED_API = "https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-normalized";
const PRINCIPAL_KEY = "private-session-owner";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REST = `${SUPABASE_URL}/rest/v1`;

function headers() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-finanzas-v3-analytics": String(VERSION),
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers() });
}

function bearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function serviceHeaders() {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("supabase_env_missing");
  return {
    apikey: SERVICE_ROLE,
    authorization: `Bearer ${SERVICE_ROLE}`,
    "content-type": "application/json",
    accept: "application/json",
  };
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${REST}/rpc/${name}`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `rpc_${name}_${response.status}`);
  return data as T;
}

async function requireFreshNormalized(token: string): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  const response = await fetch(`${NORMALIZED_API}/state`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const state = await response.json().catch(() => null);
  return state?.ok && state?.inSync ? state : null;
}

function pathOf(req: Request) {
  const url = new URL(req.url);
  const marker = "/finanzas-v3-analytics";
  const index = url.pathname.lastIndexOf(marker);
  return index >= 0 ? (url.pathname.slice(index + marker.length) || "/") : url.pathname;
}

Deno.serve(async (req: Request) => {
  const path = pathOf(req);
  try {
    if (path === "/health" && req.method === "GET") {
      return json({ ok: true, version: VERSION });
    }

    const token = bearer(req);
    const normalizedState = await requireFreshNormalized(token);
    if (!normalizedState) return json({ ok: false, error: "unauthorized_or_stale" }, 401);

    const url = new URL(req.url);
    if (path === "/reports" && req.method === "GET") {
      const year = (url.searchParams.get("year") || "").trim();
      if (year && !/^\d{4}$/.test(year)) return json({ ok: false, error: "invalid_year" }, 400);
      return json(await rpc("finance_v220_reports", { p_principal_key: PRINCIPAL_KEY, p_year: year || null }));
    }

    if (path === "/budget" && req.method === "GET") {
      const month = (url.searchParams.get("month") || "").trim();
      if (month && !/^\d{4}-\d{2}$/.test(month)) return json({ ok: false, error: "invalid_month" }, 400);
      return json(await rpc("finance_v220_budget", { p_principal_key: PRINCIPAL_KEY, p_month: month || null }));
    }

    if (path === "/review" && req.method === "GET") {
      return json(await rpc("finance_v220_review", { p_principal_key: PRINCIPAL_KEY }));
    }

    if (path === "/forecast-inputs" && req.method === "GET") {
      const inputs = await rpc<Record<string, unknown>>("finance_v220_forecast_inputs", { p_principal_key: PRINCIPAL_KEY });
      return json({ ...inputs, state: normalizedState });
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    const message = String((error as Error)?.message || error);
    console.error("finanzas_v3_analytics_error", message);
    return json({ ok: false, error: message }, 500);
  }
});
