import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const gatewaySource = readFileSync(
  "supabase/functions/financial-app-db-gateway/index.ts",
  "utf8",
);

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
  expect(policy).not.toContain('"account.save"');
  expect(policy).not.toContain('"test.cleanup"');
  expect(policy).not.toContain('"test.source_ingestion"');
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