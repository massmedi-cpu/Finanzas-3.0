import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION = 3;
const LEGACY_API = "https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-alberto-api";
const BRIDGE_API = "https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-bridge";
const PRINCIPAL_KEY = "private-session-owner";
const FILE_ID = "1OT4QFeRDAchLkznnQvmAe3SslDVXDm1JXU_kIGIhtV8";
const GOOGLE_EMAIL = "trayectos-clio@salud-conectada-d04bf.iam.gserviceaccount.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REST = `${SUPABASE_URL}/rest/v1`;
const AUTH_TTL_MS = 60_000;
const SOURCE_CHECK_TTL_MS = 60_000;
const ALLOWED_ORIGINS = new Set([
  "https://finanzas-3-0.vercel.app",
  "https://finanzas-3-0-massmedi-9832s-projects.vercel.app",
  "https://finanzas-3-0-git-main-massmedi-9832s-projects.vercel.app",
]);

const authCache = new Map<string, number>();
let googleTokenCache: { token: string; exp: number } | null = null;
let sourceCheckUntil = 0;
let sourceCheckPromise: Promise<void> | null = null;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers = new Headers({
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "vary": "Origin",
  });
  if (ALLOWED_ORIGINS.has(origin)) headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "authorization,content-type");
  return headers;
}

function json(req: Request, body: unknown, status = 200) {
  const headers = cors(req);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-finanzas-v3-normalized", String(VERSION));
  return new Response(JSON.stringify(body), { status, headers });
}

function bearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function b64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemBytes(raw: string) {
  let value = String(raw || "").trim();
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") value = parsed;
    else if (parsed?.private_key) value = parsed.private_key;
  } catch {}
  value = value.replace(/^GOOGLE_PRIVATE_KEY\s*=\s*/i, "").replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
  const match = value.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  let body = (match ? match[1] : value).replace(/\s+/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  const start = body.indexOf("MII");
  if (start > 0) body = body.slice(start);
  while (body.length % 4) body += "=";
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorized(token: string) {
  if (!token) return false;
  const key = await sha256Hex(token);
  const now = Date.now();
  if ((authCache.get(key) || 0) > now) return true;
  const response = await fetch(`${LEGACY_API}/api/__finanzas_v3_token_probe__`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  const ok = response.ok || response.status === 404;
  if (ok) {
    authCache.set(key, now + AUTH_TTL_MS);
    if (authCache.size > 64) for (const [cacheKey, expiry] of authCache) if (expiry <= now) authCache.delete(cacheKey);
  }
  return ok;
}

async function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  if (googleTokenCache && googleTokenCache.exp > now + 60) return googleTokenCache.token;
  const pem = Deno.env.get("GOOGLE_PRIVATE_KEY");
  if (!pem) throw new Error("drive_auth_required");
  const encoder = new TextEncoder();
  const header = b64(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64(encoder.encode(JSON.stringify({
    iss: GOOGLE_EMAIL,
    scope: "https://www.googleapis.com/auth/drive.metadata.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${claim}`))));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${signature}` }),
  });
  if (!response.ok) throw new Error(`google_auth_${response.status}`);
  const data = await response.json();
  if (!data?.access_token) throw new Error("google_auth_missing_token");
  googleTokenCache = { token: data.access_token, exp: now + Number(data.expires_in || 3600) };
  return data.access_token as string;
}

async function driveModifiedTime() {
  const token = await googleToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=modifiedTime`, {
    headers: { authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`drive_meta_${response.status}`);
  const data = await response.json();
  return String(data?.modifiedTime || "");
}

function serviceHeaders() {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("supabase_env_missing");
  return { apikey: SERVICE_ROLE, authorization: `Bearer ${SERVICE_ROLE}`, "content-type": "application/json", accept: "application/json" };
}

async function rest<T>(path: string): Promise<T> {
  const response = await fetch(`${REST}/${path}`, { headers: serviceHeaders(), cache: "no-store" });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `rest_${response.status}`);
  return data as T;
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${REST}/rpc/${name}`, {
    method: "POST", headers: serviceHeaders(), body: JSON.stringify(body), cache: "no-store",
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `rpc_${name}_${response.status}`);
  return data as T;
}

type NormalizedState = {
  ok?: boolean; inSync?: boolean; currentChecksum?: string | null; normalizedChecksum?: string | null;
  currentRows?: number | null; normalizedRows?: number | null; minDate?: string | null; maxDate?: string | null;
  lastNormalizedAt?: string | null; sourceModifiedAt?: string | null; snapshotSyncedAt?: string | null;
  accounts?: unknown[]; error?: string;
};

async function state() {
  return rpc<NormalizedState>("finance_v210_state", { p_principal_key: PRINCIPAL_KEY });
}

async function sync() {
  return rpc<Record<string, unknown>>("finance_v210_sync_current_snapshot", { p_principal_key: PRINCIPAL_KEY });
}

function sameInstant(a: unknown, b: unknown) {
  const left = Date.parse(String(a || ""));
  const right = Date.parse(String(b || ""));
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

async function checkSourceFreshness(token: string, force = false) {
  const now = Date.now();
  if (!force && sourceCheckUntil > now) return;
  if (!force && sourceCheckPromise) return sourceCheckPromise;

  const work = (async () => {
    const [driveTime, rows] = await Promise.all([
      driveModifiedTime(),
      rest<any[]>("finance_v3_current?id=eq.banking-source&select=source_modified_at,content_hash,row_count,synced_at"),
    ]);
    const current = Array.isArray(rows) ? rows[0] : null;
    if (!current || !sameInstant(driveTime, current.source_modified_at) || force) {
      const response = await fetch(`${BRIDGE_API}/source?refresh=1`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store",
      });
      if (!response.ok) throw new Error(`bridge_refresh_${response.status}`);
      try { await response.body?.cancel(); } catch {}
    }
    sourceCheckUntil = Date.now() + SOURCE_CHECK_TTL_MS;
  })();

  if (!force) sourceCheckPromise = work;
  try { await work; } finally { if (!force) sourceCheckPromise = null; }
}

async function ensureNormalized(token: string) {
  await checkSourceFreshness(token);
  let current = await state();
  if (current.ok && current.inSync) return current;
  await sync();
  current = await state();
  if (!current.ok || !current.inSync) throw new Error("normalized_source_out_of_sync");
  return current;
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function nullableText(value: string | null, max = 500) { if (value == null) return null; const text=value.trim(); return text ? text.slice(0,max) : null; }
function nullableDate(value: string | null) { const text=nullableText(value,10); return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null; }
function nullableUuid(value: string | null) { const text=nullableText(value,36); return text && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null; }

function transactionArgs(url: URL) {
  const status = nullableText(url.searchParams.get("status"),20) || "all";
  if (!["all","review","ok"].includes(status)) throw new Error("invalid_status");
  return {
    p_principal_key: PRINCIPAL_KEY,
    p_limit: Math.min(200, positiveInt(url.searchParams.get("limit"),100)),
    p_before_date: nullableDate(url.searchParams.get("cursorDate")),
    p_before_position: url.searchParams.get("cursorPosition") == null ? null : positiveInt(url.searchParams.get("cursorPosition"),1),
    p_before_id: nullableUuid(url.searchParams.get("cursorId")),
    p_year_month: nullableText(url.searchParams.get("month"),7),
    p_account_key: nullableText(url.searchParams.get("accountKey"),180),
    p_search: nullableText(url.searchParams.get("q"),250),
    p_review_mode: status,
    p_include_total: url.searchParams.get("includeTotal") !== "0",
  };
}

async function transactions(url: URL) { return rpc<Record<string, unknown>>("finance_v210_transactions_page", transactionArgs(url)); }
function pathOf(req: Request) { const url=new URL(req.url); const marker="/finanzas-v3-normalized"; const index=url.pathname.lastIndexOf(marker); return index>=0 ? (url.pathname.slice(index+marker.length)||"/") : url.pathname; }

Deno.serve(async (req: Request) => {
  const path=pathOf(req);
  if (req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  try {
    if (path==="/health" && req.method==="GET") {
      const current=await state();
      return json(req,{ok:true,version:VERSION,inSync:current.inSync===true,currentRows:current.currentRows??null,normalizedRows:current.normalizedRows??null,lastNormalizedAt:current.lastNormalizedAt??null});
    }
    const token=bearer(req);
    if (!(await authorized(token))) return json(req,{ok:false,error:"unauthorized"},401);

    if (path==="/state" && req.method==="GET") return json(req,await ensureNormalized(token));

    if (path==="/sync" && req.method==="POST") {
      await checkSourceFreshness(token,true);
      const result=await sync();
      const current=await state();
      return json(req,{ok:true,sync:result,state:current});
    }

    if (path==="/summary" && req.method==="GET") {
      const current=await ensureNormalized(token);
      const yearMonth=current.maxDate ? String(current.maxDate).slice(0,7) : null;
      return json(req,await rpc<Record<string,unknown>>("finance_v210_summary",{p_principal_key:PRINCIPAL_KEY,p_year_month:yearMonth}));
    }

    if ((path==="/transactions" || path==="/bootstrap") && req.method==="GET") {
      const current=await ensureNormalized(token);
      const result=await transactions(new URL(req.url));
      return json(req,path==="/bootstrap"?{ok:true,state:current,page:result}:result);
    }

    return json(req,{ok:false,error:"not_found"},404);
  } catch (error) {
    const message=String((error as Error)?.message||error);
    if (message==="invalid_status") return json(req,{ok:false,error:message},400);
    console.error("finanzas_v3_normalized_error",message);
    return json(req,{ok:false,error:message},500);
  }
});
