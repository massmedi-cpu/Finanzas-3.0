import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("CR-001A/D · executor local y autoservicio existen pero Production permanece fail-closed", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato CR-001A/D se valida una vez por run");

  const root = process.cwd();
  const migrationPath = join(root, "supabase/migrations/20260910123000_cr001_workspace_deletion_local_executor.sql");
  const readinessPath = join(root, "supabase/migrations/20260911090000_cr001_workspace_deletion_self_service_readiness.sql");
  const smokePath = join(root, "scripts/cr001-workspace-deletion-local-executor-smoke.sql");
  const protocolPath = join(root, "src/domain/workspace-deletion-protocol.ts");
  const handlerPath = join(root, "supabase/functions/financial-app-db-gateway/workspace-deletion-intent.ts");
  const selfServicePath = join(root, "app/api/data/deletion/route.ts");
  const trustPath = join(root, "src/domain/data-trust-contract.ts");

  for (const path of [migrationPath, readinessPath, smokePath, selfServicePath]) {
    expect(existsSync(path)).toBe(true);
  }

  const migration = readFileSync(migrationPath, "utf8").toLowerCase();
  const readiness = readFileSync(readinessPath, "utf8").toLowerCase();
  const smoke = readFileSync(smokePath, "utf8").toLowerCase();
  const protocol = readFileSync(protocolPath, "utf8").toLowerCase();
  const handler = readFileSync(handlerPath, "utf8").toLowerCase();
  const selfService = readFileSync(selfServicePath, "utf8").toLowerCase();
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
  expect(migration).toContain("revoke update,delete on table financial_app.transaction_source_records from financial_app_gateway");
  expect(migration).not.toContain("grant delete on table financial_app.transaction_source_records to financial_app_gateway");

  expect(readiness).toContain("'canexecute',(v_execution_enabled and v_confirmed_fresh)");
  expect(readiness).toContain("'selfserviceexecutionendpointexposed',true");
  expect(readiness).not.toContain("execution_enabled=true");

  expect(smoke).toContain("cr001a_default_policy_not_fail_closed");
  expect(smoke).toContain("cr001a_finalize_before_cleanup_allowed");
  expect(smoke).toContain("cr001a_cross_tenant_damage");
  expect(smoke).toContain("cr001a_bank_trigger_cross_tenant_bypass");
  expect(smoke).toContain("rollback;");
  expect(smoke).toContain("cr001_workspace_deletion_local_executor_smoke_ok");

  expect(protocol).toContain("localexecutorimplemented: true");
  expect(protocol).toContain("runtimeorchestratorimplemented: true");
  expect(protocol).toContain("selfserviceexecutionendpointexposed: true");
  expect(protocol).toContain("post_deletion_receipt_retention_policy_not_defined");
  expect(protocol).toContain("production_activation_not_approved");

  expect(handler).toMatch(/action\s*===\s*["']data\.deletion_execute_v1["']/);
  expect(handler).toContain("begin_workspace_deletion_execution");
  expect(handler).toContain("workspace_deletion_execution_policy_not_approved");
  expect(selfService).toContain("workspace_deletion_commercial_policy_not_active");
  expect(selfService).toContain("if (!selfserviceactive(readiness)) return unavailable(readiness)");
  expect(trust).toContain('id: "workspace-deletion"');
  expect(trust).toContain('state: "not_available"');
});
