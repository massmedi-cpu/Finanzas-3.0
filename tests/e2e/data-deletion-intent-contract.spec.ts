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
const protocol = readFileSync("src/domain/workspace-deletion-protocol.ts", "utf8");
const dataTrustPage = readFileSync("app/configuration/data/page.tsx", "utf8");
const dataTrustContract = readFileSync("src/domain/data-trust-contract.ts", "utf8");

const ACTIONS = [
  "data.deletion_prepare_v1",
  "data.deletion_confirm_v1",
  "data.deletion_cancel_v1",
];

test("PRE-020D · ninguna acción del protocolo entra en Preview→Production", () => {
  const start = gatewayIndex.indexOf("const PREVIEW_READ_ONLY_ACTIONS");
  const end = gatewayIndex.indexOf("]);", start);
  const previewAllowlist = gatewayIndex.slice(start, end + 3);
  for (const action of ACTIONS) expect(previewAllowlist).not.toContain(action);
});

test("PRE-020D · la máquina de estados es RLS, invoker e incapaz de borrar", () => {
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

test("PRE-020D · Edge sólo expone prepare/confirm/cancel internos y no existe executor", () => {
  expect(sourceRouter).toContain(
    'import { handleWorkspaceDeletionIntentAction } from "./workspace-deletion-intent.ts"',
  );
  expect(sourceRouter).toContain("await handleWorkspaceDeletionIntentAction(input)");
  for (const action of ACTIONS) expect(handler).toContain(action);
  expect(handler).toContain('environment !== "production"');
  expect(handler).not.toContain("data.deletion_execute_v1");
});

test("PRE-020D · el contrato preserva fuentes externas y bloquea ejecución prematura", () => {
  expect(protocol).toContain('"foundation_non_destructive"');
  expect(protocol).toContain('"official_bank_source"');
  expect(protocol).toContain('"google_drive_files"');
  expect(protocol).toContain('"destructive_executor_not_implemented"');
  expect(protocol).toContain('"post_deletion_receipt_retention_policy_not_defined"');
  expect(protocol).toContain('"production_activation_not_approved"');
});

test("PRE-020D · UI y contrato comercial siguen declarando borrado no disponible", () => {
  expect(dataTrustContract).toContain('id: "workspace-deletion"');
  expect(dataTrustContract).toContain('state: "not_available"');
  for (const action of ACTIONS) expect(dataTrustPage).not.toContain(action);
  expect(dataTrustPage).not.toContain("workspace-deletion-intent");
});
