import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const bridge = readFileSync("ops/backend-alignment/workspace-context-rollout-bridge.ts.template", "utf8");
const strict = readFileSync("supabase/functions/financial-app-db-gateway/workspace-context.ts", "utf8");
const runbook = readFileSync("docs/production-backend-alignment.md", "utf8");
const reconciliation = JSON.parse(readFileSync("ops/backend-alignment/production-migration-reconciliation.json", "utf8"));
const preflight = readFileSync("scripts/production-backend-alignment-preflight.sql", "utf8").toLowerCase();
const postflight = readFileSync("scripts/production-backend-alignment-postflight.sql", "utf8").toLowerCase();

test("backend alignment · el bridge sólo acepta estados completos de rollout", () => {
  expect(bridge).toContain("to_regrole('financial_app_gateway')");
  expect(bridge).toContain("to_regprocedure('financial_app.require_current_workspace_id()')");
  expect(bridge).toContain("state.gatewayRoleExists !== state.isolationMarkerExists");
  expect(bridge).toContain('"workspace_isolation_state_inconsistent"');
  expect(bridge).toContain("state.gatewayRoleExists && state.isolationMarkerExists");
  expect(bridge).toContain('set role financial_app_gateway');
  expect(bridge).toContain("workspace_memberships");
});

test("backend alignment · el gateway permanente sigue siendo estricto y no contiene fallback bridge", () => {
  expect(strict).toContain('await sql.unsafe("set role financial_app_gateway")');
  expect(strict).not.toContain("detectIsolationState");
  expect(strict).not.toContain("workspace_isolation_state_inconsistent");
});

test("backend alignment · la reconciliación prohíbe timestamp-only y enumera exactamente 10 pendientes", () => {
  expect(reconciliation.policy).toBe("reconcile_by_name_and_verified_effect_never_by_timestamp_only");
  expect(reconciliation.productionAppliedCount).toBe(47);
  expect(reconciliation.timestampMismatchCount).toBe(17);
  expect(reconciliation.pendingInOrder).toHaveLength(10);
  expect(reconciliation.pendingInOrder[0].name).toBe("pre001_workspace_tenancy");
  expect(reconciliation.pendingInOrder.at(-1).name).toBe("cr001_workspace_deletion_local_executor");
});

test("backend alignment · preflight y postflight son transacciones de solo lectura con fail-closed", () => {
  for (const sql of [preflight, postflight]) {
    expect(sql).toContain("begin transaction read only");
    expect(sql).toContain("rollback;");
    expect(sql).not.toMatch(/\binsert\s+into\b/);
    expect(sql).not.toMatch(/\bupdate\s+financial_app\b/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
  }
  expect(preflight).toContain("financial_app_backend_preflight_ok");
  expect(postflight).toContain("financial_app_backend_postflight_ok");
  expect(postflight).toContain("backend_postflight_deletion_policy_not_fail_closed");
  expect(postflight).toContain("transaction_source_records_no_delete");
  expect(postflight).toContain("transaction_source_records_no_update");
});

test("backend alignment · el runbook no autoriza activación destructiva", () => {
  expect(runbook).toContain("workspace_deletion_runtime_policy.execution_enabled` debe quedar `false`");
  expect(runbook).toContain("No se define ni se inventa una política de retención");
  expect(runbook).toContain("No se usa `supabase db push`");
  expect(runbook).toContain("gateway puente");
  expect(runbook).toContain("gateway final estricto");
});
