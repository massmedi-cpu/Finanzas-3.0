import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("CR-001B · la orquestación destructiva sólo puede usar contexto servidor y preserva fuentes externas", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato CR-001B se valida una vez por run");

  const root = process.cwd();
  const handler = readFileSync(join(root, "supabase/functions/financial-app-db-gateway/workspace-deletion-intent.ts"), "utf8");
  const storage = readFileSync(join(root, "supabase/functions/financial-app-db-gateway/workspace-deletion-storage.ts"), "utf8");
  const protocol = readFileSync(join(root, "src/domain/workspace-deletion-protocol.ts"), "utf8");
  const trust = readFileSync(join(root, "src/domain/data-trust-contract.ts"), "utf8");
  const dbWorkflow = readFileSync(join(root, ".github/workflows/pre020-disposable-db-smoke.yml"), "utf8");
  const storageWorkflow = readFileSync(join(root, ".github/workflows/pre020-storage-runtime-rehearsal.yml"), "utf8");
  const previewWorkflow = readFileSync(join(root, ".github/workflows/rebuild-preview-e2e.yml"), "utf8");

  expect(handler).toContain('action !== "data.deletion_execute_v1"');
  expect(handler).toContain('environment !== "production"');
  expect(handler).toContain("financial_app.require_current_workspace_id()");
  expect(handler).toContain("financial_app.begin_workspace_deletion_execution");
  expect(handler).toContain("cleanupWorkspaceStorage(workspaceId)");
  expect(handler).toContain("financial_app.disconnect_google_oauth_connection()");
  expect(handler).toContain("financial_app.get_google_oauth_connection_status()");
  expect(handler).toContain("financial_app.record_workspace_deletion_external_cleanup");
  expect(handler).toContain("financial_app.finalize_workspace_deletion_local");
  expect(handler).not.toContain("payload?.workspaceId");
  expect(handler).not.toContain("payload?.storageCleanupVerified");
  expect(handler).not.toContain("payload?.vaultCleanupVerified");

  const begin = handler.indexOf("financial_app.begin_workspace_deletion_execution");
  const storageCleanup = handler.indexOf("cleanupWorkspaceStorage(workspaceId)");
  const vaultCleanup = handler.indexOf("financial_app.disconnect_google_oauth_connection()");
  const proof = handler.indexOf("financial_app.record_workspace_deletion_external_cleanup");
  const finalize = handler.indexOf("financial_app.finalize_workspace_deletion_local");
  expect(begin).toBeGreaterThan(-1);
  expect(storageCleanup).toBeGreaterThan(begin);
  expect(vaultCleanup).toBeGreaterThan(storageCleanup);
  expect(proof).toBeGreaterThan(vaultCleanup);
  expect(finalize).toBeGreaterThan(proof);

  expect(storage).toContain('const BUCKET = "financial-app-documents"');
  expect(storage).toContain("return `uploads/${workspaceId}`");
  expect(storage).toContain("entry.id === null");
  expect(storage).toContain("pending.push");
  expect(storage).toContain("MAX_FOLDER_DEPTH");
  expect(storage).toContain("MAX_DISCOVERED_ENTRIES");
  expect(storage).toContain("REMOVE_BATCH_SIZE = 1000");
  expect(storage).toContain(".remove(batch)");
  expect(storage).toContain("workspace_deletion_storage_scope_violation");
  expect(storage).toContain("workspace_deletion_storage_residue");

  expect(protocol).toContain("runtimeOrchestratorImplemented: true");
  expect(protocol).toContain("acceptsClientCleanupProof: false");
  expect(protocol).toContain('"official_bank_source"');
  expect(protocol).toContain('"google_drive_files"');
  expect(protocol).toContain("externalGoogleDriveMutationAllowed: false");
  expect(trust).toContain('state: "not_available"');

  for (const workflow of [dbWorkflow, storageWorkflow, previewWorkflow]) {
    expect(workflow).toContain("'commercial-readiness/**'");
  }
});
