import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  expectedStorageObjectSize,
  resolveStorageServerCredential,
} from "./supabase-storage-credential-v2.mjs";

const outputDir = resolve(process.argv[2] ?? "backups/storage-offsite-v2");
const dbUrl = process.env.FINANCIAL_APP_DB_URL ?? "";
const projectRef = process.env.FINANCIAL_APP_SUPABASE_PROJECT_REF ?? "btzukbfesxdratqnxuoj";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const serverCredential = resolveStorageServerCredential({ secretKey, serviceRoleKey });

function fail(message) {
  throw new Error(message);
}

function queryJson(sql) {
  if (!dbUrl) fail("FINANCIAL_APP_DB_URL is required.");
  const raw = execFileSync("psql", [
    "-X", "-A", "-t", dbUrl,
    "--command", sql,
  ], {
    encoding: "utf8",
    env: { ...process.env, PGSSLMODE: "require" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  try {
    return JSON.parse(raw || "null");
  } catch {
    fail("Could not parse Storage inventory returned by PostgreSQL.");
  }
}

function encodedObjectPath(value) {
  return String(value).split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function authHeaders(isPublic) {
  if (isPublic) return {};
  if (!serverCredential) {
    fail("Private Supabase Storage objects require SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in CI secrets.");
  }
  return serverCredential.headers;
}

async function downloadObject(object, bucket) {
  const endpoint = bucket.public ? "public" : "authenticated";
  const url = `https://${projectRef}.supabase.co/storage/v1/object/${endpoint}/${encodeURIComponent(object.bucketId)}/${encodedObjectPath(object.name)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: authHeaders(bucket.public),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    fail(`Storage object download failed with HTTP ${response.status}; object names are intentionally not logged.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

const inventory = queryJson(`
  select pg_catalog.json_build_object(
    'buckets', coalesce((
      select pg_catalog.json_agg(pg_catalog.json_build_object(
        'id', b.id,
        'public', b.public
      ) order by b.id)
      from storage.buckets b
    ), '[]'::json),
    'objects', coalesce((
      select pg_catalog.json_agg(pg_catalog.json_build_object(
        'id', o.id,
        'bucketId', o.bucket_id,
        'name', o.name,
        'metadata', o.metadata
      ) order by o.bucket_id, o.name, o.id)
      from storage.objects o
    ), '[]'::json)
  )::text
`);

if (!Array.isArray(inventory?.buckets) || !Array.isArray(inventory?.objects)) {
  fail("Storage inventory has an invalid shape.");
}

const buckets = new Map(inventory.buckets.map((bucket) => [String(bucket.id), bucket]));
const privateObjects = inventory.objects.filter((object) => !buckets.get(String(object.bucketId))?.public).length;
if (privateObjects > 0 && !serverCredential) {
  fail(`Storage archive requires a server key because ${privateObjects} object(s) are private.`);
}

mkdirSync(resolve(outputDir, "objects"), { recursive: true });
const manifestObjects = [];
let totalBytes = 0;

for (let index = 0; index < inventory.objects.length; index += 1) {
  const object = inventory.objects[index];
  const bucket = buckets.get(String(object.bucketId));
  if (!bucket) fail("Storage object references an unknown bucket.");
  const bytes = await downloadObject(object, bucket);
  const metadataSize = expectedStorageObjectSize(object?.metadata);
  if (metadataSize !== null && bytes.byteLength !== metadataSize) {
    fail(`Storage object size mismatch: expected ${metadataSize}, received ${bytes.byteLength}; object name withheld.`);
  }
  const id = String(object.id ?? "");
  if (!/^[0-9a-f-]{16,}$/i.test(id)) fail("Storage object has an invalid stable id.");
  const relativeFile = `objects/${id}.bin`;
  writeFileSync(resolve(outputDir, relativeFile), bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  totalBytes += bytes.byteLength;
  manifestObjects.push({
    id,
    bucketId: String(object.bucketId),
    name: String(object.name),
    public: bucket.public === true,
    file: relativeFile,
    bytes: bytes.byteLength,
    sha256,
  });
}

const manifest = {
  contractVersion: 2,
  createdAt: new Date().toISOString(),
  projectRef,
  bucketCount: inventory.buckets.length,
  objectCount: manifestObjects.length,
  totalBytes,
  objects: manifestObjects,
};
writeFileSync(resolve(outputDir, "storage-archive-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: "storage_archive_created",
  bucketCount: manifest.bucketCount,
  objectCount: manifest.objectCount,
  privateObjectCount: privateObjects,
  totalBytes,
}));
