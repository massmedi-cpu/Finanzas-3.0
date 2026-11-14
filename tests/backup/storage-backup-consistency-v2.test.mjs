import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  if (manifest.objects.length > 0) writeFileSync(join(archiveRoot, "objects", `${id}.bin`), contents);
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

// Exercise the actual backup CLI, not only the consistency helper. In particular,
// an empty inventory must not bypass validation of an explicitly bundled archive.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaTables = [
  "schema_meta", "accounts", "account_source_mappings", "categories", "merchants",
  "merchant_aliases", "categorization_rules", "transaction_source_records", "transactions",
  "transaction_overrides", "transaction_duplicate_reviews", "budgets", "recurrences",
  "forecast_items", "documents", "document_transaction_associations", "sync_runs",
  "sync_issues", "sync_cursors", "audit_changes", "google_source_policy",
  "google_oauth_connections", "authorized_users",
];

function backupFor(root, value, archive) {
  const backup = join(root, "backup");
  mkdirSync(backup);
  function evidence(file, bytes) {
    writeFileSync(join(backup, file), bytes);
    return { file, bytes: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  const schema = "CREATE SCHEMA financial_app;\n"
    + schemaTables.map((table) => `CREATE TABLE financial_app.${table} (id text);`).join("\n");
  const data = [
    "ALTER TABLE financial_app.accounts DISABLE TRIGGER ALL;",
    ...["accounts", "transaction_source_records", "transactions"].map((table) =>
      `COPY financial_app.${table} (id) FROM stdin;\n\\.\n`),
    "ALTER TABLE financial_app.accounts ENABLE TRIGGER ALL;",
  ].join("\n");
  const valueManifest = {
    contractVersion: 2,
    schema: "financial_app",
    schemaVersion: 1,
    appVersion: "10.0.103",
    bankSourcePolicy: "read_only",
    locale: "es-ES",
    currency: "EUR",
    timeZone: "Europe/Madrid",
    sourceCommit: "1".repeat(40),
    capabilities: { workspaceTenancy: false, deletionRuntime: false, deletionIntent: false },
    restoreSafety: {
      workspaceMembershipsRequireReprovisioning: true,
      deletionIntentsAreNotRestored: true,
      deletionRuntimePolicyIsNotRestored: true,
      deletionMustBeReapprovedAfterRestore: true,
      dataTriggersDisabledDuringRestore: true,
    },
    excludedSensitiveOrRuntimeControlTableData: [
      "google_oauth_connections", "authorized_users", "workspace_memberships",
      "workspace_deletion_intents", "workspace_deletion_runtime_policy",
    ].map((table) => `financial_app.${table}`),
    files: {
      schema: evidence("schema.sql", schema),
      data: evidence("data.sql", data),
      storageInventory: evidence("storage-inventory.json", JSON.stringify(value)),
    },
    storage: {
      bucketCount: value.buckets.length,
      objectCount: value.objects.length,
      archive: archive ? evidence("storage.tgz", readFileSync(archive)) : null,
    },
  };
  writeFileSync(join(backup, "manifest.json"), JSON.stringify(valueManifest));
  return spawnSync(process.execPath, [join(repo, "scripts/validate-financial-backup-v2.mjs"), backup], {
    encoding: "utf8",
  });
}

test("CLI acepta inventario vacío sin archivo y con archivo vacío coherente", () => {
  for (const bucketCount of [0, 1]) {
    for (const bundled of [false, true]) {
      const { root, archive } = archiveFor({
        contractVersion: 2, bucketCount, objectCount: 0, totalBytes: 0, objects: [],
      });
      try {
        const value = { buckets: bucketCount ? inventory.buckets : [], objects: [] };
        const result = backupFor(root, value, bundled ? archive : null);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).status, "ok");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

test("CLI rechaza archivo obsoleto aunque el inventario de Storage esté vacío", () => {
  const { root, archive } = archiveFor(manifest());
  try {
    const result = backupFor(root, { buckets: inventory.buckets, objects: [] }, archive);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /backup_v2_invalid_storage_inventory_archive_mismatch: storage_backup_inconsistent_object_or_bucket_count/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI rechaza archivo vacío con otros buckets o sin manifiesto válido", () => {
  for (const invalid of ["bucket_count", "unreadable", "contract_version"]) {
    const value = { contractVersion: 2, bucketCount: 1, objectCount: 0, totalBytes: 0, objects: [] };
    if (invalid === "contract_version") value.contractVersion = 1;
    const { root, archive } = archiveFor(value);
    try {
      if (invalid === "unreadable") writeFileSync(archive, "not a tar archive");
      const result = backupFor(root, { buckets: [], objects: [] }, archive);
      assert.equal(result.status, 1, `${invalid}: ${result.stdout}`);
      assert.match(result.stderr, /backup_v2_invalid_storage_inventory_archive_mismatch/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("CLI conserva el contrato no vacío: exige archivo y acepta identidad completa", () => {
  for (const bundled of [false, true]) {
    const { root, archive } = archiveFor(manifest());
    try {
      const result = backupFor(root, inventory, bundled ? archive : null);
      assert.equal(result.status, bundled ? 0 : 1, result.stderr || result.stdout);
      if (!bundled) assert.match(result.stderr, /backup_v2_invalid_storage_archive_required/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
