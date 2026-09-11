import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const gatewaySource = readFileSync(
  "supabase/functions/financial-app-db-gateway/index.ts",
  "utf8",
);
const vercelGateSource = readFileSync("scripts/verify-vercel-source-runtime.mjs", "utf8");

function policySegment() {
  const start = gatewaySource.indexOf("const PREVIEW_READ_ONLY_ACTIONS");
  const end = gatewaySource.indexOf("function isPreviewProductionAccessAllowed");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return gatewaySource.slice(start, end);
}

test("PRE-003 Preview sólo puede alcanzar acciones read-only conocidas de Production", () => {
  const policy = policySegment();

  expect(policy).toContain('"health"');
  expect(policy).toContain('"source.capabilities"');
  expect(policy).toContain('"account.list"');
  expect(policy).toContain('"account.get"');
  expect(policy).toContain('"test.invariants"');
  expect(policy).toContain('"financial.period"');
  expect(policy).toContain('"financial.monthly"');
  expect(policy).toContain('"financial.balances"');
  expect(policy).toContain('"financial.snapshot"');
  expect(policy).not.toContain('"financial.accounts"');
  expect(policy).not.toContain('"financial.account"');
  expect(policy).not.toContain('"account.save"');
  expect(policy).not.toContain('"test.cleanup"');
  expect(policy).not.toContain('"test.source_ingestion"');
  expect(policy).not.toContain('"test.financial_logic_engine"');
  expect(policy).not.toContain('"test.forecast_engine"');
  expect(policy).not.toContain('"document.upload_sign"');
  expect(policy).not.toContain('"source.sync_batch"');
});

test("PRE-003 aplica el aislamiento antes de abrir PostgreSQL", () => {
  const bodyIndex = gatewaySource.indexOf("await readGatewayJsonBody(req)");
  const guardIndex = gatewaySource.indexOf(
    'identity.environment === "preview" && !isPreviewProductionAccessAllowed(action)',
  );
  const databaseIndex = gatewaySource.indexOf(
    'const databaseUrl = Deno.env.get("SUPABASE_DB_URL")',
  );

  expect(bodyIndex).toBeGreaterThanOrEqual(0);
  expect(guardIndex).toBeGreaterThan(bodyIndex);
  expect(databaseIndex).toBeGreaterThan(guardIndex);
  expect(gatewaySource).toContain('return json({ error: "preview_production_write_forbidden" }, 403)');
});

test("PRE-003 Vercel postbuild valida la frontera de workspace sin abrir lecturas anónimas", () => {
  expect(vercelGateSource).toContain("assertWorkspaceBoundary");
  expect(vercelGateSource).toContain('payload?.error !== "workspace_context_required"');
  expect(vercelGateSource).toContain("assertInvalidUserRejected");
  expect(vercelGateSource).toContain('payload?.error !== "workspace_user_invalid"');
  expect(vercelGateSource).toContain('action: "source.capabilities"');
  expect(vercelGateSource).toContain('action: "health"');
  expect(vercelGateSource).toContain('action: "test.invariants"');
  expect(vercelGateSource).toContain('action: "account.save"');
  expect(vercelGateSource).toContain('payload?.error !== "preview_production_write_forbidden"');
  expect(vercelGateSource).not.toContain('callAction(oidcToken, "source.capabilities")');
  expect(vercelGateSource).not.toContain('callAction(oidcToken, "health")');

  for (const forbidden of [
    "test.source_ingestion",
    "test.google_oauth_vault",
    "test.merchant_alias_engine",
    "test.categorization_rule_engine",
    "test.transaction_query_engine",
    "test.transaction_management_engine",
    "test.transaction_review_engine",
    "test.financial_logic_engine",
    "test.budget_engine",
    "test.recurrence_engine",
    "test.forecast_engine",
    "test.document_engine",
  ]) {
    expect(vercelGateSource).not.toContain(forbidden);
  }
});
