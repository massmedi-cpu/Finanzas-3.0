import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
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

function fail(message) {
  console.error(`backup_failed: ${message}`);
  process.exit(1);
}

if (!dbUrl) fail("FINANCIAL_APP_DB_URL is required and must never be committed.");
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) fail("FINANCIAL_APP_SOURCE_COMMIT must be an exact 40-character Git SHA.");
if (!Number.isInteger(schemaVersion) || schemaVersion < 1) fail("FINANCIAL_APP_SCHEMA_VERSION must be a positive integer.");
if (!Number.isInteger(bucketCount) || bucketCount < 0) fail("FINANCIAL_APP_STORAGE_BUCKET_COUNT must be a non-negative integer.");
if (!Number.isInteger(objectCount) || objectCount < 0) fail("FINANCIAL_APP_STORAGE_OBJECT_COUNT must be a non-negative integer.");
if (objectCount > 0 && (!storageArchivePath || !existsSync(storageArchivePath))) {
  fail("Supabase Storage contains objects, so FINANCIAL_APP_STORAGE_ARCHIVE must point to a verified off-site archive.");
}

mkdirSync(outputDir, { recursive: true });

const schemaFile = resolve(outputDir, "schema.sql");
const dataFile = resolve(outputDir, "data.sql");

function sanitize(value) {
  return String(value ?? "").split(dbUrl).join("[REDACTED_DB_URL]");
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

function fileEvidence(path) {
  const bytes = readFileSync(path);
  return {
    file: basename(path),
    bytes: statSync(path).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const storageArchive = objectCount > 0 && storageArchivePath
  ? fileEvidence(storageArchivePath)
  : null;

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

writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`backup_created: ${outputDir}`);
