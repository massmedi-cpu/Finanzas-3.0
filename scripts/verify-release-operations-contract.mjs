import { existsSync, readFileSync } from "node:fs";
import { assertCompleteSourceHistory, requiresCompleteSourceHistory } from "./release-source-coverage-gate.mjs";

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
function requireAbsent(path) {
  if (existsSync(path)) throw new Error(`legacy_release_operation_still_present:${path}`);
}

const postflightWorkflow = read(".github/workflows/production-postflight.yml");
const backupWorkflow = read(".github/workflows/production-backup-v2.yml");
const backupContractWorkflow = read(".github/workflows/backup-production-contract.yml");
const postflightConfig = read("playwright.production-postflight.config.ts");
const postflightSpec = read("tests/e2e/production-postflight.spec.ts");
const readonlyVerifier = read("scripts/verify-production-data-readonly.mjs");

for (const legacyPath of [
  ".github/workflows/production-postflight-10.0.35.yml",
  ".github/workflows/production-backup-v2-10.0.35.yml",
  ".github/workflows/backup-production-contract-10.0.35.yml",
  "tests/e2e/production-postflight-10.0.35.spec.ts",
  "scripts/verify-production-data-readonly-10.0.35.mjs",
]) requireAbsent(legacyPath);

for (const [label, source] of [["postflight_workflow", postflightWorkflow],["backup_workflow", backupWorkflow],["backup_contract_workflow", backupContractWorkflow],["postflight_spec", postflightSpec]]) {
  for (const stale of ["10.0.35","10.0.34","10.0.30","feature/backup-production-10.0.35","00e7879decdab3a62b6b8e325b4f04b2004bfe96","8113431f869ca6d26a43abc95920c84abb4ecdfd","dpl_5ygkd3xhLo8bnMdwwnVv6hojWraJ"]) {
    forbidText(source, stale, `${label}:${stale}`);
  }
}

requireText(postflightWorkflow, "workflow_dispatch:", "postflight_dispatch_only");
requireText(postflightWorkflow, "expected_version:", "postflight_expected_version_input");
requireText(postflightWorkflow, "deployment_commit:", "postflight_commit_input");
requireText(postflightWorkflow, "deployment_id:", "postflight_deployment_input");
requireText(postflightWorkflow, "test \"${GITHUB_REF_NAME}\" = \"main\"", "postflight_main_guard");
requireText(postflightWorkflow, "git merge-base --is-ancestor", "postflight_deployment_ancestry");
requireText(postflightWorkflow, "scripts/verify-production-data-readonly.mjs", "postflight_generic_readonly_verifier");
requireText(postflightWorkflow, "EXPECTED_APP_VERSION: ${{ inputs.expected_version }}", "postflight_readonly_receives_version");
requireText(readonlyVerifier, "assertCompleteSourceHistory(process.env.EXPECTED_APP_VERSION, snapshot.sourceRecords)", "postflight_source_history_floor_invoked");
requireText(backupWorkflow, "workflow_dispatch:", "backup_dispatch_only");
requireText(backupWorkflow, "source_commit:", "backup_source_commit_input");
requireText(backupWorkflow, "expected_app_version:", "backup_expected_version_input");
requireText(backupWorkflow, "test \"${GITHUB_REF_NAME}\" = \"main\"", "backup_main_guard");
requireText(backupWorkflow, "protect-backup-artifact-v2.sh encrypt", "backup_encryption");
requireText(backupWorkflow, "restore-verify-production-backup-v2.sh", "backup_real_restore_verification");
requireText(backupContractWorkflow, "workflow_dispatch:", "backup_contract_manual_rehearsal");
requireText(backupContractWorkflow, "scripts/phase13-restore-rehearsal-v2.sh", "backup_contract_restore_rehearsal");
requireText(postflightConfig, 'testMatch: "production-postflight.spec.ts"', "postflight_config_generic_spec");
requireText(postflightSpec, "EXPECTED_APP_VERSION", "postflight_dynamic_version");
requireText(postflightSpec, "EXPECTED_COMMIT_SHA", "postflight_dynamic_commit");
requireText(postflightSpec, "EXPECTED_DEPLOYMENT_ID", "postflight_dynamic_deployment");
requireText(postflightSpec, "expectedProductionDocumentProfile(EXPECTED_VERSION)", "postflight_complete_document_release_gate");
requireText(postflightSpec, "requiresDualProductionDomainCheck(EXPECTED_VERSION)", "postflight_dual_domain_future_release");
requireText(read("src/domain/release-production-profile.ts"), "patch >= 105", "full_release_version_boundary");
requireText(read("tests/unit/release-production-profile.test.mjs"), "REC-REL-703", "complete_release_profile_unit_test");
requireText(read(".github/workflows/release-operations-contract.yml"), "release-production-profile.test.mjs", "release_profile_ci_test");
requireText(read(".github/workflows/release-operations-contract.yml"), "release-manifest-profile.test.mjs", "manifest_profile_ci_test");
requireText(read(".github/workflows/publish-verified-release.yml"), "npm run release:manifest", "release_manifest_enforced_at_publish");
requireText(read(".github/workflows/publish-verified-release.yml"), "node scripts/verify-production-release-domains.mjs", "production_release_two_aliases_gate");
requireText(read(".github/workflows/publish-verified-release.yml"), "production_url_must_be_official_clean_origin", "production_release_official_origin");
requireText(read("scripts/verify-production-release-domains.mjs"), "PRODUCTION_ORIGINS", "production_release_origins");
requireText(read("tests/unit/verify-production-release-domains.test.mjs"), "REC-REL-710", "production_release_two_domains_unit_test");
requireText(read(".github/workflows/release-operations-contract.yml"), "node --experimental-strip-types --test tests/unit/verify-production-release-domains.test.mjs", "release_alias_unit_tests_executed_in_ci");
requireText(readonlyVerifier, "default_transaction_read_only=on", "readonly_database_session");
requireText(readonlyVerifier, 'snapshot.bankSourcePolicy !== "read_only"', "readonly_bank_source_policy");
requireText(readonlyVerifier, 'snapshot.locale !== "es-ES"', "readonly_regional_contract");


for (const [version, expected] of [
  ["", false], ["10.0.103", false], ["10.0.104", true], ["10.0.105", true],
  ["10.1.0", true], ["11.0.0", true], ["9.9.999", false],
]) {
  if (requiresCompleteSourceHistory(version) !== expected) {
    throw new Error(`release_history_version_gate_mismatch:${version}`);
  }
}
for (const count of [0, 3188, 3217, NaN]) {
  let blocked = false;
  try { assertCompleteSourceHistory("10.0.104", count); }
  catch { blocked = true; }
  if (!blocked) throw new Error(`release_history_incomplete_accepted:${count}`);
}
for (const count of [3218, 3219]) assertCompleteSourceHistory("10.0.104", count);
assertCompleteSourceHistory("10.0.103", 3188);
let invalidVersionBlocked = false;
try { requiresCompleteSourceHistory("10.0.invalid"); }
catch { invalidVersionBlocked = true; }
if (!invalidVersionBlocked) throw new Error("release_history_invalid_version_accepted");

console.log(JSON.stringify({ status: "release_operations_contract_ok", postflight: "version_agnostic", backup: "version_agnostic", bankSourcePolicy: "read_only", productionMutation: false }));
