import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const gatewayIndex = readFileSync("supabase/functions/financial-app-db-gateway/index.ts", "utf8");
const sourceRouter = readFileSync("supabase/functions/financial-app-db-gateway/source-sync-router.ts", "utf8");
const handler = readFileSync("supabase/functions/financial-app-db-gateway/workspace-deletion-readiness.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260910070000_pre020_workspace_deletion_readiness.sql", "utf8");
const protocol = readFileSync("src/domain/workspace-deletion-protocol.ts", "utf8");
const dataTrustPage = readFileSync("app/configuration/data/page.tsx", "utf8");
const dataTrustContract = readFileSync("src/domain/data-trust-contract.ts", "utf8");

const ACTION = "data.deletion_readiness_v1";

test("PRE-020F · readiness no entra en Preview→Production", () => {
  const start = gatewayIndex.indexOf("const PREVIEW_READ_ONLY_ACTIONS");
  const end = gatewayIndex.indexOf("]);", start);
  expect(gatewayIndex.slice(start, end + 3)).not.toContain(ACTION);
});

test("PRE-020F · readiness es invoker, owner/RLS heredado y siempre fail-closed", () => {
  expect(migration).toContain("financial_app.workspace_deletion_impact()");
  expect(migration).toContain("security invoker");
  expect(migration).toContain("stable");
  expect(migration).toContain("'canExecute', false");
  expect(migration).toContain("'destructiveOperationExecuted', false");
  expect(migration.toLowerCase()).not.toMatch(/\bdelete\s+from\b/);
  expect(migration.toLowerCase()).not.toMatch(/\bupdate\s+financial_app\b/);
  expect(migration.toLowerCase()).not.toMatch(/\binsert\s+into\s+financial_app\b/);
});

test("PRE-020F · los bloqueos de readiness son los mismos del contrato de ejecución", () => {
  for (const blocker of [
    "destructive_executor_not_implemented",
    "supabase_storage_runtime_cleanup_not_validated",
    "post_deletion_receipt_retention_policy_not_defined",
    "production_activation_not_approved",
  ]) {
    expect(migration).toContain(blocker);
    expect(protocol).toContain(blocker);
  }
  expect(migration).toContain("workspace_deletion_intent_not_confirmed");
  expect(migration).toContain("'officialBankSource', 'untouched'");
  expect(migration).toContain("'googleDriveFiles', 'untouched'");
});

test("PRE-020F · Edge y API sólo diagnostican en Production y rechazan payload no fail-closed", () => {
  expect(sourceRouter).toContain('import { handleWorkspaceDeletionReadinessAction } from "./workspace-deletion-readiness.ts"');
  expect(sourceRouter).toContain("await handleWorkspaceDeletionReadinessAction(input)");
  expect(handler).toContain(ACTION);
  expect(handler).toContain('environment !== "production"');
  expect(handler).toContain("readiness.canExecute !== false");
  expect(handler).not.toContain("data.deletion_execute_v1");
});

test("PRE-020F · Preview/Local devuelven 403 real con headers seguros", async ({ request }) => {
  const response = await request.get("/api/data/deletion-readiness");
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await response.json()).toEqual({
    error: "workspace_deletion_readiness_production_only",
    code: "preview_production_deletion_readiness_forbidden",
  });
});

test("PRE-020F · no activa executor, UI ni contrato comercial", () => {
  expect(existsSync("app/api/data/deletion-execute/route.ts")).toBe(false);
  expect(sourceRouter).not.toContain("handleWorkspaceDeletionExecutionAction");
  expect(dataTrustPage).not.toContain(ACTION);
  expect(dataTrustPage).not.toContain("/api/data/deletion-readiness");
  expect(dataTrustPage).not.toContain("data.deletion_execute_v1");
  expect(dataTrustContract).toMatch(/id:\s*"workspace-deletion"[\s\S]{0,1200}?state:\s*"not_available"/);
});
