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

test("REC-REL-491 · preview keeps read-only financial balance series and category impact without granting DML", () => {
  const edge = readFileSync("supabase/functions/financial-app-db-gateway/index.ts", "utf8");
  const financial = readFileSync("supabase/functions/financial-app-db-gateway/financial-logic.ts", "utf8");
  const category = readFileSync("supabase/functions/financial-app-db-gateway/categorization-rules.ts", "utf8");
  const financialApi = readFileSync("app/api/financial/route.ts", "utf8");
  const configurationApi = readFileSync("app/api/configuration/route.ts", "utf8");
  const allowlistMatch = edge.match(/const PREVIEW_READ_ONLY_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(allowlistMatch, "preview allowlist missing");
  const allowed = [...allowlistMatch[1].matchAll(/^\s*"([a-z][a-z._]+)",?\s*$/gm)].map(m => m[1]);
  const allowedSet = new Set(allowed);
  assert.equal(allowed.length, allowedSet.size, "duplicate allowlist values");
  for (const operation of ["financial.balance_series", "category.impact"]) {
    assert.equal(allowedSet.has(operation), true, "read-only product route inaccessible: " + operation);
  }
  for (const operation of ["test.transaction_split_engine", "transaction.split_save",
    "category.merge", "category.save", "account.save", "source.sync",
    "test.cleanup", "document.upload_finalize", "source.original_rows"]) {
    assert.equal(allowedSet.has(operation), false, "write/private route accidentally enabled: " + operation);
  }
  const financialRead = financial.slice(
    financial.indexOf('if (action === "financial.balance_series") {'),
    financial.indexOf('if (action === "financial.snapshot") {'),
  );
  assert.ok(financialRead.length > 60, "historical financial reader missing");
  assert.match(financialRead, /select financial_app\.financial_balance_series\(/);
  assert.doesNotMatch(financialRead, /\b(?:insert\s+into|update\s+financial_app|delete\s+from)\b/i);
  const impactRead = category.slice(
    category.indexOf('if (action === "category.impact") {'),
    category.indexOf('if (action === "rule.list")'),
  );
  assert.ok(impactRead.length > 100, "category impact reader missing");
  assert.match(impactRead, /select\s+[\s\S]*count\(\*\)::int/);
  assert.doesNotMatch(impactRead, /\b(?:insert\s+into|update\s+financial_app|delete\s+from)\b/i);
  assert.match(financialApi, /mode === "balance_series"/);
  assert.match(financialApi, /"financial\.balance_series"/);
  assert.match(configurationApi, /"category\.impact"/);
  const deny = edge.indexOf('if (identity.environment === "preview" && !isPreviewProductionAccessAllowed(action))');
  const connect = edge.indexOf('const databaseUrl = Deno.env.get("SUPABASE_DB_URL")');
  assert.ok(deny >= 0 && connect > deny, "reject mutating preview request before connecting DB");
});
