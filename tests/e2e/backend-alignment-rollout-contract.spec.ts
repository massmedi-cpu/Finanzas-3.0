import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const bridge = readFileSync("ops/backend-alignment/workspace-context-rollout-bridge.ts.template", "utf8");
const strict = readFileSync("supabase/functions/financial-app-db-gateway/workspace-context.ts", "utf8");
const runbook = readFileSync("docs/production-backend-alignment.md", "utf8");
const reconciliation = JSON.parse(readFileSync("ops/backend-alignment/production-migration-reconciliation.json", "utf8"));
const readinessAddendum = JSON.parse(readFileSync("ops/backend-alignment/cr001c-readiness-addendum.json", "utf8"));
const historyFingerprint = readFileSync("scripts/production-backend-alignment-history-fingerprint.sql", "utf8").toLowerCase();
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

test("backend alignment · la reconciliación original queda intacta y el hallazgo CR-001C se añade aparte", () => {
  expect(reconciliation.policy).toBe("reconcile_by_name_and_verified_effect_never_by_timestamp_only");
  expect(reconciliation.productionAppliedCount).toBe(47);
  expect(reconciliation.timestampMismatchCount).toBe(17);
  expect(reconciliation.pendingInOrder).toHaveLength(10);
  expect(reconciliation.pendingInOrder[0].name).toBe("pre001_workspace_tenancy");
  expect(reconciliation.pendingInOrder.at(-1).name).toBe("cr001_workspace_deletion_local_executor");

  expect(readinessAddendum.preservesOriginalReconciliation).toBe(true);
  expect(readinessAddendum.originalPendingCount).toBe(10);
  expect(readinessAddendum.additionalPendingInOrder).toHaveLength(1);
  expect(readinessAddendum.additionalPendingInOrder[0].name).toBe("cr001_workspace_deletion_readiness_alignment");
  expect(readinessAddendum.totalPendingCount).toBe(11);
  expect(readinessAddendum.expectedPostAlignmentMigrationCount).toBe(58);
  expect(readinessAddendum.destructiveActivationChanged).toBe(false);
});

test("backend alignment · las 17 migraciones con timestamp distinto quedan congeladas por huella", () => {
  expect(historyFingerprint).toContain("begin transaction read only");
  expect(historyFingerprint).toContain("financial_app_backend_history_fingerprint_ok");
  expect(historyFingerprint).toContain("backend_history_fingerprint_mismatch");
  expect(historyFingerprint).toContain("phase3_merchant_alias_engine");
  expect(historyFingerprint).toContain("pre007_forecast_write_integrity");
  expect(historyFingerprint).toContain("ddc0be92727a8210eeed3c434cb5acab");
  expect(historyFingerprint).toContain("dcef1afd150274f6769a198432d69d48");
});

test("backend alignment · preflight congela la frontera exacta de Production", () => {
  expect(preflight).toContain("v_total <> 47 or v_distinct <> 47");
  expect(preflight).toContain("backend_preflight_migration_boundary_changed");
  expect(preflight).toContain("backend_preflight_expected_migration_name_missing");
  expect(preflight).toContain("('financial_app_foundations')");
  expect(preflight).toContain("('pre007_forecast_write_integrity')");
});

test("backend alignment · postflight exige exactamente la frontera final y la superficie real", () => {
  expect(postflight).toContain("v_total <> 58 or v_distinct <> 58");
  expect(postflight).toContain("backend_postflight_migration_boundary_invalid");
  expect(postflight).toContain("('cr001_workspace_deletion_readiness_alignment')");
  expect(postflight).toContain("financial_app.export_current_workspace_data()");
  expect(postflight).not.toContain("financial_app.workspace_structured_export()");
  expect(postflight).toContain("backend_postflight_deletion_readiness_not_aligned");
  expect(postflight).toContain("destructive_executor_not_implemented");
  expect(postflight).toContain("self_service_execution_endpoint_not_exposed");
});

test("backend alignment · las comprobaciones de borde son de solo lectura y fail-closed", () => {
  for (const sql of [historyFingerprint, preflight, postflight]) {
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

test("backend alignment · el runbook no autoriza activación destructiva ni usa código no validado", () => {
  expect(runbook).toContain("workspace_deletion_runtime_policy.execution_enabled` debe quedar `false`");
  expect(runbook).toContain("No se define ni se inventa una política de retención");
  expect(runbook).toContain("No se usa `supabase db push`");
  expect(runbook).toContain("gateway puente");
  expect(runbook).toContain("gateway final estricto");
  expect(runbook).toContain("no están autorizadas para Production");
  expect(runbook).toContain("20260910173000_cr001_workspace_deletion_readiness_alignment.sql");
});
