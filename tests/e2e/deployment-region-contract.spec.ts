import { readFileSync } from "node:fs";
import { join } from "node:path";
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
