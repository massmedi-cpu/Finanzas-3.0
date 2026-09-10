import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const gatewayIndex = readFileSync(
  "supabase/functions/financial-app-db-gateway/index.ts",
  "utf8",
);
const workspaceContext = readFileSync(
  "supabase/functions/financial-app-db-gateway/workspace-context.ts",
  "utf8",
);
const sourceRouter = readFileSync(
  "supabase/functions/financial-app-db-gateway/source-sync-router.ts",
  "utf8",
);
const impactHandler = readFileSync(
  "supabase/functions/financial-app-db-gateway/workspace-deletion-impact.ts",
  "utf8",
);
const impactMigration = readFileSync(
  "supabase/migrations/20260910050000_pre020_workspace_deletion_impact.sql",
  "utf8",
);
const impactRoute = readFileSync("app/api/data/deletion-impact/route.ts", "utf8");
const dataTrustPage = readFileSync("app/configuration/data/page.tsx", "utf8");
const dataTrustContract = readFileSync("src/domain/data-trust-contract.ts", "utf8");

test("PRE-020C · deletion impact queda fuera de la allowlist Preview→Production", () => {
  const start = gatewayIndex.indexOf("const PREVIEW_READ_ONLY_ACTIONS");
  const end = gatewayIndex.indexOf("]);", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const previewAllowlist = gatewayIndex.slice(start, end + 3);
  expect(previewAllowlist).not.toContain("data.deletion_impact_v1");
});

test("PRE-020C · Edge resuelve role/count antes de SET ROLE y limpia el contexto reciclado", () => {
  expect(workspaceContext).toContain("active_membership_count");
  expect(workspaceContext).toContain("financial_app.workspace_role");
  expect(workspaceContext).toContain("financial_app.workspace_membership_count");
  expect(workspaceContext).toContain("await sql.unsafe(\"set role financial_app_gateway\")");
  const membershipQuery = workspaceContext.indexOf("from financial_app.workspace_memberships m");
  const setRole = workspaceContext.indexOf('await sql.unsafe("set role financial_app_gateway")');
  expect(membershipQuery).toBeGreaterThanOrEqual(0);
  expect(setRole).toBeGreaterThanOrEqual(0);
  expect(membershipQuery).toBeGreaterThan(setRole);
  expect(workspaceContext.match(/set_config\('financial_app\.workspace_role'/g)?.length).toBe(2);
  expect(workspaceContext.match(/set_config\('financial_app\.workspace_membership_count'/g)?.length).toBe(2);
});

test("PRE-020C · el manifiesto sigue SECURITY INVOKER y no recupera lectura de memberships", () => {
  expect(impactMigration).toContain("financial_app.require_current_workspace_id()");
  expect(impactMigration).toContain("financial_app.workspace_role");
  expect(impactMigration).toContain("workspace_owner_required");
  expect(impactMigration).toContain("security invoker");
  expect(impactMigration).not.toContain("security definer");
  expect(impactMigration).not.toContain("from financial_app.workspace_memberships");
  expect(impactMigration).toContain("'destructiveOperationExecuted', false");
  expect(impactMigration).toContain("'officialBankSource', 'untouched'");
  expect(impactMigration).toContain("'googleDriveFiles', 'untouched'");
  expect(impactMigration).toContain("'oauthRefreshTokenSecrets', 'would_require_vault_cleanup_before_delete'");
  expect(impactMigration.toLowerCase()).not.toMatch(/\bdelete\s+from\b/);
});

test("PRE-020C · gateway y API sólo permiten consultar el manifiesto en Production", () => {
  expect(sourceRouter).toContain(
    'import { handleWorkspaceDeletionImpactAction } from "./workspace-deletion-impact.ts"',
  );
  expect(sourceRouter).toContain("await handleWorkspaceDeletionImpactAction(input)");
  expect(impactHandler).toContain('input.action !== "data.deletion_impact_v1"');
  expect(impactHandler).toContain('input.environment !== "production"');
  expect(impactHandler).toContain("financial_app.workspace_deletion_impact()");
  expect(impactRoute).toContain('process.env.VERCEL_ENV !== "production"');
  expect(impactRoute).toContain('"data.deletion_impact_v1"');
  expect(impactRoute).toContain('"cache-control": "no-store"');
  expect(impactRoute).toContain('"x-content-type-options": "nosniff"');
});

test("PRE-020C · el endpoint ejecutado rechaza local/Preview sin tocar datos", async ({ request }) => {
  const response = await request.get("/api/data/deletion-impact");
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await response.json()).toEqual({
    error: "data_deletion_impact_production_only",
    code: "preview_production_deletion_impact_forbidden",
  });
});

test("PRE-020C · la UI sigue declarando borrado no disponible y no expone el endpoint", () => {
  expect(dataTrustContract).toContain('id: "workspace-deletion"');
  expect(dataTrustContract).toContain('state: "not_available"');
  expect(dataTrustPage).not.toContain("/api/data/deletion-impact");
  expect(dataTrustPage).not.toContain("data.deletion_impact_v1");
});
