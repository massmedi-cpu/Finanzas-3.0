import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { unzipSync } from "npm:fflate@0.8.2";

const VERSION = 7;
const FILE_ID = "1OT4QFeRDAchLkznnQvmAe3SslDVXDm1JXU_kIGIhtV8";
const FILE_NAME = "Movimientos bancarios - fuente";
const DRIVE_DOCUMENTS_ROOT_ID = "1HR64X9Tu2FuRD2cdyA6BGOIqfxZqtaIW";
const DRIVE_DOCUMENTS_ROOT_NAME = "Compras_y_facturas";
const GOOGLE_EMAIL = "trayectos-clio@salud-conectada-d04bf.iam.gserviceaccount.com";
const SHEETS = ["Cuenta corriente · 3967", "Cuenta ahorro · 2504"];
const HEADER = ["ID origen","Fecha","Hora","Producto o cuenta","Entidad","Identificador","Tipo de producto","Tipo de movimiento","Categoría","Subcategoría","Concepto original","Concepto normalizado","Comercio o contraparte","Importe (€)","Saldo (€)","Canal","Cuenta de origen","Cuenta de destino","Conciliado","Revisar","Notas","Fuente"];
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_DRIVE_DOCUMENTS = 2000;
const MAX_DRIVE_DEPTH = 12;

let tokenCache: { token: string; exp: number } | null = null;

type DriveScanMode = "full" | "incremental";
type DriveScanStats = {
  mode: DriveScanMode;
  folders: number;
  listRequests: number;
  rawItems: number;
  supportedDocuments: number;
  maxDepth: number;
  removedDocuments: number;
  ambiguousRemovals: number;
  fallbackFullScan: boolean;
};
type DriveDelta = {
  mode: DriveScanMode;
  files: any[];
  removedIds: string[];
  nextToken: string;
};
type SyncMetrics = {
  runId: string;
  totalMs: number;
  timings: Record<string, number>;
  drive: DriveScanStats;
  sourceChanged: boolean;
  documentChanged: boolean;
  autoLinked: number;
  autoLinkSkipped: boolean;
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
class DriveChangeTokenError extends Error {}

function env(name: string) {
  const value = Deno.env.get(name) || "";
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-financial-app-sync": String(VERSION),
    },
  });
}
function authorization(req: Request) {
  const header = req.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header : "";
}
function serviceHeaders(extra: Record<string, string> = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, authorization: `Bearer ${key}`, ...extra };
}
function ms(start: number) {
  return Math.round((performance.now() - start) * 10) / 10;
}
function errorCode(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function syncLog(metrics: SyncMetrics, ok = true, error?: string) {
  console.log("financial_app_sync_metrics", JSON.stringify({ ...metrics, ok, error: error || undefined }));
}

async function requireAllowedUser(req: Request) {
  const auth = authorization(req);
  if (!auth) throw new HttpError(401, "unauthorized");

  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, authorization: auth },
    cache: "no-store",
  });
  if (!userRes.ok) throw new HttpError(401, "invalid_session");

  const user = await userRes.json();
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) throw new HttpError(401, "email_missing");

  const access = await fetch(
    `${url}/rest/v1/financial_app_access?select=email&email=eq.${encodeURIComponent(email)}&enabled=eq.true&limit=1`,
    { headers: { apikey: anon, authorization: auth, accept: "application/json" }, cache: "no-store" },
  );
  if (!access.ok) throw new HttpError(403, "authorization_check_failed");

  const rows = await access.json();
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(403, "forbidden");
  return email;
}

async function rpc(name: string, body: unknown) {
  const url = env("SUPABASE_URL");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: serviceHeaders({ "content-type": "application/json", accept: "application/json" }),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${name}_${response.status}${detail ? `_${detail.slice(0, 160)}` : ""}`);
  }
  return response.json();
}
async function sourceState() {
  return rpc("financial_app_source_state", {});
}
async function driveSyncState() {
  return rpc("financial_app_drive_sync_state", {});
}
async function applySnapshot(meta: any, rows: any[]) {
  const data = await rpc("financial_app_apply_source_snapshot", {
    p_source_file_id: meta.id,
    p_source_modified_at: meta.modifiedTime || null,
    p_rows: rows,
  });
  if (!data?.ok) throw new Error(String(data?.error || "snapshot_apply_failed"));
  return data;
}
async function applyDriveDocumentDelta(delta: DriveDelta) {
  const data = await rpc("financial_app_apply_drive_document_delta", {
    p_files: delta.files,
    p_removed_ids: delta.removedIds,
    p_next_token: delta.nextToken,
    p_full_scan: delta.mode === "full",
  });
  if (!data?.ok) throw new Error(String(data?.error || "drive_documents_apply_failed"));
  return data;
}
async function finalizeDocumentLinks() {
  return rpc("financial_app_finalize_document_links", {});
}

function b64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}
async function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp > now + 60) return tokenCache.token;

  const encoder = new TextEncoder();
  const header = b64(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64(encoder.encode(JSON.stringify({
    iss: GOOGLE_EMAIL,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(env("GOOGLE_PRIVATE_KEY")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = b64(new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${header}.${claims}`),
  )));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`google_auth_${response.status}`);

  const data = await response.json();
  if (!data?.access_token) throw new Error("google_auth_missing_token");
  tokenCache = { token: data.access_token, exp: now + Number(data.expires_in || 3600) };
  return data.access_token as string;
}

async function driveJson(token: string, url: string, stats?: DriveScanStats) {
  if (stats) stats.listRequests += 1;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) {
    if (response.status === 410) throw new DriveChangeTokenError("drive_change_token_expired");
    throw new Error(`drive_api_${response.status}`);
  }
  return response.json();
}
async function driveMeta(token: string) {
  return driveJson(
    token,
    `https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,mimeType,modifiedTime,size`,
  );
}
async function driveBytes(token: string, meta: any) {
  const native = String(meta?.mimeType || "") === "application/vnd.google-apps.spreadsheet";
  const url = native
    ? `https://www.googleapis.com/drive/v3/files/${FILE_ID}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`
    : `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`drive_download_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function driveChildren(token: string, folderId: string, stats: DriveScanStats) {
  const all: any[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,parents,trashed)",
      pageSize: "1000",
      spaces: "drive",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await driveJson(token, `https://www.googleapis.com/drive/v3/files?${params.toString()}`, stats);
    if (Array.isArray(data?.files)) {
      all.push(...data.files);
      stats.rawItems += data.files.length;
    }
    pageToken = String(data?.nextPageToken || "");
  } while (pageToken);
  return all;
}
async function driveFileMeta(token: string, fileId: string, stats: DriveScanStats) {
  return driveJson(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,trashed&supportsAllDrives=true`,
    stats,
  );
}
async function driveStartPageToken(token: string, stats: DriveScanStats) {
  const data = await driveJson(
    token,
    "https://www.googleapis.com/drive/v3/changes/startPageToken?supportsAllDrives=true",
    stats,
  );
  const pageToken = String(data?.startPageToken || "");
  if (!pageToken) throw new Error("drive_start_page_token_missing");
  return pageToken;
}

function supportedDriveDocument(file: any) {
  const mime = String(file?.mimeType || "");
  return mime === "application/pdf" || mime.startsWith("image/");
}
function parsedAmount(name: string) {
  const matches = [...name.matchAll(/(-?\d[\d. ]*(?:,\d{2}|\.\d{2}))\s*(?:€|EUR)/gi)];
  const raw = matches.at(-1)?.[1]?.replace(/\s/g, "") || "";
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
function folderMerchant(path: string[]) {
  const generic = new Set([
    "compras_y_facturas","compras","servicios y suministros","facturas","factura",
    "tickets","ticket","contratos","contrato","documentos",
  ]);
  for (const raw of [...path].reverse()) {
    const value = String(raw || "").trim();
    if (!value || /^20\d{2}$/.test(value) || generic.has(value.toLowerCase())) continue;
    const parts = value.split(/\s+-\s+/).filter(Boolean);
    return (parts.at(-1) || value).trim();
  }
  return null;
}
function parsedDriveDocument(file: any, path: string[]) {
  const name = String(file?.name || "").trim();
  const stem = name.replace(/\.[^.]+$/, " ").trim();
  const parts = stem.split(/\s+-\s+/).map((value) => value.trim()).filter(Boolean);
  const dateMatch = stem.match(/(?:^|\b)(20\d{2})-(\d{2})-(\d{2})(?:\b|\s)/);
  const documentDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;
  let merchant = parts.length > 1 ? parts[1] : null;
  if (!merchant || /^20\d{2}$/.test(merchant)) merchant = folderMerchant(path);
  const context = `${path.join(" ")} ${name}`.toLowerCase();
  const documentType = context.includes("contrato")
    ? "contract"
    : context.includes("ticket") || context.includes("recibo")
      ? "receipt"
      : context.includes("factura") || context.includes("invoice")
        ? "invoice"
        : context.includes("impuesto") || context.includes("tribut")
          ? "tax"
          : "other";
  return {
    id: String(file.id),
    name,
    mimeType: String(file.mimeType || ""),
    modifiedTime: String(file.modifiedTime || ""),
    size: file.size == null ? null : String(file.size),
    webViewLink: String(file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`),
    folderPath: path.join(" / "),
    documentType,
    documentDate,
    amount: parsedAmount(stem),
    merchant: merchant || null,
  };
}
async function drivePathForFile(token: string, file: any, stats: DriveScanStats) {
  const parents = Array.isArray(file?.parents) ? file.parents.map(String).filter(Boolean) : [];
  if (!parents.length) return null;

  const queue = parents.map((id: string) => ({ id, names: [] as string[], depth: 0 }));
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth > MAX_DRIVE_DEPTH) continue;
    if (current.id === DRIVE_DOCUMENTS_ROOT_ID) {
      return [DRIVE_DOCUMENTS_ROOT_NAME, ...current.names.reverse()];
    }
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const parent = await driveFileMeta(token, current.id, stats);
    if (parent?.trashed) continue;
    const names = [...current.names, String(parent?.name || "")].filter(Boolean);
    const nextParents = Array.isArray(parent?.parents) ? parent.parents.map(String).filter(Boolean) : [];
    for (const id of nextParents) queue.push({ id, names, depth: current.depth + 1 });
  }
  return null;
}
async function driveDocumentsFull(token: string, stats: DriveScanStats) {
  stats.mode = "full";
  const queue: [string, string[], number][] = [[DRIVE_DOCUMENTS_ROOT_ID, [DRIVE_DOCUMENTS_ROOT_NAME], 0]];
  const files: any[] = [];
  while (queue.length) {
    const [folderId, path, depth] = queue.shift()!;
    if (depth > MAX_DRIVE_DEPTH) throw new Error("drive_documents_depth_exceeded");
    stats.folders += 1;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    const children = await driveChildren(token, folderId, stats);
    for (const child of children) {
      if (String(child?.mimeType || "") === DRIVE_FOLDER_MIME) {
        queue.push([String(child.id), [...path, String(child.name || "")], depth + 1]);
        continue;
      }
      if (!supportedDriveDocument(child)) continue;
      files.push(parsedDriveDocument(child, path));
      stats.supportedDocuments += 1;
      if (files.length > MAX_DRIVE_DOCUMENTS) throw new Error("drive_documents_limit_exceeded");
    }
  }
  return files;
}
async function driveChanges(token: string, savedToken: string, stats: DriveScanStats) {
  stats.mode = "incremental";
  const files: any[] = [];
  const removedIds = new Set<string>();
  let pageToken = savedToken;
  let nextToken = "";
  let relevantFolderChanged = false;
  let ambiguousRemoval = false;

  do {
    const params = new URLSearchParams({
      pageToken,
      pageSize: "1000",
      spaces: "drive",
      includeRemoved: "true",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      fields: "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,size,webViewLink,parents,trashed))",
    });
    const data = await driveJson(token, `https://www.googleapis.com/drive/v3/changes?${params.toString()}`, stats);
    const changes = Array.isArray(data?.changes) ? data.changes : [];
    stats.rawItems += changes.length;

    for (const change of changes) {
      const fileId = String(change?.fileId || "");
      const file = change?.file;
      if (!fileId) continue;

      if (change?.removed || !file) {
        removedIds.add(fileId);
        ambiguousRemoval = true;
        stats.ambiguousRemovals += 1;
        continue;
      }

      if (file?.trashed) {
        removedIds.add(fileId);
        if (String(file.mimeType || "") === DRIVE_FOLDER_MIME) relevantFolderChanged = true;
        continue;
      }

      if (String(file.mimeType || "") === DRIVE_FOLDER_MIME) {
        if (fileId === DRIVE_DOCUMENTS_ROOT_ID) {
          relevantFolderChanged = true;
          continue;
        }
        const path = await drivePathForFile(token, file, stats);
        if (path) relevantFolderChanged = true;
        continue;
      }

      if (!supportedDriveDocument(file)) {
        removedIds.add(fileId);
        continue;
      }

      const path = await drivePathForFile(token, file, stats);
      if (!path) {
        removedIds.add(fileId);
        continue;
      }

      files.push(parsedDriveDocument(file, path));
      stats.supportedDocuments += 1;
      removedIds.delete(fileId);
      if (files.length > MAX_DRIVE_DOCUMENTS) throw new Error("drive_documents_limit_exceeded");
    }

    pageToken = String(data?.nextPageToken || "");
    if (!pageToken) nextToken = String(data?.newStartPageToken || "");
  } while (pageToken);

  if (!nextToken) throw new Error("drive_new_start_page_token_missing");
  stats.removedDocuments = removedIds.size;
  return { files, removedIds: [...removedIds], nextToken, relevantFolderChanged, ambiguousRemoval };
}
async function driveDocumentDelta(token: string, savedToken: string, stats: DriveScanStats): Promise<DriveDelta> {
  if (savedToken) {
    try {
      const incremental = await driveChanges(token, savedToken, stats);
      if (!incremental.relevantFolderChanged && !incremental.ambiguousRemoval) {
        return {
          mode: "incremental",
          files: incremental.files,
          removedIds: incremental.removedIds,
          nextToken: incremental.nextToken,
        };
      }
      stats.fallbackFullScan = true;
    } catch (error) {
      if (!(error instanceof DriveChangeTokenError)) throw error;
      stats.fallbackFullScan = true;
    }
  }

  const nextToken = await driveStartPageToken(token, stats);
  const files = await driveDocumentsFull(token, stats);
  stats.removedDocuments = 0;
  return { mode: "full", files, removedIds: [], nextToken };
}

function decodeXml(value: string) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function attr(source: string, name: string) {
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(source || "").match(new RegExp(`(?:^|\\s)${safe}=(?:"([^"]*)"|'([^']*)')`));
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
    for (const textMatch of match[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)) {
      value += decodeXml(textMatch[1]);
    }
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
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}
function workbookSheets(zip: Record<string, Uint8Array>) {
  const workbook = textFile(zip, "xl/workbook.xml");
  const rels = textFile(zip, "xl/_rels/workbook.xml.rels");
  const relMap = new Map<string, string>();
  for (const match of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/g)) {
    relMap.set(attr(match[1], "Id"), resolveTarget(attr(match[1], "Target")));
  }
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
  const numberValue = Number(raw);
  return raw !== "" && Number.isFinite(numberValue) ? numberValue : raw;
}
function text(value: unknown) {
  return String(value ?? "").trim();
}
function number(value: unknown) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}
function excelDate(value: unknown) {
  if (typeof value === "string") {
    const raw = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return new Date(Math.round((numeric - 25569) * 86400000)).toISOString().slice(0, 10);
}
function excelTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim())) {
    const parts = value.trim().split(":");
    return `${parts[0].padStart(2, "0")}:${parts[1]}:${(parts[2] || "00").padStart(2, "0")}`;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric < 1) {
    const total = Math.round(numeric * 86400) % 86400;
    return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  return null;
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function parseRows(bytes: Uint8Array) {
  const zip = unzipSync(bytes) as Record<string, Uint8Array>;
  const shared = sharedStrings(zip);
  const sheetList = workbookSheets(zip);
  const paths = new Map(sheetList.map((sheet) => [sheet.name, sheet.path]));
  const byId = new Map<string, any>();

  for (const sheetName of SHEETS) {
    const path = paths.get(sheetName);
    if (!path) throw new Error(`source_sheet_missing_${sheetName}`);
    const xml = textFile(zip, path);
    const rows: Record<string, unknown>[] = [];

    for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const values: Record<string, unknown> = {};
      for (const cellMatch of rowMatch[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const ref = attr(cellMatch[1], "r");
        const column = (ref.match(/^([A-Z]+)/) || [])[1];
        if (column) values[column] = cellValue(cellMatch[2] || "", cellMatch[1], shared);
      }
      rows.push(values);
    }

    const header = rows[0] || {};
    const actual = Array.from({ length: 22 }, (_, index) => text(header[String.fromCharCode(65 + index)] ?? ""));
    if (!HEADER.every((value, index) => actual[index] === value)) throw new Error(`source_schema_mismatch_${sheetName}`);

    for (const row of rows.slice(1)) {
      const cells = Array.from({ length: 22 }, (_, index) => row[String.fromCharCode(65 + index)] ?? "");
      const sourceId = text(cells[0]);
      if (!(sourceId || cells[1] || cells[10] || cells[13] !== "")) continue;
      if (!sourceId) throw new Error("source_id_missing");

      const payload = {
        "ID origen": sourceId,
        "Fecha": cells[1] ?? null,
        "Hora": cells[2] ?? null,
        "Producto o cuenta": text(cells[3]),
        "Entidad": text(cells[4]),
        "Identificador": text(cells[5]),
        "Tipo de producto": text(cells[6]),
        "Tipo de movimiento": text(cells[7]),
        "Categoría": text(cells[8]),
        "Subcategoría": text(cells[9]),
        "Concepto original": text(cells[10]),
        "Concepto normalizado": text(cells[11]),
        "Comercio o contraparte": text(cells[12]),
        "Importe (€)": number(cells[13]),
        "Saldo (€)": number(cells[14]),
        "Canal": text(cells[15]),
        "Cuenta de origen": text(cells[16]),
        "Cuenta de destino": text(cells[17]),
        "Conciliado": text(cells[18]),
        "Revisar": text(cells[19]),
        "Notas": text(cells[20]),
        "Fuente": text(cells[21]),
      };

      const item = {
        source_id: sourceId,
        source_hash: await sha256(JSON.stringify(payload)),
        source_payload: payload,
        source_date: excelDate(cells[1]),
        source_time: excelTime(cells[2]),
        source_account: payload["Producto o cuenta"],
        source_entity: payload["Entidad"],
        source_identifier: payload["Identificador"],
        source_product_type: payload["Tipo de producto"],
        source_transaction_type: payload["Tipo de movimiento"],
        source_category: payload["Categoría"],
        source_subcategory: payload["Subcategoría"],
        source_original_concept: payload["Concepto original"],
        source_normalized_concept: payload["Concepto normalizado"],
        source_counterparty: payload["Comercio o contraparte"],
        source_amount: payload["Importe (€)"],
        source_balance: payload["Saldo (€)"],
        source_channel: payload["Canal"],
        source_origin_account: payload["Cuenta de origen"] || null,
        source_destination_account: payload["Cuenta de destino"] || null,
        source_reconciled: payload["Conciliado"] || null,
        source_review: payload["Revisar"] || null,
        source_notes: payload["Notas"] || null,
        source_document_url: payload["Fuente"] || null,
      };

      const previous = byId.get(sourceId);
      if (previous) {
        const compatible = previous.source_date === item.source_date
          && previous.source_amount === item.source_amount
          && previous.source_identifier === item.source_identifier
          && previous.source_account === item.source_account;
        if (!compatible) throw new Error(`source_duplicate_id_conflict_${sourceId}`);
      }
      byId.set(sourceId, item);
    }
  }

  const items = [...byId.values()];
  if (!items.length) throw new Error("source_empty");
  return items;
}

Deno.serve(async (req: Request) => {
  const runId = crypto.randomUUID();
  const started = performance.now();
  const timings: Record<string, number> = {};
  const driveStats: DriveScanStats = {
    mode: "incremental",
    folders: 0,
    listRequests: 0,
    rawItems: 0,
    supportedDocuments: 0,
    maxDepth: 0,
    removedDocuments: 0,
    ambiguousRemovals: 0,
    fallbackFullScan: false,
  };
  let sourceChanged = false;
  let documentChanged = false;
  let autoLinked = 0;
  let autoLinkSkipped = false;

  try {
    if (req.method !== "GET" && req.method !== "POST") throw new HttpError(405, "method_not_allowed");

    let phase = performance.now();
    const email = await requireAllowedUser(req);
    timings.auth = ms(phase);

    phase = performance.now();
    const token = await googleToken();
    timings.googleAuth = ms(phase);

    phase = performance.now();
    const [meta, state, documentState] = await Promise.all([driveMeta(token), sourceState(), driveSyncState()]);
    timings.sourceLookup = ms(phase);
    if (meta.id !== FILE_ID || meta.name !== FILE_NAME) throw new Error("source_identity_mismatch");

    const sourceUnchanged = Boolean(
      state?.source_file_id === meta.id
      && state?.source_modified_at
      && Date.parse(state.source_modified_at) === Date.parse(meta.modifiedTime || ""),
    );
    sourceChanged = !sourceUnchanged;
    const reconciliationPending = !String(documentState?.changeToken || "");

    const documentScanPromise = (async () => {
      const start = performance.now();
      const delta = await driveDocumentDelta(token, String(documentState?.changeToken || ""), driveStats);
      timings.driveScan = ms(start);
      return delta;
    })();

    const rowsPromise = sourceUnchanged
      ? null
      : (async () => {
          let start = performance.now();
          const sourceBytes = await driveBytes(token, meta);
          timings.sourceDownload = ms(start);
          start = performance.now();
          const rows = await parseRows(sourceBytes);
          timings.sourceParse = ms(start);
          return rows;
        })();

    let documents: any = { ok: false, error: "drive_documents_not_checked" };
    try {
      const delta = await documentScanPromise;
      phase = performance.now();
      documents = await applyDriveDocumentDelta(delta);
      timings.documentsApply = ms(phase);
      documentChanged = Boolean(documents?.changed);
    } catch (documentError) {
      documents = { ok: false, error: "drive_documents_failed" };
      console.error("financial_app_drive_documents_error", JSON.stringify({ runId, error: errorCode(documentError) }));
    }

    let sync: any = null;
    let rowCount: number | undefined;
    if (rowsPromise) {
      const items = await rowsPromise;
      rowCount = items.length;
      phase = performance.now();
      sync = await applySnapshot(meta, items);
      timings.snapshotApply = ms(phase);
    }

    let autoLink: any = { linked: 0, skipped: true };
    const shouldFinalizeLinks = sourceChanged || documentChanged || reconciliationPending;
    if (shouldFinalizeLinks) {
      try {
        phase = performance.now();
        autoLink = await finalizeDocumentLinks();
        timings.autoLink = ms(phase);
        autoLinked = Number(autoLink?.linked || 0);
      } catch (linkError) {
        autoLink = { linked: 0, error: "auto_link_failed" };
        console.error("financial_app_document_links_error", JSON.stringify({ runId, error: errorCode(linkError) }));
      }
    } else {
      autoLinkSkipped = true;
    }
    documents = { ...documents, autoLink };

    const metrics: SyncMetrics = {
      runId,
      totalMs: ms(started),
      timings,
      drive: driveStats,
      sourceChanged,
      documentChanged,
      autoLinked,
      autoLinkSkipped,
    };
    syncLog(metrics, true);

    const changed = sourceChanged || documentChanged || autoLinked > 0;
    if (sourceUnchanged) {
      return json({
        ok: true,
        changed,
        skipped: true,
        source: { id: meta.id, name: meta.name, modifiedTime: meta.modifiedTime },
        documents,
        lastSync: state.finished_at,
        user: email,
        metrics,
      });
    }
    return json({
      ok: true,
      changed,
      source: {
        id: meta.id,
        name: meta.name,
        modifiedTime: meta.modifiedTime,
        rowCount,
        sheets: SHEETS,
      },
      sync,
      documents,
      user: email,
      metrics,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const metrics: SyncMetrics = {
      runId,
      totalMs: ms(started),
      timings,
      drive: driveStats,
      sourceChanged,
      documentChanged,
      autoLinked,
      autoLinkSkipped,
    };
    syncLog(metrics, false, errorCode(error));
    console.error("financial_app_sync_error", JSON.stringify({ runId, error: errorCode(error) }));
    return json({ ok: false, error: errorCode(error), runId }, status);
  }
});
