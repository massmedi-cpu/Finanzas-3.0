import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveGatewayTarget } from "../../src/infrastructure/persistence/release-gateway-target";
import { expect, test } from "@playwright/test";

// These are configuration contracts, not substitutes for real latency measurements.
// Financial App's data lives in Supabase eu-west-3 (Paris), and the Vercel
// gateway sends x-region=eu-west-3 to avoid intercontinental DB round trips.
test("REC-PERF-REGION-001 · server functions run in the same Paris area as financial data", () => {
  const root = process.cwd();
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
    regions?: string[];
    git?: { deploymentEnabled?: boolean };
  };
  const gateway = readFileSync(join(root,
    "src/infrastructure/persistence/vercel-supabase-gateway.ts"), "utf8");
  expect(vercel.regions).toEqual(["cdg1"]);
  expect(gateway).toContain('const SUPABASE_GATEWAY_REGION = "eu-west-3"');
  expect(gateway).toContain('"x-region": SUPABASE_GATEWAY_REGION');
  // Region affinity never authorizes automatic production deployment.
  expect(vercel.git?.deploymentEnabled).toBe(false);
});

test("REC-PERF-REGION-002 · region change keeps the protected production alias unchanged", () => {
  const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
    alias?: string[];
    regions?: string[];
  };
  expect(vercel.alias).toEqual(["financialapp-home.vercel.app"]);
  expect(vercel.regions).toHaveLength(1);
});

test("REC-REL-460 · new production and release preview use v3; legacy URL stays available for rollback", () => {
  const legacy = "https://synthetic.example/functions/v1/financial-app-db-gateway";
  const v3 = "https://synthetic.example/functions/v1/financial-app-db-gateway-candidate-619";
  const branch = "chat/integrated-b-e-c-visual-20261010";

  // The release uses v3 both before promotion and in its new production build.
  for (const environment of [
    { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: branch },
    { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_ENV: "production" },
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: branch },
  ]) {
    expect(resolveGatewayTarget(legacy, v3, environment)).toBe(v3);
  }

  // Unrelated previews and local development must not access the isolated v3.
  for (const environment of [
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "chat/other-branch" },
    { VERCEL_ENV: "development", VERCEL_GIT_COMMIT_REF: branch },
    { VERCEL_ENV: "preview" },
    {},
  ]) {
    expect(resolveGatewayTarget(legacy, v3, environment)).toBe(legacy);
  }

  const gateway = readFileSync(join(process.cwd(),
    "src/infrastructure/persistence/vercel-supabase-gateway.ts"), "utf8");
  expect(gateway).toContain("const SUPABASE_GATEWAY_URL = resolveGatewayTarget(");
  expect(gateway).toContain("/financial-app-db-gateway-candidate-619");
  expect(gateway).toContain('"https://btzukbfesxdratqnxuoj.supabase.co/functions/v1/financial-app-db-gateway"');
  // The previous 10.0.103 deployment is immutable and still contains its
  // own hardcoded v86 target; changing the resolver does not rewrite it.

  // Vercel preview identity is still read-only even with v3 selected.
  const edge = readFileSync(join(process.cwd(),
    "supabase/functions/financial-app-db-gateway/index.ts"), "utf8");
  expect(edge).toContain('identity.environment === "preview" && !isPreviewProductionAccessAllowed(action)');
  expect(edge).toContain('return json({ error: "preview_production_write_forbidden" }, 403)');
});
