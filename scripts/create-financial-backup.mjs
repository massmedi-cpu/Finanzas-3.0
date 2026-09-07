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
let connection = null;

function fail(message) {
  throw new Error(message);
}

function decodeUrlComponent(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail(`FINANCIAL_APP_DB_URL contains an invalid encoded ${label}.`);
  }
}

function parseConnection() {
  let url;
  try {
    url = new URL(dbUrl);
  } catch {
    fail("FINANCIAL_APP_DB_URL must be a valid PostgreSQL URI.");
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    fail("FINANCIAL_APP_DB_URL must use the postgres/postgresql protocol.");
  }

  const host = url.hostname;
  const port = url.port || "5432";
  const user = decodeUrlComponent(url.username, "username");
  const password = decodeUrlComponent(url.password, "password");
  const database = decodeUrlComponent(url.pathname.replace(/^\/+/, ""), "database name");
  const sslmode = url.searchParams.get("sslmode") || "";

  if (!host) fail("FINANCIAL_APP_DB_URL must include a database host.");
  if (!/^\d+$/.test(port)) fail("FINANCIAL_APP_DB_URL must include a valid database port.");
  if (!user) fail("FINANCIAL_APP_DB_URL must include a database username.");
  if (!password) fail("FINANCIAL_APP_DB_URL must include a database password.");
  if (!database) fail("FINANCIAL_APP_DB_URL must include a database name.");

  return { host, port, user, password, database, sslmode };
}

function sanitize(value) {
  let text = String(value ?? "");
  if (dbUrl) text = text.split(dbUrl).join("[REDACTED_DB_URL]");
  if (connection?.password) text = text.split(connection.password).join("[REDACTED_DB_PASSWORD]");
  try {
    const encodedPassword = new URL(dbUrl).password;
    if (encodedPassword) text = text.split(encodedPassword).join("[REDACTED_DB_PASSWORD]");
  } catch {
    // Connection validation reports malformed input separately.
  }
  return text;
}

function runPgDump(args) {
  const env = {
    ...process.env,
    PGPASSWORD: connection.password,
  };
  if (connection.sslmode) env.PGSSLMODE = connection.sslmode;
  else delete env.PGSSLMODE;

  const result = spawnSync(
    "pg_dump",
    [
      "--host", connection.host,
      "--port", connection.port,
      "--username", connection.user,
      "--dbname", connection.database,
      "--no-password",
      ...args,
    ],
    {
      encoding: "utf8",
      shell: false,
      env,
    },
  );
  if (result.status !== 0) {
    const detail = sanitize(result.stderr || result.stdout || `exit_${result.status}`);
    fail(`pg_dump failed: ${detail.trim()}`);
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
  connection = parseConnection();
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

  runPgDump([
    "--schema", "financial_app",
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--file", schemaFile,
  ]);

  runPgDump([
    "--schema", "financial_app",
    "--data-only",
    "--no-owner",
    "--no-privileges",
    "--exclude-table-data", "financial_app.google_oauth_connections",
    "--exclude-table-data", "financial_app.authorized_users",
    "--file", dataFile,
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
