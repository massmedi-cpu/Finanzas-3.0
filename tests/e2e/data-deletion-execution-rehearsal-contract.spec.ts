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
const selfServiceRoute = readFileSync("app/api/data/deletion/route.ts", "utf8");
const selfServicePanel = readFileSync("app/configuration/data/workspace-deletion-panel.tsx", "utf8");
const dataTrustContract = readFileSync("src/domain/data-trust-contract.ts", "utf8");

test("PRE-020E · el ensayo destructivo sigue siendo admin-only, desechable y reversible", () => {
  expect(protocol).toContain('state: "rehearsal_admin_only"');
  expect(protocol).toContain("disposableDatabaseOnly: true");
  expect(protocol).toContain("transactionalRollbackRequired: true");
  expect(protocol).toContain("runtimeExecutorAvailable: true");
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

test("PRE-020E/G · Storage sigue validado aisladamente y Production no se usa como banco de pruebas", () => {
  expect(rehearsal).toContain("pg_catalog.to_regclass('storage.objects')");
  expect(protocol).toContain("validatesSupabaseStorageRuntimeCleanup: true");
  expect(protocol).toContain('supabaseStorageValidationScope: "isolated_local_storage_api"');
  expect(protocol).toContain("productionStorageMutationTested: false");
  expect(protocol).toContain('"post_deletion_receipt_retention_policy_not_defined"');
  expect(protocol).toContain('"production_activation_not_approved"');
});

test("CR-001D · el autoservicio existe pero la API corta antes del gateway mientras la política esté apagada", () => {
  expect(existsSync("app/api/data/deletion/route.ts")).toBe(true);
  expect(sourceRouter).not.toMatch(/action\s*===\s*["']data\.deletion_execute_v1["']/);
  expect(intentHandler).toMatch(/action\s*===\s*["']data\.deletion_execute_v1["']/);
  expect(intentHandler).toContain("financial_app.begin_workspace_deletion_execution");
  expect(intentHandler).toContain("workspace_deletion_execution_policy_not_approved");
  expect(selfServiceRoute).toContain("if (!selfServiceActive(readiness)) return unavailable(readiness)");
  expect(selfServiceRoute.indexOf("if (!selfServiceActive(readiness))")).toBeLessThan(
    selfServiceRoute.indexOf('"data.deletion_prepare_v1"'),
  );
  expect(selfServiceRoute).toContain("readiness.canExecute !== true");
  expect(protocol).toContain("commercialPolicyConfigured: false");
  expect(protocol).toContain("productionActivated: false");
  expect(protocol).toContain("selfServiceExecutionEndpointExposed: true");
});

test("CR-001D · la UI exige dos pasos y entrega el recibo sin inventar retención", () => {
  expect(selfServicePanel).toContain('const CONFIRMATION_TEXT = "ELIMINAR MIS DATOS"');
  expect(selfServicePanel).toContain("Confirmación 1 de 2");
  expect(selfServicePanel).toContain("Confirmación 2 de 2");
  expect(selfServicePanel).toContain('run("confirm")');
  expect(selfServicePanel).toContain('run("execute")');
  expect(selfServicePanel).toContain("Descargar recibo JSON");
  expect(selfServicePanel).not.toMatch(/retenci[oó]n\s+de\s+\d+/i);
  expect(dataTrustContract).toMatch(
    /id:\s*"workspace-deletion"[\s\S]{0,1800}?state:\s*"not_available"/,
  );
});
