import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveGatewayTarget } from "../../src/infrastructure/persistence/release-gateway-target.ts";
import {
  assertSourceSyncRuntimeCapabilities,
  SourceSyncRuntimeCompatibilityError,
} from "../../src/application/source-sync-runtime-contract.ts";

const legacy = "https://example.invalid/functions/v1/financial-app-db-gateway";
const v3 = "https://example.invalid/functions/v1/financial-app-db-gateway-candidate-619";
const releaseBranch = "chat/integrated-b-e-c-visual-20261010";
const route = (env) => resolveGatewayTarget(legacy, v3, env);

test("REC-REL-455 · producción nueva elige el gateway v3 sin sustituir v86", () => {
  assert.equal(route({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }), v3);
  assert.equal(route({ VERCEL_ENV: "production" }), v3);
});

test("REC-REL-455 · preview certificada y solo ella elige el gateway v3", () => {
  assert.equal(route({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: releaseBranch }), v3);
});

test("REC-REL-455 · otras previews, local y metadatos incompletos permanecen en gateway anterior", () => {
  assert.equal(route({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" }), legacy);
  assert.equal(route({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "other" }), legacy);
  assert.equal(route({ VERCEL_ENV: "development", VERCEL_GIT_COMMIT_REF: releaseBranch }), legacy);
  assert.equal(route({ VERCEL_GIT_COMMIT_REF: releaseBranch }), legacy);
  assert.equal(route({}), legacy);
});

test("REC-REL-455 · la nueva web exige runtime v3 con postflight íntegro", () => {
  const capabilities = {
    contractVersion: 3,
    sourceAccountLifecycle: true,
    canonicalProductSelection: true,
    sourcePostflightRows: true,
    sourceImmutableOriginalRows: true,
  };
  assert.doesNotThrow(() => assertSourceSyncRuntimeCapabilities(capabilities));
  assert.throws(() => assertSourceSyncRuntimeCapabilities({ ...capabilities, contractVersion: 2 }),
    SourceSyncRuntimeCompatibilityError);
  assert.throws(() => assertSourceSyncRuntimeCapabilities({ ...capabilities, sourcePostflightRows: false }),
    SourceSyncRuntimeCompatibilityError);
  assert.throws(() => assertSourceSyncRuntimeCapabilities(null), SourceSyncRuntimeCompatibilityError);
});

test("REC-REL-455 · mantiene ambas URL literales y el bloqueo de escritura en previews", () => {
  const gatewayClient = readFileSync("src/infrastructure/persistence/vercel-supabase-gateway.ts", "utf8");
  const edge = readFileSync("supabase/functions/financial-app-db-gateway/index.ts", "utf8");
  const source = readFileSync("supabase/functions/financial-app-db-gateway/source-sync.ts", "utf8");
  assert.match(gatewayClient, /\/financial-app-db-gateway"/);
  assert.match(gatewayClient, /\/financial-app-db-gateway-candidate-619"/);
  assert.match(edge, /contractVersion:\s*3/);
  assert.match(edge, /sourcePostflightRows:\s*true/);
  assert.match(edge, /sourceImmutableOriginalRows:\s*identity\.environment === "production"/);
  assert.match(edge, /identity\.environment === "preview" && !isPreviewProductionAccessAllowed\(action\)/);
  assert.match(source, /if \(environment !== "production"\)/);
  assert.match(source, /if \(action === "source\.original_rows"\)/);
});
