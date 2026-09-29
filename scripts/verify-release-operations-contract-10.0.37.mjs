import { existsSync, readFileSync } from "node:fs";

function read(path) {
  if (!existsSync(path)) throw new Error(`missing_release_operation_file:${path}`);
  return readFileSync(path, "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`release_operations_missing:${label}`);
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) throw new Error(`release_operations_stale:${label}`);
}

const postflightWorkflow = read(".github/workflows/production-postflight.yml");
const backupWorkflow = read(".github/workflows/production-backup-v2.yml");
const postflightConfig = read("playwright.production-postflight.config.ts");
const postflightSpec = read("tests/e2e/production-postflight.spec.ts");
const readonlyVerifier = read("scripts/verify-production-data-readonly.mjs");

for (const [label, source] of [
  ["postflight_workflow", postflightWorkflow],
  ["backup_workflow", backupWorkflow],
  ["postflight_spec", postflightSpec],
]) {
  for (const stale of [
    "10.0.35",
    "10.0.34",
    "10.0.30",
    "feature/backup-production-10.0.35",
    "00e7879decdab3a62b6b8e325b4f04b2004bfe96",
    "8113431f869ca6d26a43abc95920c84abb4ecdfd",
    "dpl_5ygkd3xhLo8bnMdwwnVv6hojWraJ",
  ]) forbidText(source, stale, `${label}:${stale}`);
}

requireText(postflightWorkflow, "workflow_dispatch:", "postflight_dispatch_only");
requireText(postflightWorkflow, "expected_version:", "postflight_expected_version_input");
requireText(postflightWorkflow, "deployment_commit:", "postflight_commit_input");
requireText(postflightWorkflow, "deployment_id:", "postflight_deployment_input");
requireText(postflightWorkflow, "test \"${GITHUB_REF_NAME}\" = \"main\"", "postflight_main_guard");
requireText(postflightWorkflow, "git merge-base --is-ancestor", "postflight_deployment_ancestry");
requireText(postflightWorkflow, "scripts/verify-production-data-readonly.mjs", "postflight_generic_readonly_verifier");
requireText(postflightWorkflow, "playwright.production-postflight.config.ts", "postflight_generic_playwright_config");

requireText(backupWorkflow, "workflow_dispatch:", "backup_dispatch_only");
requireText(backupWorkflow, "source_commit:", "backup_source_commit_input");
requireText(backupWorkflow, "expected_app_version:", "backup_expected_version_input");
requireText(backupWorkflow, "ref: ${{ inputs.source_commit }}", "backup_exact_source_checkout");
requireText(backupWorkflow, "manifest.appVersion !== process.env.EXPECTED_APP_VERSION", "backup_manifest_version_guard");
requireText(backupWorkflow, "manifest.sourceCommit !== process.env.FINANCIAL_APP_SOURCE_COMMIT", "backup_manifest_commit_guard");
requireText(backupWorkflow, "protect-backup-artifact-v2.sh encrypt", "backup_encryption");
requireText(backupWorkflow, ".tgz.gpg", "backup_encrypted_artifact");
requireText(backupWorkflow, "restore-verify-production-backup-v2.sh", "backup_real_restore_verification");
requireText(backupWorkflow, "validate-storage-archive-v2.mjs", "backup_storage_verification");

requireText(postflightConfig, 'testMatch: "production-postflight.spec.ts"', "postflight_config_generic_spec");
forbidText(postflightConfig, "production-postflight-10.0.35.spec.ts", "postflight_config_legacy_spec");
forbidText(postflightSpec, '?? "10.0.35"', "postflight_default_legacy_version");
requireText(postflightSpec, "EXPECTED_APP_VERSION", "postflight_dynamic_version");
requireText(postflightSpec, "EXPECTED_COMMIT_SHA", "postflight_dynamic_commit");
requireText(postflightSpec, "EXPECTED_DEPLOYMENT_ID", "postflight_dynamic_deployment");

requireText(readonlyVerifier, "default_transaction_read_only=on", "readonly_database_session");
requireText(readonlyVerifier, 'snapshot.bankSourcePolicy !== "read_only"', "readonly_bank_source_policy");
requireText(readonlyVerifier, 'snapshot.locale !== "es-ES"', "readonly_regional_contract");

console.log(JSON.stringify({
  status: "release_operations_contract_ok",
  postflight: "version_agnostic",
  backup: "version_agnostic",
  bankSourcePolicy: "read_only",
  productionMutation: false,
}));
