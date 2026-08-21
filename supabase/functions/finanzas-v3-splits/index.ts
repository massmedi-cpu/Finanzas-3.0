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
  const response = await fetch(`${LEGACY_API}/api/__finanzas_v3_token_probe__`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  return response.status !== 401 && response.status !== 403;
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

function cleanText(value: unknown, max = 500) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function pathOf(req: Request) {
  const url = new URL(req.url);
  const marker = "/finanzas-v3-splits";
  const index = url.pathname.lastIndexOf(marker);
  return index >= 0 ? (url.pathname.slice(index + marker.length) || "/") : url.pathname;
}

Deno.serve(async (req: Request) => {
  const path = pathOf(req);
  if (path === "/health") return json({ ok: true, version: 1 });

  const token = bearer(req);
  if (!(await authorized(token))) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    if (path === "/splits" && req.method === "GET") {
      const splits = await rest("finance_v3_movement_splits?select=*&order=source_id.asc,line_no.asc");
      return json({ ok: true, splits });
    }

    if (path === "/split" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const sourceId = cleanText(body.sourceId, 200);
      const sourceAmount = Number(body.sourceAmount);
      const lines = Array.isArray(body.lines) ? body.lines : [];

      if (!sourceId || !Number.isFinite(sourceAmount) || sourceAmount === 0 || lines.length < 2 || lines.length > 12) {
        return json({ ok: false, error: "invalid_split" }, 400);
      }

      const direction = Math.sign(sourceAmount);
      let total = 0;
      const normalized = [];
      for (const raw of lines) {
        const amount = Number(raw?.amount);
        const category = cleanText(raw?.category, 120);
        const subcategory = cleanText(raw?.subcategory, 120);
        const notes = cleanText(raw?.notes, 1000);
        if (!Number.isFinite(amount) || amount === 0 || Math.sign(amount) !== direction || !category) {
          return json({ ok: false, error: "invalid_split_line" }, 400);
        }
        total += amount;
        normalized.push({ amount, category, subcategory, notes });
      }

      if (Math.abs(total - sourceAmount) > 0.01) {
        return json({ ok: false, error: "split_total_mismatch" }, 400);
      }

      const splits = await rest("rpc/finance_v3_replace_movement_splits", {
        method: "POST",
        body: JSON.stringify({ p_source_id: sourceId, p_source_amount: sourceAmount, p_lines: normalized }),
      });
      return json({ ok: true, splits });
    }

    if (path === "/split" && req.method === "DELETE") {
      const sourceId = cleanText(new URL(req.url).searchParams.get("sourceId"), 200);
      if (!sourceId) return json({ ok: false, error: "source_id_required" }, 400);
      const deleted = await rest("rpc/finance_v3_delete_movement_splits", {
        method: "POST",
        body: JSON.stringify({ p_source_id: sourceId }),
      });
      return json({ ok: true, deleted: Number(deleted) || 0 });
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    console.error("finanzas_v3_splits_error", String((error as Error)?.message || error));
    return json({ ok: false, error: String((error as Error)?.message || error) }, 500);
  }
});
