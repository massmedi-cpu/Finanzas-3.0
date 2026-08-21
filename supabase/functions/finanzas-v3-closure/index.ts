import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LEGACY_API = "https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-alberto-api";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REST = `${SUPABASE_URL}/rest/v1`;

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

async function rest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", SERVICE_ROLE);
  headers.set("authorization", `Bearer ${SERVICE_ROLE}`);
  headers.set("content-type", "application/json");
  headers.set("accept", "application/json");
  const response = await fetch(`${REST}/${path}`, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `db_${response.status}`);
  return data;
}

function pathOf(req: Request) {
  const url = new URL(req.url);
  const marker = "/finanzas-v3-closure";
  const index = url.pathname.lastIndexOf(marker);
  return index >= 0 ? (url.pathname.slice(index + marker.length) || "/") : url.pathname;
}

function validMonth(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

function cleanNote(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 1000) : null;
}

function safeSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 100_000) throw new Error("snapshot_too_large");
  return value;
}

Deno.serve(async (req: Request) => {
  const path = pathOf(req);
  if (path === "/health") return json({ ok: true, version: 2 });

  const token = bearer(req);
  if (!(await authorized(token))) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const url = new URL(req.url);

    if (path === "/summary" && req.method === "GET") {
      const yearMonth = validMonth(url.searchParams.get("yearMonth"));
      if (!yearMonth) return json({ ok: false, error: "invalid_year_month" }, 400);
      const result = await rest("rpc/finance_v250_month_close_summary", {
        method: "POST",
        body: JSON.stringify({ p_year_month: yearMonth, p_principal_key: "private-session-owner" }),
      });
      return json({ ok: true, summary: Array.isArray(result) ? result[0] ?? null : result });
    }

    if (path === "/month" && req.method === "GET") {
      const yearMonth = validMonth(url.searchParams.get("yearMonth"));
      if (!yearMonth) return json({ ok: false, error: "invalid_year_month" }, 400);
      const result = await rest(`finance_v3_month_closures?year_month=eq.${encodeURIComponent(yearMonth)}&select=*&limit=1`);
      return json({ ok: true, closure: Array.isArray(result) ? result[0] ?? null : null });
    }

    if (path === "/month" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const yearMonth = validMonth(body.yearMonth);
      const action = body.action === "close" || body.action === "reopen" ? body.action : null;
      if (!yearMonth || !action) return json({ ok: false, error: "invalid_closure_request" }, 400);
      const note = cleanNote(body.note);
      const snapshot = safeSnapshot(body.snapshot);
      const now = new Date().toISOString();
      const payload = action === "close"
        ? { year_month: yearMonth, status: "closed", closed_at: now, reopened_at: null, note, snapshot, updated_at: now }
        : { year_month: yearMonth, status: "open", reopened_at: now, note, snapshot, updated_at: now };

      const result = await rest("finance_v3_month_closures?on_conflict=year_month", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
      await rest("finance_v3_month_closure_events", {
        method: "POST",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ year_month: yearMonth, action, note, snapshot }),
      });
      return json({ ok: true, closure: Array.isArray(result) ? result[0] ?? null : result });
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    console.error("finanzas_v3_closure_error", String((error as Error)?.message || error));
    return json({ ok: false, error: String((error as Error)?.message || error) }, 500);
  }
});
