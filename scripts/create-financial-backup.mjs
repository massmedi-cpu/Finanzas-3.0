import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outputDir = resolve(process.argv[2] ?? "backups/financial-app");
const dbUrl = process.env.FINANCIAL_APP_DB_URL ?? "";
const sourceCommit = process.env.FINANCIAL_APP_SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? "";
const schemaVersion = Number(process.env.FINANCIAL_APP_SCHEMA_VERSION ?? "");
const bucketCount = Number(process.env.FINANCIAL_APP_STORAGE_BUCKET_COUNT ?? "");
const objectCount = Number(process.env.FINANCIAL_APP_STORAGE_OBJECT_COUNT ?? "");
const storageArchivePath = process.env.FINANCIAL_APP_STORAGE_ARCHIVE
  ? resolve(process.env.FINANCIAL_APP_STORAGE_ARCHIVE)
  : null;

let stagingDir = null;

function fail(message) {
  throw new Error(message);
}

function sanitize(value) {
  const text = String(value ?? "");
  return dbUrl ? text.split(dbUrl).join("[REDACTED_DB_URL]") : text;
}

function runSupabase(args) {
  const result = spawnSync("supabase", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = sanitize(result.stderr || result.stdout || `exit_${result.status}`);
    fail(`Supabase CLI dump failed: ${detail.trim()}`);
  }
}

function fileEvidence(path) {
  const bytes = readFileSync(path);
  return {
    file: basename(path),
    bytes: statSync(path).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

try {
  if (!dbUrl) fail("FINANCIAL_APP_DB_URL is required and must never be committed.");
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) fail("FINANCIAL_APP_SOURCE_COMMIT must be an exact 40-character Git SHA.");
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) fail("FINANCIAL_APP_SCHEMA_VERSION must be a positive integer.");
  if (!Number.isInteger(bucketCount) || bucketCount < 0) fail("FINANCIAL_APP_STORAGE_BUCKET_COUNT must be a non-negative integer.");
  if (!Number.isInteger(objectCount) || objectCount < 0) fail("FINANCIAL_APP_STORAGE_OBJECT_COUNT must be a non-negative integer.");
  if (objectCount > 0 && (!storageArchivePath || !existsSync(storageArchivePath))) {
    fail("Supabase Storage contains objects, so FINANCIAL_APP_STORAGE_ARCHIVE must point to a verified off-site archive.");
  }
  if (existsSync(outputDir)) {
    fail("Output directory already exists; use a new destination so a previously verified backup is never overwritten.");
  }

  const parentDir = dirname(outputDir);
  mkdirSync(parentDir, { recursive: true });
  stagingDir = mkdtempSync(resolve(parentDir, `.${basename(outputDir)}.staging-`));

  const schemaFile = resolve(stagingDir, "schema.sql");
  const dataFile = resolve(stagingDir, "data.sql");

  runSupabase([
    "db", "dump",
    "--db-url", dbUrl,
    "-f", schemaFile,
    "--schema", "financial_app",
  ]);

  runSupabase([
    "db", "dump",
    "--db-url", dbUrl,
    "-f", dataFile,
    "--use-copy",
    "--data-only",
    "--schema", "financial_app",
    "-x", "financial_app.google_oauth_connections",
    "-x", "financial_app.authorized_users",
  ]);

  let storageArchive = null;
  if (objectCount > 0 && storageArchivePath) {
    const archiveName = basename(storageArchivePath);
    if (["schema.sql", "data.sql", "manifest.json"].includes(archiveName)) {
      fail("FINANCIAL_APP_STORAGE_ARCHIVE filename conflicts with a reserved backup filename.");
    }
    const bundledArchivePath = resolve(stagingDir, archiveName);
    copyFileSync(storageArchivePath, bundledArchivePath);
    storageArchive = fileEvidence(bundledArchivePath);
  }

  const manifest = {
    contractVersion: 1,
    createdAt: new Date().toISOString(),
    sourceCommit,
    appVersion: "0.0.1",
    targetVersion: "10.0.0",
    schemaVersion,
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
      schema: fileEvidence(schemaFile),
      data: fileEvidence(dataFile),
    },
    storage: {
      bucketCount,
      objectCount,
      archive: storageArchive,
    },
    restoreRequires: [
      "reprovision authorized user allowlist",
      "reprovision Google/Vault authorization",
      "reprovision Vercel and Supabase secrets",
      "deploy versioned Edge Functions from the exact source commit",
      "restore Supabase Storage objects separately when objectCount is greater than zero",
    ],
  };

  writeFileSync(resolve(stagingDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  renameSync(stagingDir, outputDir);
  stagingDir = null;
  console.log(`backup_created: ${outputDir}`);
} catch (error) {
  if (stagingDir) rmSync(stagingDir, { recursive: true, force: true });
  const message = error instanceof Error ? error.message : String(error);
  console.error(`backup_failed: ${sanitize(message)}`);
  process.exit(1);
}
