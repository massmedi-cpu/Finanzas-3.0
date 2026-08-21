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

function validDate(value: unknown) {
  const text = cleanText(value, 10);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function pathOf(req: Request) {
  const url = new URL(req.url);
  const marker = "/finanzas-v3-recurring";
  const index = url.pathname.lastIndexOf(marker);
  return index >= 0 ? (url.pathname.slice(index + marker.length) || "/") : url.pathname;
}

Deno.serve(async (req: Request) => {
  const path = pathOf(req);
  if (path === "/health") return json({ ok: true, version: 1 });

  const token = bearer(req);
  if (!(await authorized(token))) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    if (path === "/preferences" && req.method === "GET") {
      const preferences = await rest("finance_v3_recurring_preferences?select=*&order=status.asc,updated_at.desc");
      return json({ ok: true, preferences });
    }

    if (path === "/preference" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const patternKey = cleanText(body.patternKey, 1000);
      const status = ["auto", "confirmed", "ignored"].includes(body.status) ? body.status : "auto";
      const expectedAmount = body.expectedAmount === "" || body.expectedAmount == null ? null : Number(body.expectedAmount);
      const nextExpectedDate = body.nextExpectedDate ? validDate(body.nextExpectedDate) : null;
      if (!patternKey || (expectedAmount !== null && !Number.isFinite(expectedAmount)) || (body.nextExpectedDate && !nextExpectedDate)) {
        return json({ ok: false, error: "invalid_recurring_preference" }, 400);
      }
      const result = await rest("finance_v3_recurring_preferences?on_conflict=pattern_key", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          pattern_key: patternKey,
          status,
          display_name: cleanText(body.displayName, 180),
          expected_amount: expectedAmount,
          category: cleanText(body.category, 120),
          next_expected_date: nextExpectedDate,
          notes: cleanText(body.notes, 1000),
        }),
      });
      return json({ ok: true, preference: Array.isArray(result) ? result[0] : result });
    }

    if (path === "/preference" && req.method === "DELETE") {
      const patternKey = cleanText(new URL(req.url).searchParams.get("patternKey"), 1000);
      if (!patternKey) return json({ ok: false, error: "pattern_key_required" }, 400);
      await rest(`finance_v3_recurring_preferences?pattern_key=eq.${encodeURIComponent(patternKey)}`, {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
      });
      return json({ ok: true });
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    console.error("finanzas_v3_recurring_error", String((error as Error)?.message || error));
    return json({ ok: false, error: String((error as Error)?.message || error) }, 500);
  }
});
