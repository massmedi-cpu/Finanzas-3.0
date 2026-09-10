import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("PRE-001 · el aislamiento cross-tenant es efectivo en gateway, RLS, constraints, Storage y funciones privilegiadas", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato de aislamiento se valida una vez por run");

  const root = process.cwd();
  const hardeningPath = join(root, "supabase/migrations/20260909193000_pre001_workspace_isolation.sql");
  const fkSemanticsPath = join(root, "supabase/migrations/20260909194500_pre001_workspace_fk_semantics.sql");
  const functionSurfacePath = join(root, "supabase/migrations/20260909200000_pre001_function_surface_lockdown.sql");
  const smokePath = join(root, "scripts/pre001-cross-tenant-smoke.sql");
  const edgeGatewayPath = join(root, "supabase/functions/financial-app-db-gateway/index.ts");
  const edgeWorkspacePath = join(root, "supabase/functions/financial-app-db-gateway/workspace-context.ts");
  const sourceSyncPath = join(root, "supabase/functions/financial-app-db-gateway/source-sync.ts");
  const documentLogicPath = join(root, "supabase/functions/financial-app-db-gateway/document-logic.ts");
  const googleOauthPath = join(root, "supabase/functions/financial-app-db-gateway/google-oauth.ts");

  expect(existsSync(hardeningPath), "PRE-001 exige una migración separada de hardening cross-tenant").toBe(true);
  expect(existsSync(fkSemanticsPath), "PRE-001 exige preservar la semántica de las FK legacy").toBe(true);
  expect(existsSync(functionSurfacePath), "PRE-001 exige cerrar la superficie ejecutable del esquema").toBe(true);
  expect(existsSync(smokePath), "PRE-001 exige una prueba DB ejecutable de dos tenants").toBe(true);
  expect(existsSync(edgeWorkspacePath), "PRE-001 exige una frontera Edge explícita de workspace").toBe(true);

  const migration = readFileSync(hardeningPath, "utf8").toLowerCase();
  const fkSemantics = readFileSync(fkSemanticsPath, "utf8").toLowerCase();
  const functionSurface = readFileSync(functionSurfacePath, "utf8").toLowerCase();
  const smoke = readFileSync(smokePath, "utf8").toLowerCase();
  const edgeGateway = readFileSync(edgeGatewayPath, "utf8").toLowerCase();
  const edgeWorkspace = readFileSync(edgeWorkspacePath, "utf8").toLowerCase();
  const sourceSync = readFileSync(sourceSyncPath, "utf8").toLowerCase();
  const documentLogic = readFileSync(documentLogicPath, "utf8").toLowerCase();
  const googleOauth = readFileSync(googleOauthPath, "utf8").toLowerCase();
  const edge = `${edgeGateway}\n${edgeWorkspace}`;

  expect(edgeGateway).toContain("resolveworkspacecontext");
  expect(edge).toContain("financial_app_gateway");
  expect(edge).toContain("set role financial_app_gateway");
  expect(edge).toContain("financial_app.workspace_id");
  expect(edge).toContain("workspace_context_required");
  expect(edgeWorkspace, "una conexión reciclada debe limpiar el rol anterior antes de consultar memberships").toContain("reset role");
  expect(edgeWorkspace).toContain("await clearworkspacescope(sql, true)");
  expect(edgeWorkspace.indexOf("await clearworkspacescope(sql, true)")).toBeLessThan(edgeWorkspace.indexOf("const usertoken"));

  expect(migration).toContain("current_workspace_id");
  expect(migration).toContain("require_current_workspace_id");
  expect(migration).toContain("alter column workspace_id set not null");
  expect(migration).toContain("enable row level security");
  expect(migration).toContain("create policy");
  expect(migration).toContain("workspace_reference_mismatch");

  expect(migration, "el rol del gateway no puede ser superusuario ni bypassrls").toContain("nobypassrls");
  expect(migration).toContain("nologin");

  expect(migration, "Documentos no debe conservar SECURITY DEFINER cuando no necesita Vault").toContain("security invoker");
  expect(migration, "Google OAuth debe seguir usando Vault pero quedar acotado por workspace").toContain("financial_app_google_refresh_token_");

  expect(functionSurface).toContain("revoke execute on all functions in schema financial_app from public");
  expect(functionSurface).toContain("revoke execute on all functions in schema financial_app from anon");
  expect(functionSurface).toContain("revoke execute on all functions in schema financial_app from authenticated");
  expect(functionSurface).toContain("pre001_unexpected_security_definer");
  expect(functionSurface).toContain("revoke all on table financial_app.workspace_memberships from financial_app_gateway");
  expect(functionSurface, "la fuente bancaria debe conservar mínimo privilegio además de triggers de inmutabilidad").toContain(
    "revoke update, delete on table financial_app.transaction_source_records from financial_app_gateway",
  );

  expect(migration).toContain("forecast_items_workspace_projection_key_unique");
  expect(migration).toContain("forecast_items_workspace_idempotency_key_unique");
  expect(migration).toContain("transaction_source_records_workspace_fingerprint_unique");
  expect(migration).toContain("merchants_workspace_name_unique");
  expect(migration).toContain("merchant_aliases_workspace_alias_unique");
  expect(migration).toContain("categories_workspace_name_per_level_unique");
  expect(migration).toContain("budgets_workspace_month_category_unique");

  expect(migration, "las proyecciones deben hacer upsert dentro del workspace").toContain("on conflict (workspace_id, projection_key)");
  expect(migration, "la idempotencia manual debe ser por workspace").toContain("on conflict (workspace_id, idempotency_key)");
  expect(migration, "los documentos no pueden colisionar globalmente entre tenants").toContain("on conflict (workspace_id, storage_provider, storage_key)");
  expect(sourceSync, "los cursores de la fuente deben hacer upsert por workspace").toContain("on conflict (workspace_id,source_file_id,source_sheet_id)");
  expect(googleOauth, "el singleton OAuth debe ser singleton sólo dentro del workspace").toContain("on conflict(workspace_id,id)");

  expect(documentLogic, "Storage debe estar físicamente namespaced por workspace").toContain("uploads/${workspaceid}/");
  expect(documentLogic).toContain("pathmatch[1].tolowercase() !== workspaceid.tolowercase()");

  expect(fkSemantics).toContain("on delete set null (");
  expect(fkSemantics).toContain("on delete cascade");
  expect(fkSemantics).toContain("on delete restrict");

  expect(smoke).toContain("set role financial_app_gateway");
  expect(smoke).toContain("pre001_rls_not_forced");
  expect(smoke).toContain("pre001_bank_source_mutation_privilege");
  expect(smoke).toContain("pre001_cross_tenant_read_leak");
  expect(smoke).toContain("pre001_cross_tenant_update_leak");
  expect(smoke).toContain("pre001_cross_tenant_reference_accepted");
  expect(smoke).toContain("pre001_direct_function_execute_leak");
  expect(smoke).toContain("rollback;");
  expect(smoke).toContain("pre001_cross_tenant_smoke_ok");

  expect(migration, "PRE-001 debe retirar las unicidades globales que impedirían tenants independientes").toContain("drop index if exists financial_app.accounts_unique_normalized_name");
  expect(migration).toContain("drop index if exists financial_app.transactions_source_row_identity_key");
});
