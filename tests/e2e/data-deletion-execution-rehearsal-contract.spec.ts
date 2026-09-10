import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const protocol = readFileSync("src/domain/workspace-deletion-protocol.ts", "utf8");
const rehearsal = readFileSync("scripts/pre020-workspace-deletion-execution-rehearsal.sql", "utf8");
const sourceRouter = readFileSync(
  "supabase/functions/financial-app-db-gateway/source-sync-router.ts",
  "utf8",
);
const intentHandler = readFileSync(
  "supabase/functions/financial-app-db-gateway/workspace-deletion-intent.ts",
  "utf8",
);
const dataTrustPage = readFileSync("app/configuration/data/page.tsx", "utf8");
const dataTrustContract = readFileSync("src/domain/data-trust-contract.ts", "utf8");

test("PRE-020E · el ensayo destructivo sigue siendo admin-only, desechable y reversible", () => {
  expect(protocol).toContain('state: "rehearsal_admin_only"');
  expect(protocol).toContain("disposableDatabaseOnly: true");
  expect(protocol).toContain("transactionalRollbackRequired: true");
  expect(protocol).toContain("runtimeExecutorAvailable: false");
  expect(rehearsal).toContain("begin;");
  expect(rehearsal).toContain("rollback;");
  expect(rehearsal).toContain("PRE020_DELETION_EXECUTION_REHEARSAL_OK");
});

test("PRE-020E · el rehearsal demuestra las barreras del banco y re-habilita el trigger", () => {
  expect(rehearsal).toContain("PRE020E_GATEWAY_BANK_DELETE_ALLOWED");
  expect(rehearsal).toContain("PRE020E_BANK_IMMUTABILITY_TRIGGER_BYPASSED");
  expect(rehearsal).toContain("disable trigger transaction_source_records_no_delete");
  expect(rehearsal).toContain("enable trigger transaction_source_records_no_delete");
  expect(rehearsal).toContain("PRE020E_BANK_DELETE_TRIGGER_NOT_REENABLED");
  expect(protocol).toContain('"official_bank_source"');
});

test("PRE-020E · el rehearsal prueba orden RESTRICT, aislamiento y OAuth/Vault sin tocar Drive", () => {
  expect(rehearsal).toContain("PRE020E_ROOT_DELETE_BYPASSED_RESTRICT");
  expect(rehearsal).toContain("PRE020E_CROSS_TENANT_DAMAGE");
  expect(rehearsal).toContain("disconnect_google_oauth_connection()");
  expect(rehearsal).toContain("PRE020E_VAULT_B_DAMAGED");
  expect(protocol).toContain('"google_drive_files"');
  expect(protocol).toContain("externalGoogleDriveMutationAllowed: false");
});

test("PRE-020E/G · la limitación Storage del rehearsal DB queda superada sólo por el rehearsal Storage aislado", () => {
  expect(rehearsal).toContain("pg_catalog.to_regclass('storage.objects')");
  expect(protocol).toContain("validatesSupabaseStorageRuntimeCleanup: true");
  expect(protocol).toContain('supabaseStorageValidationScope: "isolated_local_storage_api"');
  expect(protocol).not.toContain('"supabase_storage_runtime_cleanup_not_validated"');
  expect(protocol).toContain('"post_deletion_receipt_retention_policy_not_defined"');
  expect(protocol).toContain('"production_activation_not_approved"');
});

test("PRE-020E · no existe executor runtime, endpoint ni activación comercial", () => {
  const executeActionBranch = /(?:input\.)?action\s*===?\s*["']data\.deletion_execute_v1["']/;
  expect(sourceRouter).not.toMatch(executeActionBranch);
  expect(intentHandler).not.toMatch(executeActionBranch);
  expect(existsSync("app/api/data/deletion-execute/route.ts")).toBe(false);
  expect(dataTrustPage).not.toContain("data.deletion_execute_v1");
  expect(dataTrustPage).not.toContain("/api/data/deletion-execute");
  expect(dataTrustContract).toMatch(
    /id:\s*"workspace-deletion"[\s\S]{0,1200}?state:\s*"not_available"/,
  );
});
