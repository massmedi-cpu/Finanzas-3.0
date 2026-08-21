import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LEGACY_API = "https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-alberto-api";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REST = `${SUPABASE_URL}/rest/v1`;
const PRINCIPAL_KEY = "private-session-owner";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function bearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

async function authorized(token: string) {
  if (!token) return false;
  try {
    const response = await fetch(`${LEGACY_API}/api/__finanzas_v3_token_probe__`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

function pathOf(req: Request) {
  const url = new URL(req.url);
  const marker = "/finanzas-v3-explainability";
  const index = url.pathname.lastIndexOf(marker);
  return index >= 0 ? (url.pathname.slice(index + marker.length) || "/") : url.pathname;
}

async function rpc(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${REST}/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `rpc_${name}_${response.status}`);
  return data;
}

Deno.serve(async (req: Request) => {
  const path = pathOf(req);
  if (path === "/health") return json({ ok: true, version: 1 });

  const token = bearer(req);
  if (!(await authorized(token))) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    if (path === "/suggestions" && req.method === "GET") {
      const limit = Math.max(1, Math.min(50, Number(new URL(req.url).searchParams.get("limit") || 20)));
      return json(await rpc("finance_v270_rule_suggestions", {
        p_principal_key: PRINCIPAL_KEY,
        p_limit: limit,
      }));
    }
    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    const message = String((error as Error)?.message || error);
    console.error("finanzas_v3_explainability_error", message);
    return json({ ok: false, error: message }, 500);
  }
});
