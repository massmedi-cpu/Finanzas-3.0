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

const plainPayload = await callGateway(
  oidcToken,
  JSON.stringify({ action: "source.capabilities", payload: {} }),
);
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

console.log(
  `VERCEL_SOURCE_RUNTIME_GATE|environment=${environment}|plain=ok|gzip=ok|contract=2|original_bytes=${originalBytes}|gzip_bytes=${gzipBody.byteLength}|region=${SUPABASE_GATEWAY_REGION}`,
);
