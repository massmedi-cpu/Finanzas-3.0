const BUCKET = "financial-app-documents";
const WORKSPACE_A = "fa100000-0000-4000-8000-000000000001";
const WORKSPACE_B = "fb200000-0000-4000-8000-000000000002";
const MAX_REMOVE_BATCH = 1000;

const baseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceRoleKey) {
  throw new Error("PRE020G_LOCAL_STORAGE_ENV_REQUIRED");
}

const parsedBaseUrl = new URL(baseUrl);
if (!["127.0.0.1", "localhost"].includes(parsedBaseUrl.hostname)) {
  throw new Error(`PRE020G_NON_LOCAL_STORAGE_FORBIDDEN:${parsedBaseUrl.hostname}`);
}

const storageUrl = `${baseUrl.replace(/\/$/, "")}/storage/v1`;
const authHeaders = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
};

function encodePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function request(path, options = {}) {
  const response = await fetch(`${storageUrl}${path}`, options);
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    throw new Error(
      `PRE020G_STORAGE_API_FAILED:${options.method ?? "GET"}:${path}:${response.status}:${typeof payload === "string" ? payload : JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function createBucket() {
  return request("/bucket", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
}

async function upload(path, marker) {
  return request(`/object/${encodePath(`${BUCKET}/${path}`)}`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "image/png",
      "cache-control": "max-age=60",
      "x-upsert": "false",
    },
    body: Buffer.from(`PRE020G:${marker}`, "utf8"),
  });
}

async function listPrefix(prefix) {
  const payload = await request(`/object/list/${encodeURIComponent(BUCKET)}`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      prefix,
      limit: MAX_REMOVE_BATCH,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    }),
  });
  if (!Array.isArray(payload)) {
    throw new Error("PRE020G_STORAGE_LIST_INVALID_PAYLOAD");
  }
  return payload.filter((item) => item && item.id && typeof item.name === "string");
}

function managedPrefix(workspaceId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    throw new Error("PRE020G_WORKSPACE_ID_INVALID");
  }
  return `uploads/${workspaceId}`;
}

function assertManagedPath(path, workspaceId) {
  const prefix = `${managedPrefix(workspaceId)}/`;
  if (!path.startsWith(prefix)) {
    throw new Error(`PRE020G_STORAGE_SCOPE_VIOLATION:${path}`);
  }
}

function chunks(values, size = MAX_REMOVE_BATCH) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_REMOVE_BATCH) {
    throw new Error("PRE020G_REMOVE_BATCH_INVALID");
  }
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function removePaths(paths) {
  if (paths.length === 0) return;
  if (paths.length > MAX_REMOVE_BATCH) {
    throw new Error(`PRE020G_REMOVE_BATCH_TOO_LARGE:${paths.length}`);
  }
  await request(`/object/${encodeURIComponent(BUCKET)}`, {
    method: "DELETE",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
}

async function cleanupWorkspace(workspaceId) {
  const prefix = managedPrefix(workspaceId);
  let removed = 0;
  let passes = 0;

  while (true) {
    passes += 1;
    if (passes > 1000) throw new Error("PRE020G_STORAGE_CLEANUP_PASS_LIMIT");

    const entries = await listPrefix(prefix);
    if (entries.length === 0) return { removed, passes };

    const paths = entries.map((entry) => `${prefix}/${entry.name}`);
    for (const path of paths) assertManagedPath(path, workspaceId);
    for (const batch of chunks(paths)) {
      await removePaths(batch);
      removed += batch.length;
    }
  }
}

await createBucket();

const pathsA = [
  `uploads/${WORKSPACE_A}/10000000-0000-4000-8000-000000000001.png`,
  `uploads/${WORKSPACE_A}/10000000-0000-4000-8000-000000000002.png`,
  `uploads/${WORKSPACE_A}/10000000-0000-4000-8000-000000000003.png`,
];
const pathsB = [
  `uploads/${WORKSPACE_B}/20000000-0000-4000-8000-000000000001.png`,
  `uploads/${WORKSPACE_B}/20000000-0000-4000-8000-000000000002.png`,
];
const guardPrefix = "guard/not-a-workspace";
const guardPath = `${guardPrefix}/30000000-0000-4000-8000-000000000001.png`;

for (const [index, path] of [...pathsA, ...pathsB, guardPath].entries()) {
  await upload(path, String(index + 1));
}

const beforeA = await listPrefix(managedPrefix(WORKSPACE_A));
const beforeB = await listPrefix(managedPrefix(WORKSPACE_B));
const beforeGuard = await listPrefix(guardPrefix);
if (beforeA.length !== pathsA.length || beforeB.length !== pathsB.length || beforeGuard.length !== 1) {
  throw new Error(
    `PRE020G_STORAGE_FIXTURE_INVALID:A=${beforeA.length}:B=${beforeB.length}:guard=${beforeGuard.length}`,
  );
}

// Validate batching logic beyond the Storage API remove() ceiling without generating 1001 real objects.
const synthetic = Array.from({ length: 1001 }, (_, index) => `uploads/${WORKSPACE_A}/${index}.png`);
const syntheticBatches = chunks(synthetic);
if (syntheticBatches.length !== 2 || syntheticBatches[0].length !== 1000 || syntheticBatches[1].length !== 1) {
  throw new Error("PRE020G_STORAGE_BATCHING_CONTRACT_INVALID");
}

const firstCleanup = await cleanupWorkspace(WORKSPACE_A);
if (firstCleanup.removed !== pathsA.length) {
  throw new Error(`PRE020G_STORAGE_REMOVED_COUNT_INVALID:${firstCleanup.removed}`);
}

const afterA = await listPrefix(managedPrefix(WORKSPACE_A));
const afterB = await listPrefix(managedPrefix(WORKSPACE_B));
const afterGuard = await listPrefix(guardPrefix);
if (afterA.length !== 0) throw new Error(`PRE020G_STORAGE_RESIDUE_A:${afterA.length}`);
if (afterB.length !== pathsB.length) throw new Error(`PRE020G_STORAGE_CROSS_TENANT_DAMAGE:${afterB.length}`);
if (afterGuard.length !== 1) throw new Error(`PRE020G_STORAGE_GUARD_DAMAGE:${afterGuard.length}`);

const retryCleanup = await cleanupWorkspace(WORKSPACE_A);
if (retryCleanup.removed !== 0) {
  throw new Error(`PRE020G_STORAGE_RETRY_NOT_IDEMPOTENT:${retryCleanup.removed}`);
}

const finalB = await listPrefix(managedPrefix(WORKSPACE_B));
const finalGuard = await listPrefix(guardPrefix);
if (finalB.length !== pathsB.length || finalGuard.length !== 1) {
  throw new Error("PRE020G_STORAGE_NON_TARGET_CHANGED_AFTER_RETRY");
}

console.log(
  `PRE020_STORAGE_RUNTIME_REHEARSAL_OK|bucket=${BUCKET}|workspace_a_removed=${firstCleanup.removed}|retry_removed=${retryCleanup.removed}|workspace_b_preserved=${finalB.length}|guard_preserved=${finalGuard.length}|batch_limit=${MAX_REMOVE_BATCH}|transport=storage_api|target=local_only`,
);
