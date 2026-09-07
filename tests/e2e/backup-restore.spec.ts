import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const validator = resolve(process.cwd(), "scripts/validate-financial-backup.mjs");
const creator = resolve(process.cwd(), "scripts/create-financial-backup.mjs");

const requiredTables = [
  "schema_meta",
  "accounts",
  "account_source_mappings",
  "categories",
  "merchants",
  "merchant_aliases",
  "categorization_rules",
  "transaction_source_records",
  "transactions",
  "transaction_overrides",
  "transaction_duplicate_reviews",
  "budgets",
  "recurrences",
  "forecast_items",
  "documents",
  "document_transaction_associations",
  "sync_runs",
  "sync_issues",
  "sync_cursors",
  "audit_changes",
  "google_source_policy",
  "google_oauth_connections",
  "authorized_users",
];

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function makeBackup(options: { dataSuffix?: string; objectCount?: number; archive?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "financial-app-backup-"));
  const schema = requiredTables
    .map((table) => `CREATE TABLE financial_app.${table} (id text);`)
    .join("\n");
  const data = [
    "COPY financial_app.accounts (id) FROM stdin;",
    "account-1",
    "\\.",
    "COPY financial_app.transaction_source_records (id) FROM stdin;",
    "source-1",
    "\\.",
    "COPY financial_app.transactions (id) FROM stdin;",
    "transaction-1",
    "\\.",
    options.dataSuffix ?? "",
  ].join("\n");

  writeFileSync(join(dir, "schema.sql"), schema);
  writeFileSync(join(dir, "data.sql"), data);

  const storageArchive = options.archive ? "storage.tar" : null;
  if (storageArchive) writeFileSync(join(dir, storageArchive), "storage-bytes");

  const manifest = {
    contractVersion: 1,
    createdAt: "2026-09-07T10:00:00.000Z",
    sourceCommit: "a".repeat(40),
    appVersion: "0.0.1",
    targetVersion: "10.0.0",
    schemaVersion: 14,
    schema: "financial_app",
    bankSourcePolicy: "read_only",
    locale: "es-ES",
    currency: "EUR",
    timeZone: "Europe/Madrid",
    excludedSensitiveTableData: [
      "financial_app.google_oauth_connections",
      "financial_app.authorized_users",
    ],
    files: {
      schema: { file: "schema.sql", bytes: Buffer.byteLength(schema), sha256: sha256(schema) },
      data: { file: "data.sql", bytes: Buffer.byteLength(data), sha256: sha256(data) },
    },
    storage: {
      bucketCount: 1,
      objectCount: options.objectCount ?? 0,
      archive: storageArchive
        ? {
            file: storageArchive,
            bytes: Buffer.byteLength("storage-bytes"),
            sha256: sha256("storage-bytes"),
          }
        : null,
    },
    restoreRequires: [],
  };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return dir;
}

function run(script: string, args: string[] = [], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
}

test("F13 backup validator accepts a complete portable package", async () => {
  const dir = makeBackup();
  try {
    const result = run(validator, [dir]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "ok",
      contractVersion: 1,
      schemaVersion: 14,
      bankSourcePolicy: "read_only",
      storageObjects: 0,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F13 backup validator fails when a hashed file is altered", async () => {
  const dir = makeBackup();
  try {
    writeFileSync(join(dir, "data.sql"), `${readFileSync(join(dir, "data.sql"), "utf8")}\nTAMPERED\n`);
    const result = run(validator, [dir]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("backup_invalid_data_size");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F13 backup validator rejects sensitive table rows even with matching hashes", async () => {
  const dir = makeBackup({
    dataSuffix: "COPY financial_app.authorized_users (id) FROM stdin;\nuser-1\n\\.",
  });
  try {
    const result = run(validator, [dir]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("backup_invalid_sensitive_data_present");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F13 backup validator requires a separate Storage archive when objects exist", async () => {
  const dir = makeBackup({ objectCount: 1 });
  try {
    const result = run(validator, [dir]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("backup_invalid_storage_archive_required");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F13 backup validator verifies a declared Storage archive", async () => {
  const dir = makeBackup({ objectCount: 1, archive: true });
  try {
    const result = run(validator, [dir]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).storageObjects).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F13 backup creator fails closed before invoking Supabase when mandatory inputs are absent", async () => {
  const result = run(creator, [], {
    ...process.env,
    FINANCIAL_APP_DB_URL: "",
    FINANCIAL_APP_SOURCE_COMMIT: "",
    GITHUB_SHA: "",
    FINANCIAL_APP_SCHEMA_VERSION: "",
    FINANCIAL_APP_STORAGE_BUCKET_COUNT: "",
    FINANCIAL_APP_STORAGE_OBJECT_COUNT: "",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("FINANCIAL_APP_DB_URL is required");
});

test("F13 backup creator blocks a backup when Storage objects exist without an archive", async () => {
  const result = run(creator, [], {
    ...process.env,
    FINANCIAL_APP_DB_URL: "postgresql://example.invalid/postgres",
    FINANCIAL_APP_SOURCE_COMMIT: "b".repeat(40),
    FINANCIAL_APP_SCHEMA_VERSION: "14",
    FINANCIAL_APP_STORAGE_BUCKET_COUNT: "1",
    FINANCIAL_APP_STORAGE_OBJECT_COUNT: "1",
    FINANCIAL_APP_STORAGE_ARCHIVE: "",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("FINANCIAL_APP_STORAGE_ARCHIVE");
});
