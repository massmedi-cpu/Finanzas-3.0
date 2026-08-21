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
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

function serviceHeaders() {
  return {
    apikey: SERVICE_ROLE,
    authorization: `Bearer ${SERVICE_ROLE}`,
    "content-type": "application/json",
    accept: "application/json",
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${REST}/${path}`, { ...init, headers: { ...serviceHeaders(), ...(init.headers || {}) }, cache: "no-store" });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `rest_${response.status}`);
  return data;
}

async function rpc(name: string, body: Record<string, unknown>) {
  return rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

function pathOf(req: Request) {
  const url = new URL(req.url);
  const marker = "/finanzas-v3-rules";
  const index = url.pathname.lastIndexOf(marker);
  return index >= 0 ? (url.pathname.slice(index + marker.length) || "/") : url.pathname;
}

function text(value: unknown, max: number) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, max) : null;
}

function optionalText(value: unknown, max: number) {
  return text(value, max);
}

async function principalId() {
  const rows = await rest(`finance_principals?principal_key=eq.${encodeURIComponent(PRINCIPAL_KEY)}&select=id&limit=1`);
  const id = Array.isArray(rows) ? rows[0]?.id : null;
  if (!id) throw new Error("finance_principal_not_found");
  return String(id);
}

function parseRule(body: Record<string, unknown>) {
  const name = text(body.name, 180);
  const matchField = text(body.matchField, 40);
  const matchMode = text(body.matchMode, 40);
  const matchText = text(body.matchText, 180);
  const accountKey = optionalText(body.accountKey, 180);
  const direction = text(body.direction ?? "any", 20) || "any";
  const category = optionalText(body.targetCategory, 120);
  const subcategory = optionalText(body.targetSubcategory, 120);
  const merchant = optionalText(body.targetMerchant, 180);
  const notes = optionalText(body.notes, 1000);
  const priority = Math.max(0, Math.min(1000, Math.trunc(Number(body.priority ?? 100))));
  const active = body.active !== false;

  if (!name || !matchText || matchText.length < 2) throw new Error("invalid_rule_identity");
  if (!["merchant", "concept", "merchant_or_concept"].includes(matchField || "")) throw new Error("invalid_match_field");
  if (!["contains", "equals", "starts_with"].includes(matchMode || "")) throw new Error("invalid_match_mode");
  if (!["any", "income", "expense"].includes(direction)) throw new Error("invalid_direction");
  if (!category && !subcategory && !merchant) throw new Error("rule_target_required");

  return { name, matchField, matchMode, matchText, accountKey, direction, category, subcategory, merchant, notes, priority, active };
}

async function writeEvent(ownerId: string, ruleId: string | null, action: string, snapshot: unknown) {
  await rest("finance_v3_classification_rule_events", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ owner_id: ownerId, rule_id: ruleId, action, snapshot }),
  });
}

Deno.serve(async (req: Request) => {
  const path = pathOf(req);
  if (path === "/health") return json({ ok: true, version: 1 });

  const token = bearer(req);
  if (!(await authorized(token))) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const ownerId = await principalId();
    const url = new URL(req.url);

    if (path === "/rules" && req.method === "GET") {
      const rules = await rest(`finance_v3_classification_rules?owner_id=eq.${encodeURIComponent(ownerId)}&select=*&order=active.desc,priority.desc,created_at.asc`);
      return json({ ok: true, rules: Array.isArray(rules) ? rules : [] });
    }

    if (path === "/events" && req.method === "GET") {
      const events = await rest(`finance_v3_classification_rule_events?owner_id=eq.${encodeURIComponent(ownerId)}&select=*&order=created_at.desc&limit=100`);
      return json({ ok: true, events: Array.isArray(events) ? events : [] });
    }

    if (path === "/preview" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const rule = parseRule({ ...body, name: body.name || "Vista previa" });
      const preview = await rpc("finance_v260_rule_preview", {
        p_principal_key: PRINCIPAL_KEY,
        p_match_field: rule.matchField,
        p_match_mode: rule.matchMode,
        p_match_text: rule.matchText,
        p_account_key: rule.accountKey,
        p_direction: rule.direction,
        p_target_category: rule.category,
        p_target_subcategory: rule.subcategory,
        p_target_merchant: rule.merchant,
        p_limit: 12,
      });
      return json(preview);
    }

    if (path === "/rule" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const rule = parseRule(body);
      const id = text(body.id, 36);
      let previous: Record<string, unknown> | null = null;
      if (id) {
        const rows = await rest(`finance_v3_classification_rules?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=*&limit=1`);
        previous = Array.isArray(rows) ? rows[0] ?? null : null;
        if (!previous) return json({ ok: false, error: "rule_not_found" }, 404);
      }
      const payload: Record<string, unknown> = {
        owner_id: ownerId,
        name: rule.name,
        active: rule.active,
        priority: rule.priority,
        match_field: rule.matchField,
        match_mode: rule.matchMode,
        match_text: rule.matchText,
        account_key: rule.accountKey,
        direction: rule.direction,
        target_category: rule.category,
        target_subcategory: rule.subcategory,
        target_merchant: rule.merchant,
        notes: rule.notes,
        updated_at: new Date().toISOString(),
      };
      if (id) payload.id = id;
      const savedRows = await rest("finance_v3_classification_rules?on_conflict=id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
      const saved = Array.isArray(savedRows) ? savedRows[0] : savedRows;
      const savedId = String(saved?.id || id || "");
      let action = previous ? "update" : "create";
      if (previous && Boolean(previous.active) !== rule.active) action = rule.active ? "enable" : "disable";
      await writeEvent(ownerId, savedId || null, action, { before: previous, after: saved });
      return json({ ok: true, rule: saved });
    }

    if (path === "/rule" && req.method === "DELETE") {
      const id = text(url.searchParams.get("id"), 36);
      if (!id) return json({ ok: false, error: "rule_id_required" }, 400);
      const rows = await rest(`finance_v3_classification_rules?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=*&limit=1`);
      const existing = Array.isArray(rows) ? rows[0] ?? null : null;
      if (!existing) return json({ ok: false, error: "rule_not_found" }, 404);
      await writeEvent(ownerId, id, "delete", { before: existing });
      await rest(`finance_v3_classification_rules?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}`, {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
      });
      return json({ ok: true });
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    const message = String((error as Error)?.message || error);
    const badRequest = ["invalid_rule_identity", "invalid_match_field", "invalid_match_mode", "invalid_direction", "rule_target_required"].includes(message);
    console.error("finanzas_v3_rules_error", message);
    return json({ ok: false, error: message }, badRequest ? 400 : 500);
  }
});
