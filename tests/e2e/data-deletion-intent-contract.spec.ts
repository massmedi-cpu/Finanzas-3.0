import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const gatewayIndex = readFileSync(
  "supabase/functions/financial-app-db-gateway/index.ts",
  "utf8",
);
const sourceRouter = readFileSync(
  "supabase/functions/financial-app-db-gateway/source-sync-router.ts",
  "utf8",
);
const handler = readFileSync(
  "supabase/functions/financial-app-db-gateway/workspace-deletion-intent.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260910060000_pre020_workspace_deletion_intent.sql",
  "utf8",
);
const readinessMigration = readFileSync(
  "supabase/migrations/20260911090000_cr001_workspace_deletion_self_service_readiness.sql",
  "utf8",
);
const protocol = readFileSync("src/domain/workspace-deletion-protocol.ts", "utf8");
const dataTrustPage = readFileSync("app/configuration/data/page.tsx", "utf8");
const dataTrustContract = readFileSync("src/domain/data-trust-contract.ts", "utf8");
const selfServiceRoute = readFileSync("app/api/data/deletion/route.ts", "utf8");

const ACTIONS = [
  "data.deletion_prepare_v1",
  "data.deletion_confirm_v1",
  "data.deletion_cancel_v1",
  "data.deletion_execute_v1",
];

test("PRE-020D / CR-001D · ninguna acción destructiva entra en Preview→Production", () => {
  const start = gatewayIndex.indexOf("const PREVIEW_READ_ONLY_ACTIONS");
  const end = gatewayIndex.indexOf("]);", start);
  const previewAllowlist = gatewayIndex.slice(start, end + 3);
  for (const action of ACTIONS) expect(previewAllowlist).not.toContain(action);
  expect(selfServiceRoute).toContain('process.env.VERCEL_ENV === "production"');
  expect(selfServiceRoute).toContain("preview_production_deletion_forbidden");
});

test("PRE-020D · la máquina de estados base es RLS, invoker e incapaz de borrar", () => {
  expect(migration).toContain("workspace_deletion_intents_workspace_isolation");
  expect(migration).toContain("force row level security");
  expect(migration).toContain("grant select, insert, update");
  expect(migration).not.toContain("grant select, insert, update, delete");
  expect(migration).not.toContain("security definer");
  expect(migration.match(/security invoker/g)?.length).toBe(3);
  expect(migration.toLowerCase()).not.toMatch(/\bdelete\s+from\b/);
  expect(migration).toContain("'destructiveOperationExecuted',false");
});

test("PRE-020D · prepare es idempotente, corto y snapshot-aware", () => {
  expect(migration).toContain("constraint workspace_deletion_intents_request_key_unique");
  expect(migration).toContain("workspace_deletion_intents_one_open_per_workspace");
  expect(migration).toContain("now()+interval '10 minutes'");
  expect(migration).toContain("financial_app.workspace_deletion_impact()");
  expect(migration).toContain("'idempotentReplay',true");
  expect(migration).toContain("workspace_deletion_impact_changed");
  expect(migration).toContain("workspace_deletion_confirmation_invalid");
});

test("CR-001D · readiness sólo permite ejecutar con política activa e intent confirmado", () => {
  expect(readinessMigration).toContain("'canExecute',(v_execution_enabled and v_confirmed_fresh)");
  expect(readinessMigration).toContain("'selfServiceExecutionEndpointExposed',true");
  expect(readinessMigration).toContain("'post_deletion_receipt_retention_policy_not_defined'");
  expect(readinessMigration).toContain("'production_activation_not_approved'");
  expect(readinessMigration).not.toContain("execution_enabled=true");
});

test("PRE-020D / CR-001B · Edge mantiene el executor detrás de barreras fail-closed", () => {
  expect(sourceRouter).toContain(
    'import { handleWorkspaceDeletionIntentAction } from "./workspace-deletion-intent.ts"',
  );
  expect(sourceRouter).toContain("await handleWorkspaceDeletionIntentAction(input)");
  for (const action of ACTIONS) expect(handler).toContain(action);
  expect(handler).toContain('environment !== "production"');
  expect(handler).toMatch(/action\s*===?\s*["']data\.deletion_execute_v1["']/);
  expect(handler).toContain("financial_app.begin_workspace_deletion_execution");
  expect(handler).toContain("workspace_deletion_execution_policy_not_approved");
  expect(sourceRouter).not.toContain("handleWorkspaceDeletionExecutionAction");
});

test("CR-001D · endpoint web no encadena confirmación y ejecución", () => {
  expect(selfServiceRoute).toContain('type DeletionOperation = "prepare" | "confirm" | "cancel" | "execute"');
  expect(selfServiceRoute).toContain("selfServiceActive(readiness)");
  expect(selfServiceRoute).toContain("readiness.canExecute !== true");
  expect(selfServiceRoute).toContain('"data.deletion_prepare_v1"');
  expect(selfServiceRoute).toContain('"data.deletion_confirm_v1"');
  expect(selfServiceRoute).toContain('"data.deletion_cancel_v1"');
  expect(selfServiceRoute).toContain('"data.deletion_execute_v1"');
  expect(protocol).toContain("finalExecutionRequiresSeparateAction: true");
});

test("CR-001D · backend queda fail-closed y la UI monousuario no expone borrado", () => {
  expect(dataTrustContract).not.toContain('id: "workspace-deletion"');
  expect(dataTrustContract).not.toContain('id: "commercial-retention"');
  expect(dataTrustPage).not.toContain("WorkspaceDeletionPanel");
  expect(dataTrustPage).not.toContain("/api/data/deletion");
  expect(protocol).toContain("commercialPolicyConfigured: false");
  expect(protocol).toContain("productionActivated: false");
  expect(protocol).toContain("selfServiceExecutionEndpointExposed: true");
});
