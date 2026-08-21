import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { unzipSync } from "npm:fflate@0.8.2";

const VERSION = 5;
const LEGACY_API = "https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-alberto-api";
const FILE_ID = "1OT4QFeRDAchLkznnQvmAe3SslDVXDm1JXU_kIGIhtV8";
const FILE_NAME = "Movimientos bancarios - fuente";
const GOOGLE_EMAIL = "trayectos-clio@salud-conectada-d04bf.iam.gserviceaccount.com";
const CACHE_TTL_MS = 60_000;
const CURRENT_ID = "banking-source";
const ALLOWED_ORIGINS = new Set([
  "https://finanzas-3-0.vercel.app",
  "https://finanzas-3-0-massmedi-9832s-projects.vercel.app",
  "https://finanzas-3-0-git-main-massmedi-9832s-projects.vercel.app",
]);
const EXPECTED_HEADER = [
  "ID origen","Fecha","Hora","Producto o cuenta","Entidad","Identificador","Tipo de producto","Tipo de movimiento","Categoría","Subcategoría","Concepto original","Concepto normalizado","Comercio o contraparte","Importe (€)","Saldo (€)","Canal","Cuenta de origen","Cuenta de destino","Conciliado","Revisar","Notas","Fuente",
];
let tokenCache: { token: string; exp: number } | null = null;
let sourceRefreshPromise: Promise<any> | null = null;

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
  headers.set("x-finanzas-v3-bridge", String(VERSION));
  return new Response(JSON.stringify(body), { status, headers });
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
  value = value
    .replace(/^GOOGLE_PRIVATE_KEY\s*=\s*/i, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
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

async function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp > now + 60) return tokenCache.token;
  const pem = Deno.env.get("GOOGLE_PRIVATE_KEY");
  if (!pem) throw new Error("drive_auth_required");
  const encoder = new TextEncoder();
  const header = b64(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64(encoder.encode(JSON.stringify({
    iss: GOOGLE_EMAIL,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${claim}`))));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth-type:jwt-bearer".replace("oauth-type", "oauth-type"),
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`google_auth_${response.status}`);
  const data = await response.json();
  if (!data?.access_token) throw new Error("google_auth_missing_token");
  tokenCache = { token: data.access_token, exp: now + Number(data.expires_in || 3600) };
  return data.access_token as string;
}

async function driveMeta(token: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,mimeType,modifiedTime,size,md5Checksum`, {
    headers: { authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`drive_meta_${response.status}`);
  return response.json();
}

async function driveBytes(token: string, meta: any) {
  const nativeSheet = String(meta?.mimeType || "") === "application/vnd.google-apps.spreadsheet";
  const url = nativeSheet
    ? `https://www.googleapis.com/drive/v3/files/${FILE_ID}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`
    : `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`drive_download_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function decodeXml(value: string) {
  return String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function attr(source: string, name: string) {
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(source || "").match(new RegExp(`(?:^|\\s)${safe}=(?:\"([^\"]*)\"|'([^']*)')`));
  return match ? decodeXml(match[1] ?? match[2] ?? "") : "";
}

function textFile(zip: Record<string, Uint8Array>, path: string) {
  const bytes = zip[path];
  if (!bytes) throw new Error(`xlsx_missing_${path}`);
  return new TextDecoder().decode(bytes);
}

function sharedStrings(zip: Record<string, Uint8Array>) {
  const bytes = zip["xl/sharedStrings.xml"];
  if (!bytes) return [] as string[];
  const xml = new TextDecoder().decode(bytes);
  const values: string[] = [];
  for (const match of xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) {
    let value = "";
    for (const text of match[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)) value += decodeXml(text[1]);
    values.push(value);
  }
  return values;
}

function resolveTarget(target: string) {
  const value = String(target || "").replace(/\\/g, "/");
  if (value.startsWith("/xl/")) return value.slice(1);
  if (value.startsWith("xl/")) return value;
  const parts = ["xl"];
  for (const segment of value.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop(); else parts.push(segment);
  }
  return parts.join("/");
}

function workbookSheets(zip: Record<string, Uint8Array>) {
  const workbook = textFile(zip, "xl/workbook.xml");
  const rels = textFile(zip, "xl/_rels/workbook.xml.rels");
  const relMap = new Map<string, string>();
  for (const match of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/g)) relMap.set(attr(match[1], "Id"), resolveTarget(attr(match[1], "Target")));
  const sheets: { name: string; path: string }[] = [];
  for (const match of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?\s*>/g)) {
    const name = attr(match[1], "name");
    const path = relMap.get(attr(match[1], "r:id"));
    if (name && path) sheets.push({ name, path });
  }
  return sheets;
}

function cellValue(body: string, attrs: string, shared: string[]) {
  const type = attr(attrs, "t");
  if (type === "inlineStr") {
    let value = "";
    for (const match of body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)) value += decodeXml(match[1]);
    return value;
  }
  const match = body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);
  const raw = match ? decodeXml(match[1]) : "";
  if (type === "s") return shared[Number(raw)] ?? "";
  if (type === "str") return raw;
  const number = Number(raw);
  return raw !== "" && Number.isFinite(number) ? number : raw;
}

function excelDate(value: unknown) {
  if (typeof value === "string") {
    const raw = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Date(Math.round((number - 25569) * 86400000)).toISOString().slice(0, 10);
}

function parseRows(bytes: Uint8Array) {
  const zip = unzipSync(bytes) as Record<string, Uint8Array>;
  const shared = sharedStrings(zip);
  const sheets = workbookSheets(zip);
  if (!sheets.length) throw new Error("xlsx_sheet_not_found");

  const sheetNames: string[] = [];
  const bySourceId = new Map<string, any>();
  const withoutSourceId: any[] = [];

  for (const sheet of sheets) {
    const xml = textFile(zip, sheet.path);
    const rows: Record<string, unknown>[] = [];
    for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const values: Record<string, unknown> = {};
      for (const cellMatch of rowMatch[2].matchAll(/<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
        const ref = attr(cellMatch[1], "r");
        const column = (ref.match(/^([A-Z]+)/) || [])[1];
        if (column) values[column] = cellValue(cellMatch[2], cellMatch[1], shared);
      }
      rows.push(values);
    }

    const header = rows[0] || {};
    const actual = Array.from({ length: 22 }, (_, index) => header[String.fromCharCode(65 + index)] ?? "").map((value) => String(value).trim());
    if (!EXPECTED_HEADER.every((value, index) => actual[index] === value)) continue;

    sheetNames.push(sheet.name);
    for (const row of rows.slice(1)) {
      const parsed = {
        sourceId: String(row.A ?? "").trim(), date: excelDate(row.B), time: String(row.C ?? "").trim(), productOrAccount: String(row.D ?? "").trim(), institution: String(row.E ?? "").trim(), identifier: String(row.F ?? "").trim(), productType: String(row.G ?? "").trim(), movementType: String(row.H ?? "").trim(), category: String(row.I ?? "").trim(), subcategory: String(row.J ?? "").trim(), originalConcept: String(row.K ?? "").trim(), normalizedConcept: String(row.L ?? "").trim(), merchantOrCounterparty: String(row.M ?? "").trim(), amount: row.N === "" || row.N == null ? null : Number(row.N), balance: row.O === "" || row.O == null ? null : Number(row.O), channel: String(row.P ?? "").trim(), originAccount: String(row.Q ?? "").trim(), destinationAccount: String(row.R ?? "").trim(), reconciled: String(row.S ?? "").trim(), review: String(row.T ?? "").trim(), notes: String(row.U ?? "").trim(), source: String(row.V ?? "").trim(),
      };
      if (!(parsed.sourceId || parsed.date || parsed.originalConcept || parsed.amount !== null)) continue;

      if (!parsed.sourceId) {
        withoutSourceId.push(parsed);
        continue;
      }

      const previous = bySourceId.get(parsed.sourceId);
      if (previous) {
        const compatible = previous.date === parsed.date
          && previous.amount === parsed.amount
          && previous.identifier === parsed.identifier
          && previous.productOrAccount === parsed.productOrAccount;
        if (!compatible) throw new Error("source_duplicate_id_conflict");
      }
      bySourceId.set(parsed.sourceId, parsed);
    }
  }

  if (!sheetNames.length) throw new Error("source_schema_mismatch");
  const output = [...bySourceId.values(), ...withoutSourceId];
  return {
    sheetName: sheetNames.length === 1 ? sheetNames[0] : `Todas las cuentas (${sheetNames.length})`,
    sheetNames,
    rows: output,
  };
}

function bearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

async function validateLegacyToken(token: string) {
  if (!token) return false;
  const response = await fetch(`${LEGACY_API}/api/__finanzas_v3_token_probe__`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  return response.ok || response.status === 404;
}

function relativePath(url: URL) {
  const marker = "/finanzas-v3-bridge";
  const index = url.pathname.lastIndexOf(marker);
  return index >= 0 ? (url.pathname.slice(index + marker.length) || "/") : url.pathname;
}

function supabaseConfig() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("supabase_env_missing");
  return { url, key };
}

function serviceHeaders(extra: Record<string, string> = {}) {
  const { key } = supabaseConfig();
  return { apikey: key, authorization: `Bearer ${key}`, ...extra };
}

async function getCurrentSource() {
  const { url } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/finance_v3_current?id=eq.${encodeURIComponent(CURRENT_ID)}&select=*`, { headers: serviceHeaders({ accept: "application/json" }), cache: "no-store" });
  if (!response.ok) throw new Error(`snapshot_current_${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

function sameInstant(left: unknown, right: unknown) {
  const a = Date.parse(String(left || ""));
  const b = Date.parse(String(right || ""));
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

async function touchCurrentSource(current: any, meta: any) {
  const { url } = supabaseConfig();
  const now = new Date().toISOString();
  const response = await fetch(`${url}/rest/v1/finance_v3_current?id=eq.${encodeURIComponent(CURRENT_ID)}`, {
    method: "PATCH",
    headers: serviceHeaders({ "content-type": "application/json", prefer: "return=minimal" }),
    body: JSON.stringify({ source_modified_at: meta.modifiedTime || current.source_modified_at || null, synced_at: now, updated_at: now }),
  });
  if (!response.ok) throw new Error(`snapshot_touch_${response.status}`);
  return { ...current, source_modified_at: meta.modifiedTime || current.source_modified_at || null, synced_at: now, updated_at: now };
}

async function persistSource(meta: any, parsed: { sheetName: string; sheetNames?: string[]; rows: any[] }, current: any) {
  const { url } = supabaseConfig();
  const contentHash = await sha256Hex(JSON.stringify(parsed.rows));
  const now = new Date().toISOString();
  const payload = { rows: parsed.rows };
  if (!current || current.content_hash !== contentHash) {
    const snapshot = await fetch(`${url}/rest/v1/finance_v3_snapshots`, {
      method: "POST", headers: serviceHeaders({ "content-type": "application/json", prefer: "return=minimal" }),
      body: JSON.stringify({ source_file_id: meta.id, source_name: meta.name, source_modified_at: meta.modifiedTime || null, sheet_name: parsed.sheetName, row_count: parsed.rows.length, content_hash: contentHash, payload, captured_at: now }),
    });
    if (!snapshot.ok && snapshot.status !== 409) throw new Error(`snapshot_insert_${snapshot.status}`);
  }
  const upsert = await fetch(`${url}/rest/v1/finance_v3_current?on_conflict=id`, {
    method: "POST", headers: serviceHeaders({ "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ id: CURRENT_ID, source_file_id: meta.id, source_name: meta.name, source_modified_at: meta.modifiedTime || null, sheet_name: parsed.sheetName, row_count: parsed.rows.length, content_hash: contentHash, payload, synced_at: now, updated_at: now }),
  });
  if (!upsert.ok) throw new Error(`snapshot_upsert_${upsert.status}`);
  return { contentHash, syncedAt: now, changed: !current || current.content_hash !== contentHash };
}

function cachedPayload(current: any, cache = "hit") {
  const rows = current?.payload?.rows;
  if (!Array.isArray(rows)) return null;
  return { ok: true, source: { id: current.source_file_id, name: current.source_name, modifiedTime: current.source_modified_at, sheetName: current.sheet_name, rowCount: current.row_count, contentHash: current.content_hash, syncedAt: current.synced_at, cache }, rows };
}

async function refreshSource(current: any, force: boolean) {
  const google = await googleToken();
  const meta = await driveMeta(google);
  if (meta.name !== FILE_NAME) throw new Error("source_name_mismatch");

  if (!force && current && sameInstant(meta.modifiedTime, current.source_modified_at)) {
    const touched = await touchCurrentSource(current, meta);
    const cached = cachedPayload(touched, "validated");
    if (cached) return cached;
  }

  const parsed = parseRows(await driveBytes(google, meta));
  const persisted = await persistSource(meta, parsed, current);
  return { ok: true, source: { id: meta.id, name: meta.name, modifiedTime: meta.modifiedTime || null, mimeType: meta.mimeType || null, sheetName: parsed.sheetName, rowCount: parsed.rows.length, contentHash: persisted.contentHash, syncedAt: persisted.syncedAt, cache: "refreshed", changed: persisted.changed }, rows: parsed.rows };
}

async function loadSource(force: boolean) {
  const current = await getCurrentSource();
  const syncedAt = current?.synced_at ? Date.parse(String(current.synced_at)) : 0;
  if (!force && current && Number.isFinite(syncedAt) && Date.now() - syncedAt < CACHE_TTL_MS) {
    const cached = cachedPayload(current);
    if (cached) return cached;
  }

  if (force) return refreshSource(current, true);
  if (sourceRefreshPromise) return sourceRefreshPromise;

  sourceRefreshPromise = refreshSource(current, false);
  try {
    return await sourceRefreshPromise;
  } finally {
    sourceRefreshPromise = null;
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = relativePath(url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  try {
    if (path === "/health") {
      const current = await getCurrentSource().catch(() => null);
      return json(req, { ok: true, version: VERSION, source: FILE_NAME, auth: "legacy-finanzas-token", cache: current ? { rows: current.row_count, syncedAt: current.synced_at, contentHash: current.content_hash } : null });
    }
    if (path === "/login" && req.method === "POST") {
      let key = "";
      try { key = String((await req.json())?.key || ""); } catch {}
      const response = await fetch(`${LEGACY_API}/__login`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ key }), cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json(req, { ok: false, error: "invalid_key" }, response.status === 401 ? 401 : 502);
      return json(req, { ok: true, token: data.token, expires_in: data.expires_in });
    }
    if (path === "/source" && req.method === "GET") {
      const token = bearer(req);
      if (!(await validateLegacyToken(token))) return json(req, { ok: false, error: "unauthorized" }, 401);
      return json(req, await loadSource(url.searchParams.get("refresh") === "1"));
    }
    return json(req, { ok: false, error: "not_found" }, 404);
  } catch (error) {
    console.error("finanzas_v3_bridge_error", String((error as Error)?.message || error));
    return json(req, { ok: false, error: String((error as Error)?.message || error) }, 500);
  }
});
