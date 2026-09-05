import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  SOURCE_SYNC_RUNTIME_CONTRACT_VERSION,
  SourceSyncRuntimeCompatibilityError,
  assertSourceSyncRuntimeCapabilities,
} from "../../src/application/source-sync-runtime-contract";

test("acepta únicamente el runtime de sincronización v2 con lifecycle y selección canónica", () => {
  const capabilities = {
    contractVersion: SOURCE_SYNC_RUNTIME_CONTRACT_VERSION,
    sourceAccountLifecycle: true,
    canonicalProductSelection: true,
  };

  expect(() => assertSourceSyncRuntimeCapabilities(capabilities)).not.toThrow();
});

test("rechaza de forma fail-closed un runtime antiguo o incompleto", () => {
  const oldRuntime = {
    contractVersion: 1,
    sourceAccountLifecycle: false,
    canonicalProductSelection: false,
  };

  expect(() => assertSourceSyncRuntimeCapabilities(oldRuntime)).toThrow(
    SourceSyncRuntimeCompatibilityError,
  );
  expect(() => assertSourceSyncRuntimeCapabilities(null)).toThrow(
    SourceSyncRuntimeCompatibilityError,
  );
});

test("mantiene el gateway de persistencia colocado junto a PostgreSQL en eu-west-3", () => {
  const gatewaySource = readFileSync(
    "src/infrastructure/persistence/vercel-supabase-gateway.ts",
    "utf8",
  );

  expect(gatewaySource).toContain('const SUPABASE_GATEWAY_REGION = "eu-west-3";');
  expect(gatewaySource).toContain('"x-region": SUPABASE_GATEWAY_REGION');
});
