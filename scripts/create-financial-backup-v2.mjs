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

const outputDir = resolve(process.argv[2] ?? "backups/financial-app-v2");
const dbUrl = process.env.FINANCIAL_APP_DB_URL ?? "";
const sourceCommit = process.env.FINANCIAL_APP_SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? "";
const storageArchivePath = process.env.FINANCIAL_APP_STORAGE_ARCHIVE
  ? resolve(process.env.FINANCIAL_APP_STORAGE_ARCHIVE)
  : null;
const packageJsonPath = resolve(process.cwd(), "package.json");

const CONTROL_DATA_EXCLUSIONS = [
  "financial_app.google_oauth_connections",
  "financial_app.authorized_users",
  "financial_app.workspace_memberships",
  "financial_app.workspace_deletion_intents",
  "financial_app.workspace_deletion_runtime_policy",
];

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
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    fail("FINANCIAL_APP_DB_URL must use the postgres/postgresql protocol.");
  }
  const parsed = {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeUrlComponent(url.username, "username"),
    password: decodeUrlComponent(url.password, "password"),
    database: decodeUrlComponent(url.pathname.replace(/^\/+/, ""), "database name"),
    sslmode: url.searchParams.get("sslmode") || "",
  };
  if (!parsed.host) fail("FINANCIAL_APP_DB_URL must include a database host.");
  if (!/^\d+$/.test(parsed.port)) fail("FINANCIAL_APP_DB_URL must include a valid database port.");
  if (!parsed.user) fail("FINANCIAL_APP_DB_URL must include a database username.");
  if (!parsed.password) fail("FINANCIAL_APP_DB_URL must include a database password.");
  if (!parsed.database) fail("FINANCIAL_APP_DB_URL must include a database name.");
  return parsed;
}

function sanitize(value) {
  let text = String(value ?? "");
  if (dbUrl) text = text.split(dbUrl).join("[REDACTED_DB_URL]");
  if (connection?.password) text = text.split(connection.password).join("[REDACTED_DB_PASSWORD]");
  return text;
}

function postgresEnv() {
  const env = { ...process.env, PGPASSWORD: connection.password };
  if (connection.sslmode) env.PGSSLMODE = connection.sslmode;
  else delete env.PGSSLMODE;
  return env;
}

function connectionArgs() {
  return [
    "--host", connection.host,
    "--port", connection.port,
    "--username", connection.user,
    "--dbname", connection.database,
    "--no-password",
  ];
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    env: postgresEnv(),
  });
  if (result.status !== 0) {
    const detail = sanitize(result.stderr || result.stdout || `exit_${result.status}`);
    fail(`${command} failed: ${detail.trim()}`);
  }
  return result.stdout ?? "";
}

function queryScalar(sql) {
  return run("psql", ["-X", "-A", "-t", ...connectionArgs(), "--command", sql]).trim();
}

function queryJson(sql, label) {
  const raw = queryScalar(sql);
  try {
    return JSON.parse(raw || "null");
  } catch {
    fail(`Could not parse ${label} returned by PostgreSQL.`);
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

function readAppVersion() {
  if (!existsSync(packageJsonPath)) fail("package.json is required to identify the application version.");
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    fail("package.json must be valid JSON.");
  }
  if (typeof parsed?.version !== "string" || !/^\d+\.\d+\.\d+$/.test(parsed.version)) {
    fail("package.json must contain a semantic application version.");
  }
  return parsed.version;
}

try {
  if (!dbUrl) fail("FINANCIAL_APP_DB_URL is required and must never be committed.");
  connection = parseConnection();
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    fail("FINANCIAL_APP_SOURCE_COMMIT must be an exact 40-character Git SHA.");
  }
  if (existsSync(outputDir)) {
    fail("Output directory already exists; use a new destination so a verified backup is never overwritten.");
  }

  const appVersion = readAppVersion();
  const schemaVersion = Number(queryScalar(
    "select schema_version::text from financial_app.schema_meta where id=true"
  ));
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    fail("financial_app.schema_meta returned an invalid schema_version.");
  }

  const capabilities = queryJson(`
    select pg_catalog.json_build_object(
      'workspaceTenancy', pg_catalog.to_regclass('financial_app.workspaces') is not null
        and pg_catalog.to_regclass('financial_app.workspace_memberships') is not null,
      'deletionRuntime', pg_catalog.to_regclass('financial_app.workspace_deletion_runtime_policy') is not null
        and pg_catalog.to_regclass('financial_app.workspace_deletion_receipts') is not null,
      'deletionIntent', pg_catalog.to_regclass('financial_app.workspace_deletion_intents') is not null
    )::text
  `, "capabilities");

  const storageInventory = queryJson(`
    select pg_catalog.json_build_object(
      'buckets', coalesce((
        select pg_catalog.json_agg(pg_catalog.json_build_object(
          'id', b.id,
          'name', b.name,
          'public', b.public,
          'fileSizeLimit', b.file_size_limit,
          'allowedMimeTypes', b.allowed_mime_types
        ) order by b.id)
        from storage.buckets b
      ), '[]'::json),
      'objects', coalesce((
        select pg_catalog.json_agg(pg_catalog.json_build_object(
          'id', o.id,
          'bucketId', o.bucket_id,
          'name', o.name,
          'createdAt', o.created_at,
          'updatedAt', o.updated_at,
          'metadata', o.metadata
        ) order by o.bucket_id, o.name, o.id)
        from storage.objects o
      ), '[]'::json)
    )::text
  `, "Storage inventory");

  const bucketCount = Array.isArray(storageInventory?.buckets) ? storageInventory.buckets.length : -1;
  const objectCount = Array.isArray(storageInventory?.objects) ? storageInventory.objects.length : -1;
  if (bucketCount < 0 || objectCount < 0) fail("Storage inventory has an invalid shape.");
  if (objectCount > 0 && (!storageArchivePath || !existsSync(storageArchivePath))) {
    fail("Supabase Storage contains objects, so FINANCIAL_APP_STORAGE_ARCHIVE must point to a verified off-site archive.");
  }

  const parentDir = dirname(outputDir);
  mkdirSync(parentDir, { recursive: true });
  stagingDir = mkdtempSync(resolve(parentDir, `.${basename(outputDir)}.staging-`));

  const schemaFile = resolve(stagingDir, "schema.sql");
  const dataFile = resolve(stagingDir, "data.sql");
  const storageInventoryFile = resolve(stagingDir, "storage-inventory.json");

  run("pg_dump", [
    ...connectionArgs(),
    "--schema", "financial_app",
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--file", schemaFile,
  ]);

  const exclusionArgs = CONTROL_DATA_EXCLUSIONS.flatMap((table) => ["--exclude-table-data", table]);
  run("pg_dump", [
    ...connectionArgs(),
    "--schema", "financial_app",
    "--data-only",
    "--no-owner",
    "--no-privileges",
    ...exclusionArgs,
    "--file", dataFile,
  ]);

  writeFileSync(
    storageInventoryFile,
    `${JSON.stringify({ capturedAt: new Date().toISOString(), ...storageInventory }, null, 2)}\n`,
    "utf8",
  );

  let storageArchive = null;
  if (objectCount > 0 && storageArchivePath) {
    const archiveName = basename(storageArchivePath);
    if (["schema.sql", "data.sql", "manifest.json", "storage-inventory.json"].includes(archiveName)) {
      fail("FINANCIAL_APP_STORAGE_ARCHIVE filename conflicts with a reserved backup filename.");
    }
    const bundledArchivePath = resolve(stagingDir, archiveName);
    copyFileSync(storageArchivePath, bundledArchivePath);
    storageArchive = fileEvidence(bundledArchivePath);
  }

  const manifest = {
    contractVersion: 2,
    createdAt: new Date().toISOString(),
    sourceCommit,
    appVersion,
    schemaVersion,
    schema: "financial_app",
    bankSourcePolicy: "read_only",
    locale: "es-ES",
    currency: "EUR",
    timeZone: "Europe/Madrid",
    capabilities,
    excludedSensitiveOrRuntimeControlTableData: CONTROL_DATA_EXCLUSIONS,
    restoreSafety: {
      workspaceMembershipsRequireReprovisioning: true,
      deletionIntentsAreNotRestored: true,
      deletionRuntimePolicyIsNotRestored: true,
      deletionMustBeReapprovedAfterRestore: true,
    },
    files: {
      schema: fileEvidence(schemaFile),
      data: fileEvidence(dataFile),
      storageInventory: fileEvidence(storageInventoryFile),
    },
    storage: {
      bucketCount,
      objectCount,
      archive: storageArchive,
    },
    restoreRequires: [
      "reprovision authorized user allowlist",
      "reprovision workspace memberships after auth user exists",
      "reprovision Google/Vault authorization",
      "reprovision Vercel and Supabase secrets",
      "recreate deletion runtime approval explicitly; never restore it from backup",
      "deploy versioned Edge Functions from the exact source commit",
      "restore Supabase Storage objects separately when objectCount is greater than zero",
    ],
  };

  writeFileSync(resolve(stagingDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  renameSync(stagingDir, outputDir);
  stagingDir = null;
  console.log(`backup_v2_created: ${outputDir}`);
} catch (error) {
  if (stagingDir) rmSync(stagingDir, { recursive: true, force: true });
  const message = error instanceof Error ? error.message : String(error);
  console.error(`backup_v2_failed: ${sanitize(message)}`);
  process.exit(1);
}
