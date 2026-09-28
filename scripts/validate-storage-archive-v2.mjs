import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "");
const manifestPath = resolve(root, "storage-archive-manifest.json");

function fail(message) {
  throw new Error(message);
}

if (!existsSync(manifestPath)) fail("Storage archive manifest is missing.");
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  fail("Storage archive manifest is invalid JSON.");
}

if (manifest?.contractVersion !== 2) fail("Storage archive contractVersion must be 2.");
if (!Array.isArray(manifest?.objects)) fail("Storage archive objects must be an array.");
if (manifest.objectCount !== manifest.objects.length) fail("Storage archive objectCount does not match manifest objects.");
if (!Number.isInteger(manifest.bucketCount) || manifest.bucketCount < 0) fail("Storage archive bucketCount is invalid.");

const ids = new Set();
let totalBytes = 0;
for (const object of manifest.objects) {
  if (typeof object?.id !== "string" || ids.has(object.id)) fail("Storage archive contains an invalid or duplicate object id.");
  ids.add(object.id);
  if (typeof object?.bucketId !== "string" || typeof object?.name !== "string") fail("Storage archive object identity is invalid.");
  if (typeof object?.file !== "string" || !object.file.startsWith("objects/") || object.file.includes("..")) {
    fail("Storage archive contains an unsafe object file path.");
  }
  const filePath = resolve(root, object.file);
  const withinRoot = relative(root, filePath);
  if (withinRoot.startsWith("..") || withinRoot.includes("../")) fail("Storage archive object escapes the archive root.");
  if (!existsSync(filePath)) fail("Storage archive object file is missing.");
  const bytes = statSync(filePath).size;
  if (bytes !== object.bytes) fail("Storage archive object byte count does not match its manifest entry.");
  const sha256 = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  if (sha256 !== object.sha256) fail("Storage archive object hash does not match its manifest entry.");
  totalBytes += bytes;
}

if (totalBytes !== manifest.totalBytes) fail("Storage archive totalBytes does not match recovered objects.");

console.log(JSON.stringify({
  status: "storage_archive_validated",
  bucketCount: manifest.bucketCount,
  objectCount: manifest.objectCount,
  totalBytes,
}));
