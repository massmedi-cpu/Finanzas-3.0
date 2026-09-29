import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { verifyStorageBackupConsistency } from "../../scripts/verify-storage-backup-consistency-v2.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const contents = Buffer.from("private financial document");
const inventory = {
  buckets: [{ id: "documents", public: false }],
  objects: [{ id, bucketId: "documents", name: "private/document.pdf", metadata: { size: contents.length } }],
};

function archiveFor(manifest) {
  const root = mkdtempSync(join(tmpdir(), "financial-storage-contract-"));
  const archiveRoot = join(root, "storage-contract");
  mkdirSync(join(archiveRoot, "objects"), { recursive: true });
  writeFileSync(join(archiveRoot, "objects", `${id}.bin`), contents);
  writeFileSync(join(archiveRoot, "storage-archive-manifest.json"), JSON.stringify(manifest));
  const archive = join(root, "storage.tgz");
  execFileSync("tar", ["-czf", archive, "-C", root, "storage-contract"]);
  return { root, archive };
}

function manifest() {
  return {
    contractVersion: 2,
    bucketCount: 1,
    objectCount: 1,
    totalBytes: contents.length,
    objects: [{
      id,
      bucketId: "documents",
      name: "private/document.pdf",
      public: false,
      file: `objects/${id}.bin`,
      bytes: contents.length,
      sha256: createHash("sha256").update(contents).digest("hex"),
    }],
  };
}

test("backup v2 coteja la identidad de cada objeto privado con el inventario", () => {
  const { root, archive } = archiveFor(manifest());
  try {
    assert.deepEqual(verifyStorageBackupConsistency(inventory, archive), { bucketCount: 1, objectCount: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("backup v2 rechaza un archivo íntegro pero con otro objeto o tamaño", () => {
  for (const change of [
    (value) => { value.objects[0].name = "private/other.pdf"; },
    (value) => { value.objects[0].bytes -= 1; },
    (value) => { value.objects[0].public = true; },
  ]) {
    const value = manifest();
    change(value);
    const { root, archive } = archiveFor(value);
    try {
      assert.throws(() => verifyStorageBackupConsistency(inventory, archive), /storage_backup_inconsistent_/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
