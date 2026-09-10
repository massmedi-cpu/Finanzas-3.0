import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const backupDir = resolve(process.argv[2] ?? "backups/financial-app-v2");
const manifestPath = resolve(backupDir, "manifest.json");

const CORE_TABLES = [
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
const WORKSPACE_TABLES = ["workspaces", "workspace_memberships"];
const REQUIRED_DATA_ANCHORS = ["accounts", "transaction_source_records", "transactions"];
const FORBIDDEN_DATA_TABLES = [
  "google_oauth_connections",
  "authorized_users",
  "workspace_memberships",
  "workspace_deletion_intents",
  "workspace_deletion_runtime_policy",
];

function fail(code, detail = "") {
  const suffix = detail ? `: ${detail}` : "";
  console.error(`backup_v2_invalid_${code}${suffix}`);
  process.exit(1);
}

if (!existsSync(manifestPath)) fail("manifest_missing");
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  fail("manifest_json");
}

if (manifest?.contractVersion !== 2) fail("contract_version");
if (manifest?.schema !== "financial_app") fail("schema");
if (!Number.isInteger(manifest?.schemaVersion) || manifest.schemaVersion < 1) fail("schema_version");
if (typeof manifest?.appVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.appVersion)) fail("app_version");
if (manifest?.bankSourcePolicy !== "read_only") fail("bank_source_policy");
if (manifest?.locale !== "es-ES" || manifest?.currency !== "EUR" || manifest?.timeZone !== "Europe/Madrid") {
  fail("regional_contract");
}
if (!/^[0-9a-f]{40}$/i.test(manifest?.sourceCommit ?? "")) fail("source_commit");

const capabilities = manifest?.capabilities;
if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) fail("capabilities");
for (const key of ["workspaceTenancy", "deletionRuntime", "deletionIntent"]) {
  if (typeof capabilities[key] !== "boolean") fail("capability_flag", key);
}
if (capabilities.deletionRuntime && !capabilities.workspaceTenancy) fail("capability_order", "deletionRuntime_without_workspaceTenancy");
if (capabilities.deletionIntent && !capabilities.workspaceTenancy) fail("capability_order", "deletionIntent_without_workspaceTenancy");

const restoreSafety = manifest?.restoreSafety;
if (
  restoreSafety?.workspaceMembershipsRequireReprovisioning !== true ||
  restoreSafety?.deletionIntentsAreNotRestored !== true ||
  restoreSafety?.deletionRuntimePolicyIsNotRestored !== true ||
  restoreSafety?.deletionMustBeReapprovedAfterRestore !== true
) {
  fail("restore_safety");
}

function verifyEvidence(evidence, label) {
  if (!evidence || typeof evidence.file !== "string" || !/^[a-zA-Z0-9._-]+$/.test(evidence.file)) {
    fail(`${label}_evidence`);
  }
  const file = resolve(backupDir, evidence.file);
  const prefix = `${backupDir}${process.platform === "win32" ? "\\" : "/"}`;
  if (!file.startsWith(prefix)) fail(`${label}_path`);
  if (!existsSync(file)) fail(`${label}_missing`, evidence.file);
  const bytes = readFileSync(file);
  if (statSync(file).size !== evidence.bytes) fail(`${label}_size`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== evidence.sha256) fail(`${label}_hash`);
  return bytes.toString("utf8");
}

const schemaSql = verifyEvidence(manifest?.files?.schema, "schema");
const dataSql = verifyEvidence(manifest?.files?.data, "data");
const storageInventoryText = verifyEvidence(manifest?.files?.storageInventory, "storage_inventory");

if (!/financial_app/i.test(schemaSql)) fail("schema_namespace");
const requiredTables = [...CORE_TABLES];
if (capabilities.workspaceTenancy) requiredTables.push(...WORKSPACE_TABLES);
if (capabilities.deletionIntent) requiredTables.push("workspace_deletion_intents");
if (capabilities.deletionRuntime) requiredTables.push("workspace_deletion_runtime_policy", "workspace_deletion_receipts");
for (const table of requiredTables) {
  const tablePattern = new RegExp(`(?:financial_app[\\".]*)?\\"?${table}\\"?`, "i");
  if (!tablePattern.test(schemaSql)) fail("schema_table_missing", table);
}

for (const table of REQUIRED_DATA_ANCHORS) {
  const dataPattern = new RegExp(`(?:COPY|INSERT\\s+INTO)[\\s\\S]{0,160}(?:financial_app[\\".]*)?\\"?${table}\\"?`, "i");
  if (!dataPattern.test(dataSql)) fail("essential_data_missing", table);
}
for (const table of FORBIDDEN_DATA_TABLES) {
  const forbiddenPattern = new RegExp(`(?:COPY|INSERT\\s+INTO)[\\s\\S]{0,160}(?:financial_app[\\".]*)?\\"?${table}\\"?`, "i");
  if (forbiddenPattern.test(dataSql)) fail("runtime_control_data_present", table);
}

let storageInventory;
try {
  storageInventory = JSON.parse(storageInventoryText);
} catch {
  fail("storage_inventory_json");
}
if (!Array.isArray(storageInventory?.buckets) || !Array.isArray(storageInventory?.objects)) {
  fail("storage_inventory_shape");
}
const bucketCount = manifest?.storage?.bucketCount;
const objectCount = manifest?.storage?.objectCount;
if (!Number.isInteger(bucketCount) || bucketCount < 0 || !Number.isInteger(objectCount) || objectCount < 0) {
  fail("storage_counts");
}
if (storageInventory.buckets.length !== bucketCount || storageInventory.objects.length !== objectCount) {
  fail("storage_inventory_count_mismatch");
}
if (objectCount > 0) {
  if (!manifest?.storage?.archive) fail("storage_archive_required");
  verifyEvidence(manifest.storage.archive, "storage_archive");
} else if (manifest?.storage?.archive) {
  verifyEvidence(manifest.storage.archive, "storage_archive");
}

const declaredExclusions = new Set(
  Array.isArray(manifest?.excludedSensitiveOrRuntimeControlTableData)
    ? manifest.excludedSensitiveOrRuntimeControlTableData
    : [],
);
for (const table of FORBIDDEN_DATA_TABLES) {
  if (!declaredExclusions.has(`financial_app.${table}`)) fail("missing_declared_exclusion", table);
}

const forbiddenManifestKeys = [
  "databaseUrl",
  "dbUrl",
  "password",
  "refreshToken",
  "serviceRoleKey",
  "vercelToken",
  "accessToken",
];
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
  contractVersion: 2,
  appVersion: manifest.appVersion,
  schemaVersion: manifest.schemaVersion,
  sourceCommit: manifest.sourceCommit,
  workspaceTenancy: capabilities.workspaceTenancy,
  deletionRuntime: capabilities.deletionRuntime,
  storageBuckets: bucketCount,
  storageObjects: objectCount,
  bankSourcePolicy: manifest.bankSourcePolicy,
}));
