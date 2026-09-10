import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("CR-001A · el executor local existe pero permanece fail-closed y sin DELETE bancario para el gateway", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato CR-001A se valida una vez por run");

  const root = process.cwd();
  const migrationPath = join(root, "supabase/migrations/20260910123000_cr001_workspace_deletion_local_executor.sql");
  const smokePath = join(root, "scripts/cr001-workspace-deletion-local-executor-smoke.sql");
  const protocolPath = join(root, "src/domain/workspace-deletion-protocol.ts");
  const handlerPath = join(root, "supabase/functions/financial-app-db-gateway/workspace-deletion-intent.ts");
  const routerPath = join(root, "supabase/functions/financial-app-db-gateway/source-sync-router.ts");
  const trustPath = join(root, "src/domain/data-trust-contract.ts");

  expect(existsSync(migrationPath)).toBe(true);
  expect(existsSync(smokePath)).toBe(true);

  const migration = readFileSync(migrationPath, "utf8").toLowerCase();
  const smoke = readFileSync(smokePath, "utf8").toLowerCase();
  const protocol = readFileSync(protocolPath, "utf8").toLowerCase();
  const handler = readFileSync(handlerPath, "utf8").toLowerCase();
  const router = readFileSync(routerPath, "utf8").toLowerCase();
  const trust = readFileSync(trustPath, "utf8").toLowerCase();

  expect(migration).toContain("workspace_deletion_runtime_policy");
  expect(migration).toContain("execution_enabled boolean not null default false");
  expect(migration).toContain("deletion_receipt_retention_days integer null");
  expect(migration).toContain("workspace_deletion_receipts");
  expect(migration).toContain("begin_workspace_deletion_execution");
  expect(migration).toContain("record_workspace_deletion_external_cleanup");
  expect(migration).toContain("finalize_workspace_deletion_local");
  expect(migration).toContain("security definer");
  expect(migration).toContain("workspace_deletion_execution_policy_not_approved");
  expect(migration).toContain("workspace_deletion_external_cleanup_not_verified");
  expect(migration).toContain("workspace_delete_intent_id");
  expect(migration).toContain("workspace_delete_execution_nonce");
  expect(migration).toContain("revoke update,delete on table financial_app.transaction_source_records from financial_app_gateway");
  expect(migration).not.toContain("grant delete on table financial_app.transaction_source_records to financial_app_gateway");
  expect(migration).not.toContain("disable trigger transaction_source_records_no_delete");
  expect(migration).not.toContain("alter table financial_app.transaction_source_records\n  disable trigger");

  expect(smoke).toContain("cr001a_default_policy_not_fail_closed");
  expect(smoke).toContain("cr001a_finalize_before_cleanup_allowed");
  expect(smoke).toContain("cr001a_cross_tenant_damage");
  expect(smoke).toContain("cr001a_bank_trigger_cross_tenant_bypass");
  expect(smoke).toContain("rollback;");
  expect(smoke).toContain("cr001_workspace_deletion_local_executor_smoke_ok");

  expect(protocol).toContain("localexecutorimplemented: true");
  expect(protocol).toContain("runtimeexecutoravailable: false");
  expect(protocol).toContain("post_deletion_receipt_retention_policy_not_defined");
  expect(protocol).toContain("production_activation_not_approved");

  expect(handler).not.toContain("data.deletion_execute_v1");
  expect(router).not.toContain("data.deletion_execute_v1");
  expect(trust).toContain('id: "workspace-deletion"');
  expect(trust).toContain('state: "not_available"');
});
