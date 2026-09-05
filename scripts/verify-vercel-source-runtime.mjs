import { gzipSync } from "node:zlib";
import { getVercelOidcToken } from "@vercel/oidc";

const SUPABASE_GATEWAY_URL =
  "https://btzukbfesxdratqnxuoj.supabase.co/functions/v1/financial-app-db-gateway";
const SUPABASE_GATEWAY_REGION = "eu-west-3";
const PROJECT_ID = "prj_SbZ64E02YhCK4ds24Yi7qf5CeQjo";
const TEAM_ID = "team_xrSskbkRKwQkyYc0vvLVGUnb";
const GZIP_THRESHOLD_BYTES = 64 * 1024;

function assertCapabilities(value, label) {
  if (
    !value ||
    value.contractVersion !== 2 ||
    value.sourceAccountLifecycle !== true ||
    value.canonicalProductSelection !== true
  ) {
    throw new Error(`${label}_capabilities_invalid`);
  }
}

async function callGateway(token, body, contentEncoding = null) {
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-region": SUPABASE_GATEWAY_REGION,
  };
  if (contentEncoding) headers["content-encoding"] = contentEncoding;

  const response = await fetch(SUPABASE_GATEWAY_URL, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.error) {
    throw new Error(`gateway_${response.status}_${payload?.error ?? "invalid_response"}`);
  }
  return payload;
}

async function callAction(token, action, payload = {}) {
  return callGateway(token, JSON.stringify({ action, payload }));
}

if (process.env.VERCEL !== "1") {
  console.log("VERCEL_SOURCE_RUNTIME_GATE|skipped=non_vercel_build");
  process.exit(0);
}

const environment = process.env.VERCEL_ENV ?? "unknown";
if (environment !== "preview" && environment !== "production") {
  throw new Error(`unsupported_vercel_environment_${environment}`);
}

const oidcToken = await getVercelOidcToken({
  project: PROJECT_ID,
  team: TEAM_ID,
  expirationBufferMs: 60_000,
});
if (!oidcToken) throw new Error("vercel_oidc_token_unavailable");

const plainPayload = await callAction(oidcToken, "source.capabilities");
assertCapabilities(plainPayload, "plain");

const gzipSource = JSON.stringify({
  action: "source.capabilities",
  payload: { transportProbe: "phase2-gzip-probe|".repeat(6000) },
});
const originalBytes = Buffer.byteLength(gzipSource, "utf8");
if (originalBytes < GZIP_THRESHOLD_BYTES) throw new Error("gzip_probe_below_threshold");
const gzipBody = gzipSync(gzipSource);
const gzipPayload = await callGateway(oidcToken, gzipBody, "gzip");
assertCapabilities(gzipPayload, "gzip");

const health = await callAction(oidcToken, "health");
if (health.status !== "ok" || health.database !== true || health.environment !== environment) {
  throw new Error("gateway_health_invalid");
}

let previewChecks = "not-applicable";
if (environment === "preview") {
  const invariants = await callAction(oidcToken, "test.invariants");
  if (
    invariants.accountReorderEngine !== true ||
    invariants.categoryReorderEngine !== true ||
    invariants.categoryMergeEngine !== true
  ) {
    throw new Error("gateway_invariants_invalid");
  }

  const ingestion = await callAction(oidcToken, "test.source_ingestion");
  if (ingestion.verified !== true || ingestion.clean !== true) {
    throw new Error("gateway_source_ingestion_not_clean");
  }
  const ingestionResidue = ingestion.residue ?? {};
  for (const key of ["accounts", "mappings", "sources", "transactions", "cursors"]) {
    if (ingestionResidue[key] !== 0) throw new Error(`gateway_source_ingestion_residue_${key}`);
  }

  const oauthVault = await callAction(oidcToken, "test.google_oauth_vault");
  if (oauthVault.verified !== true || oauthVault.clean !== true) {
    throw new Error("gateway_google_oauth_vault_not_clean");
  }

  const merchantAlias = await callAction(oidcToken, "test.merchant_alias_engine");
  if (merchantAlias.verified !== true || merchantAlias.clean !== true) {
    throw new Error("gateway_merchant_alias_engine_not_clean");
  }
  const merchantAliasResidue = merchantAlias.residue ?? {};
  for (const key of ["merchants", "aliases", "categories"]) {
    if (merchantAliasResidue[key] !== 0) throw new Error(`gateway_merchant_alias_residue_${key}`);
  }

  const ruleEngine = await callAction(oidcToken, "test.categorization_rule_engine");
  if (ruleEngine.verified !== true || ruleEngine.clean !== true || !ruleEngine.deterministicRuleId) {
    throw new Error("gateway_categorization_rule_engine_not_clean");
  }
  const ruleResidue = ruleEngine.residue ?? {};
  for (const key of ["accounts", "categories", "merchants", "aliases", "rules", "sources", "transactions", "overrides"]) {
    if (ruleResidue[key] !== 0) throw new Error(`gateway_rule_engine_residue_${key}`);
  }

  const transactionQuery = await callAction(oidcToken, "test.transaction_query_engine");
  if (transactionQuery.verified !== true || transactionQuery.clean !== true) {
    throw new Error("gateway_transaction_query_engine_not_clean");
  }
  const transactionQueryResidue = transactionQuery.residue ?? {};
  for (const key of ["accounts", "categories", "merchants", "sources", "transactions", "overrides"]) {
    if (transactionQueryResidue[key] !== 0) throw new Error(`gateway_transaction_query_residue_${key}`);
  }

  previewChecks = "invariants+ingestion+vault+merchant-alias+rules+transactions=ok";
}

console.log(
  `VERCEL_SOURCE_RUNTIME_GATE|environment=${environment}|plain=ok|gzip=ok|health=ok|${previewChecks}|contract=2|original_bytes=${originalBytes}|gzip_bytes=${gzipBody.byteLength}|region=${SUPABASE_GATEWAY_REGION}`,
);
