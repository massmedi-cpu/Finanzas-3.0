import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const gatewayIndex = readFileSync("supabase/functions/financial-app-db-gateway/index.ts", "utf8");
const sourceRouter = readFileSync("supabase/functions/financial-app-db-gateway/source-sync-router.ts", "utf8");
const handler = readFileSync("supabase/functions/financial-app-db-gateway/workspace-deletion-readiness.ts", "utf8");
const baselineMigration = readFileSync("supabase/migrations/20260910070000_pre020_workspace_deletion_readiness.sql", "utf8");
const storageMigration = readFileSync("supabase/migrations/20260910080000_pre020_storage_cleanup_validated.sql", "utf8");
const alignedMigration = readFileSync("supabase/migrations/20260910173000_cr001_workspace_deletion_readiness_alignment.sql", "utf8");
const protocol = readFileSync("src/domain/workspace-deletion-protocol.ts", "utf8");
const storageRehearsal = readFileSync("scripts/pre020-storage-runtime-rehearsal.mjs", "utf8");
const storageWorkflow = readFileSync(".github/workflows/pre020-storage-runtime-rehearsal.yml", "utf8");
const dataTrustPage = readFileSync("app/configuration/data/page.tsx", "utf8");
const dataTrustContract = readFileSync("src/domain/data-trust-contract.ts", "utf8");

const ACTION = "data.deletion_readiness_v1";

test("PRE-020F/G · readiness no entra en Preview→Production", () => {
  const start = gatewayIndex.indexOf("const PREVIEW_READ_ONLY_ACTIONS");
  const end = gatewayIndex.indexOf("]);", start);
  expect(gatewayIndex.slice(start, end + 3)).not.toContain(ACTION);
});

test("PRE-020F/G · evidencia histórica sigue invoker, owner/RLS heredado y fail-closed", () => {
  for (const migration of [baselineMigration, storageMigration]) {
    expect(migration).toContain("financial_app.workspace_deletion_impact()");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("stable");
    expect(migration).toContain("'canExecute', false");
    expect(migration).toContain("'destructiveOperationExecuted', false");
    expect(migration.toLowerCase()).not.toMatch(/\bdelete\s+from\b/);
    expect(migration.toLowerCase()).not.toMatch(/\bupdate\s+financial_app\b/);
    expect(migration.toLowerCase()).not.toMatch(/\binsert\s+into\s+financial_app\b/);
  }
});

test("PRE-020G / CR-001C · historial conserva el blocker antiguo y el estado actual lo retira", () => {
  expect(baselineMigration).toContain("supabase_storage_runtime_cleanup_not_validated");
  expect(storageMigration).not.toContain("supabase_storage_runtime_cleanup_not_validated");
  expect(storageMigration).toContain("destructive_executor_not_implemented");

  expect(alignedMigration).not.toContain("destructive_executor_not_implemented");
  expect(alignedMigration).toContain("workspace_deletion_local_executor_implemented");
  expect(alignedMigration).toContain("'localExecutorImplemented',true");
  expect(alignedMigration).toContain("'canExecute',false");
  expect(alignedMigration).toContain("self_service_execution_endpoint_not_exposed");
  expect(alignedMigration.toLowerCase()).not.toMatch(/\bdelete\s+from\b/);
  expect(alignedMigration.toLowerCase()).not.toMatch(/\bupdate\s+financial_app\b/);
  expect(alignedMigration.toLowerCase()).not.toMatch(/\binsert\s+into\s+financial_app\b/);

  expect(protocol).not.toContain("destructive_executor_not_implemented");
  expect(protocol).toContain("runtimeOrchestratorImplemented: true");
  expect(protocol).toContain("selfServiceExecutionEndpointExposed: false");
  expect(protocol).toContain("self_service_execution_endpoint_not_exposed");
});

test("PRE-020G / CR-001C · Storage validado conserva evidencia y blockers comerciales", () => {
  expect(storageMigration).toContain("supabase_storage_runtime_cleanup_validated");
  expect(storageMigration).toContain("'scope', 'isolated_local_storage_api'");
  expect(storageRehearsal).toContain("127.0.0.1");
  expect(storageRehearsal).toContain("localhost");
  expect(storageWorkflow).toContain("supabase start");
  expect(storageWorkflow).toContain("version: 2.117.0");

  for (const blocker of [
    "post_deletion_receipt_retention_policy_not_defined",
    "production_activation_not_approved",
  ]) {
    expect(alignedMigration).toContain(blocker);
    expect(protocol).toContain(blocker);
  }
  expect(alignedMigration).toContain("workspace_deletion_intent_not_confirmed");
  expect(alignedMigration).toContain("'officialBankSource','untouched'");
  expect(alignedMigration).toContain("'googleDriveFiles','untouched'");
});

test("CR-001C · Edge declara sólo la capacidad que puede comprobar y conserva fail-closed", () => {
  expect(sourceRouter).toContain('import { handleWorkspaceDeletionReadinessAction } from "./workspace-deletion-readiness.ts"');
  expect(sourceRouter).toContain("await handleWorkspaceDeletionReadinessAction(input)");
  expect(handler).toContain(ACTION);
  expect(handler).toContain('environment !== "production"');
  expect(handler).toContain("readiness.canExecute !== false");
  expect(handler).toContain("runtimeOrchestratorImplemented: true");
  expect(handler).toContain("selfServiceExecutionEndpointExposed: false");
  expect(handler).not.toContain("data.deletion_execute_v1");
});

test("PRE-020F/G · Preview/Local devuelven 403 real con headers seguros", async ({ request }) => {
  const response = await request.get("/api/data/deletion-readiness");
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await response.json()).toEqual({
    error: "workspace_deletion_readiness_production_only",
    code: "preview_production_deletion_readiness_forbidden",
  });
});

test("PRE-020G / CR-001C · diagnóstico no activa UI ni contrato comercial", () => {
  expect(existsSync("app/api/data/deletion-execute/route.ts")).toBe(false);
  expect(sourceRouter).not.toMatch(/action\s*===?\s*["']data\.deletion_execute_v1["']/);
  expect(dataTrustPage).not.toContain(ACTION);
  expect(dataTrustPage).not.toContain("/api/data/deletion-readiness");
  expect(dataTrustPage).not.toContain("data.deletion_execute_v1");
  expect(dataTrustContract).toMatch(/id:\s*"workspace-deletion"[\s\S]{0,1200}?state:\s*"not_available"/);
});
