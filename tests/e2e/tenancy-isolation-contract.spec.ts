import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("PRE-001 · el aislamiento cross-tenant es efectivo en gateway, RLS, constraints y funciones privilegiadas", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato de aislamiento se valida una vez por run");

  const root = process.cwd();
  const hardeningPath = join(root, "supabase/migrations/20260909193000_pre001_workspace_isolation.sql");
  const edgeGatewayPath = join(root, "supabase/functions/financial-app-db-gateway/index.ts");

  expect(existsSync(hardeningPath), "PRE-001 exige una migración separada de hardening cross-tenant").toBe(true);

  const migration = readFileSync(hardeningPath, "utf8").toLowerCase();
  const edgeGateway = readFileSync(edgeGatewayPath, "utf8").toLowerCase();

  expect(edgeGateway).toContain("financial_app_gateway");
  expect(edgeGateway).toContain("set role financial_app_gateway");
  expect(edgeGateway).toContain("financial_app.workspace_id");
  expect(edgeGateway).toContain("workspace_context_required");

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

  expect(migration, "PRE-001 debe retirar las unicidades globales que impedirían tenants independientes").toContain("drop index if exists financial_app.accounts_unique_normalized_name");
  expect(migration).toContain("drop index if exists financial_app.transactions_source_row_identity_key");
});
