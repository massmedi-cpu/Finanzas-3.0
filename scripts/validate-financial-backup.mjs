import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const backupDir = resolve(process.argv[2] ?? "backups/financial-app");
const manifestPath = resolve(backupDir, "manifest.json");

const REQUIRED_SCHEMA_TABLES = [
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

const REQUIRED_DATA_ANCHORS = [
  "accounts",
  "transaction_source_records",
  "transactions",
];

const SENSITIVE_TABLES = ["google_oauth_connections", "authorized_users"];

function fail(code, detail = "") {
  const suffix = detail ? `: ${detail}` : "";
  console.error(`backup_invalid_${code}${suffix}`);
  process.exit(1);
}

if (!existsSync(manifestPath)) fail("manifest_missing");

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  fail("manifest_json");
}

if (manifest?.contractVersion !== 1) fail("contract_version");
if (manifest?.schema !== "financial_app") fail("schema");
if (!Number.isInteger(manifest?.schemaVersion) || manifest.schemaVersion < 14) fail("schema_version");
if (manifest?.appVersion !== "0.0.1" || manifest?.targetVersion !== "10.0.0") fail("app_version");
if (manifest?.bankSourcePolicy !== "read_only") fail("bank_source_policy");
if (manifest?.locale !== "es-ES" || manifest?.currency !== "EUR" || manifest?.timeZone !== "Europe/Madrid") {
  fail("regional_contract");
}
if (!/^[0-9a-f]{40}$/i.test(manifest?.sourceCommit ?? "")) fail("source_commit");

const excluded = new Set(Array.isArray(manifest?.excludedSensitiveTableData) ? manifest.excludedSensitiveTableData : []);
for (const table of SENSITIVE_TABLES) {
  if (!excluded.has(`financial_app.${table}`)) fail("sensitive_exclusion", table);
}

function verifyEvidence(evidence, label) {
  if (!evidence || typeof evidence.file !== "string" || !/^[a-zA-Z0-9._-]+$/.test(evidence.file)) {
    fail(`${label}_evidence`);
  }
  const file = resolve(backupDir, evidence.file);
  if (!file.startsWith(`${backupDir}/`) && file !== backupDir) fail(`${label}_path`);
  if (!existsSync(file)) fail(`${label}_missing`, evidence.file);
  const bytes = readFileSync(file);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (statSync(file).size !== evidence.bytes) fail(`${label}_size`);
  if (sha256 !== evidence.sha256) fail(`${label}_hash`);
  return bytes.toString("utf8");
}

const schemaSql = verifyEvidence(manifest?.files?.schema, "schema");
const dataSql = verifyEvidence(manifest?.files?.data, "data");

if (!/financial_app/i.test(schemaSql)) fail("schema_namespace");
for (const table of REQUIRED_SCHEMA_TABLES) {
  const tablePattern = new RegExp(`(?:financial_app[\\".]*)?\\"?${table}\\"?`, "i");
  if (!tablePattern.test(schemaSql)) fail("schema_table_missing", table);
}

for (const table of REQUIRED_DATA_ANCHORS) {
  const dataPattern = new RegExp(`(?:COPY|INSERT\\s+INTO)[\\s\\S]{0,120}(?:financial_app[\\".]*)?\\"?${table}\\"?`, "i");
  if (!dataPattern.test(dataSql)) fail("essential_data_missing", table);
}

for (const table of SENSITIVE_TABLES) {
  const sensitivePattern = new RegExp(`(?:COPY|INSERT\\s+INTO)[\\s\\S]{0,120}(?:financial_app[\\".]*)?\\"?${table}\\"?`, "i");
  if (sensitivePattern.test(dataSql)) fail("sensitive_data_present", table);
}

const bucketCount = manifest?.storage?.bucketCount;
const objectCount = manifest?.storage?.objectCount;
if (!Number.isInteger(bucketCount) || bucketCount < 0 || !Number.isInteger(objectCount) || objectCount < 0) {
  fail("storage_counts");
}
if (objectCount > 0) {
  if (!manifest?.storage?.archive) fail("storage_archive_required");
  verifyEvidence(manifest.storage.archive, "storage_archive");
} else if (manifest?.storage?.archive) {
  verifyEvidence(manifest.storage.archive, "storage_archive");
}

const forbiddenManifestKeys = ["databaseUrl", "dbUrl", "password", "refreshToken", "serviceRoleKey", "vercelToken"];
function walk(value, path = "manifest") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenManifestKeys.includes(key)) fail("secret_key", `${path}.${key}`);
    walk(child, `${path}.${key}`);
  }
}
walk(manifest);

console.log(JSON.stringify({
  status: "ok",
  contractVersion: manifest.contractVersion,
  schemaVersion: manifest.schemaVersion,
  sourceCommit: manifest.sourceCommit,
  bankSourcePolicy: manifest.bankSourcePolicy,
  storageObjects: objectCount,
}));
