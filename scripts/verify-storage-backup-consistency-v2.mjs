import { execFileSync } from "node:child_process";

function fail(reason) {
  throw new Error(`storage_backup_inconsistent_${reason}`);
}

function tarOutput(args) {
  try {
    return execFileSync("tar", args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    fail("archive_unreadable");
  }
}

function archivedManifest(archivePath) {
  const entries = tarOutput(["-tzf", archivePath]).trim().split("\n");
  const matches = entries.filter((entry) => /^[^/.][^/]*\/storage-archive-manifest\.json$/.test(entry));
  if (matches.length !== 1) fail("archive_manifest_missing_or_ambiguous");
  try {
    return JSON.parse(tarOutput(["-xOzf", archivePath, matches[0]]));
  } catch (error) {
    if (error instanceof SyntaxError) fail("archive_manifest_invalid");
    throw error;
  }
}

export function verifyStorageBackupConsistency(inventory, archivePath) {
  if (!Array.isArray(inventory?.buckets) || !Array.isArray(inventory?.objects)) {
    fail("inventory_invalid");
  }
  const archive = archivedManifest(archivePath);
  if (archive?.contractVersion !== 2 || !Array.isArray(archive.objects)) {
    fail("archive_manifest_invalid");
  }
  if (archive.bucketCount !== inventory.buckets.length
    || archive.objectCount !== inventory.objects.length
    || archive.objects.length !== inventory.objects.length) {
    fail("object_or_bucket_count");
  }

  const buckets = new Map();
  for (const bucket of inventory.buckets) {
    if (typeof bucket?.id !== "string" || buckets.has(bucket.id) || typeof bucket.public !== "boolean") {
      fail("bucket_identity");
    }
    buckets.set(bucket.id, bucket);
  }

  const archivedObjects = new Map();
  for (const object of archive.objects) {
    if (typeof object?.id !== "string" || archivedObjects.has(object.id)) fail("archive_object_identity");
    archivedObjects.set(object.id, object);
  }

  const seen = new Set();
  for (const object of inventory.objects) {
    const id = String(object?.id ?? "");
    const bucket = buckets.get(object?.bucketId);
    const saved = archivedObjects.get(id);
    if (!id || seen.has(id) || !bucket || !saved
      || saved.bucketId !== object.bucketId
      || saved.name !== object.name
      || saved.public !== bucket.public) {
      fail("object_identity");
    }
    seen.add(id);
    const recordedSize = object?.metadata?.size;
    if (recordedSize !== null && recordedSize !== undefined) {
      const size = Number(recordedSize);
      if (!Number.isSafeInteger(size) || size < 0 || saved.bytes !== size) fail("object_size");
    }
  }

  return { bucketCount: buckets.size, objectCount: seen.size };
}
