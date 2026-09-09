import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("PRE-001 · ownership real se resuelve por workspace y conserva doble identidad usuario + Vercel", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato de tenancy se valida una vez por run");

  const root = process.cwd();
  const workspaceContextPath = join(root, "src/domain/workspace-context.ts");
  const workspaceSessionPath = join(root, "src/infrastructure/auth/workspace-session.ts");
  const migrationPath = join(root, "supabase/migrations/20260909185000_pre001_workspace_tenancy.sql");
  const nextGatewayPath = join(root, "src/infrastructure/persistence/vercel-supabase-gateway.ts");
  const edgeGatewayPath = join(root, "supabase/functions/financial-app-db-gateway/index.ts");

  expect(existsSync(workspaceContextPath), "PRE-001 exige WorkspaceContext explícito").toBe(true);
  expect(existsSync(workspaceSessionPath), "PRE-001 exige resolver usuario/workspace desde la sesión autenticada").toBe(true);
  expect(existsSync(migrationPath), "PRE-001 exige una migración aditiva y versionada").toBe(true);

  const workspaceContext = readFileSync(workspaceContextPath, "utf8");
  const workspaceSession = readFileSync(workspaceSessionPath, "utf8");
  const migration = readFileSync(migrationPath, "utf8");
  const nextGateway = readFileSync(nextGatewayPath, "utf8");
  const edgeGateway = readFileSync(edgeGatewayPath, "utf8");

  expect(workspaceContext).toContain("WorkspaceContext");
  expect(workspaceContext).toContain("workspaceId");
  expect(workspaceContext).toContain("userId");

  expect(workspaceSession).toContain("AUTH_ACCESS_COOKIE");
  expect(workspaceSession).toContain("resolveWorkspaceSession");

  expect(nextGateway).toContain("x-financial-app-user-token");
  expect(edgeGateway).toContain("resolveWorkspaceContext");
  expect(edgeGateway).toContain("workspaceContext");

  expect(migration).toContain("financial_app.workspaces");
  expect(migration).toContain("financial_app.workspace_memberships");
  expect(migration).toContain("workspace_id");
  expect(migration).toContain("accounts_workspace_normalized_name_unique");
  expect(migration).toContain("transactions_workspace_source_row_identity_unique");
  expect(migration).toContain("documents_workspace_storage_identity_unique");
  expect(migration).toContain("sync_cursors_workspace_pkey");

  expect(migration, "el tenant personal existente debe ser backfilled, no recreado ni borrado").toContain(
    "pre001_personal_workspace_backfill",
  );
  expect(migration, "PRE-001 debe impedir referencias cruzadas entre workspaces").toContain(
    "workspace_reference_mismatch",
  );
});
