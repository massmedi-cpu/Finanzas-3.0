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

test("REC-REL-456 · CI aislada redirige ambos gateways, nunca tráfico externo", () => {
  const shim = readFileSync("scripts/aud-e2e-local-network.cjs", "utf8");
  assert.match(shim, /financial-app-db-gateway-candidate-619/);
  assert.match(shim, /const gateway = gatewayUrls\.has\(url\.href\)/);
  assert.match(shim, /AUD_EXTERNAL_NETWORK_FORBIDDEN/);
});

test("REC-REL-489 · protected preview must deny temporary transaction-split DML, even when test normally rolls back", () => {
  const edge = readFileSync("supabase/functions/financial-app-db-gateway/index.ts", "utf8");
  const handler = readFileSync("supabase/functions/financial-app-db-gateway/transaction-management.ts", "utf8");
  const match = edge.match(/const PREVIEW_READ_ONLY_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(match, "missing exact preview allowlist");
  const actions = [...match[1].matchAll(/^\s*"([a-z][a-z._]+)",?\s*$/gm)].map(row => row[1]);
  const allowed = new Set(actions);
  assert.equal(allowed.size, actions.length, "duplicate preview actions");
  for (const action of ["source.capabilities", "health", "account.list",
    "transaction.query", "transaction.split_detail", "test.invariants",
    "source.postflight_rows"]) {
    assert.ok(allowed.has(action), "read path unexpectedly removed: " + action);
  }
  for (const action of ["test.transaction_split_engine", "transaction.split_save",
    "transaction.transfer_pair", "source.sync", "source.original_rows",
    "document.upload_finalize", "test.cleanup"]) {
    assert.equal(allowed.has(action), false, "mutable or private probe must be denied: " + action);
  }
  // The excluded probe actually changes the restored business tables inside
  // sql.begin before deliberately throwing to roll back. Rollback after DML
  // is not equivalent to never executing DML on the shared production DB.
  assert.match(handler, /if \(action === "test\.transaction_split_engine"\)/);
  assert.match(handler, /financial_app\.save_transaction_split\(/);
  assert.match(handler, /__ROLLBACK_TRANSACTION_SPLIT_TEST__/);
  assert.match(edge, /identity\.environment === "preview" && !isPreviewProductionAccessAllowed\(action\)/);
  assert.match(edge, /preview_production_write_forbidden/);
});
