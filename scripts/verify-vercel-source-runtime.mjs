import { gzipSync } from "node:zlib";
import { getVercelOidcToken } from "@vercel/oidc";

const SUPABASE_GATEWAY_URL =
  "https://btzukbfesxdratqnxuoj.supabase.co/functions/v1/financial-app-db-gateway";
const SUPABASE_GATEWAY_REGION = "eu-west-3";
const PROJECT_ID = "prj_SbZ64E02YhCK4ds24Yi7qf5CeQjo";
const TEAM_ID = "team_xrSskbkRKwQkyYc0vvLVGUnb";
const GZIP_THRESHOLD_BYTES = 64 * 1024;

async function requestGateway(token, body, contentEncoding = null, extraHeaders = {}) {
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-region": SUPABASE_GATEWAY_REGION,
    ...extraHeaders,
  };
  if (contentEncoding) headers["content-encoding"] = contentEncoding;

  const response = await fetch(SUPABASE_GATEWAY_URL, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function assertWorkspaceBoundary(token, body, label, contentEncoding = null) {
  const { response, payload } = await requestGateway(token, body, contentEncoding);
  if (response.status !== 403 || payload?.error !== "workspace_context_required") {
    throw new Error(
      `${label}_workspace_boundary_invalid_${response.status}_${payload?.error ?? "invalid_response"}`,
    );
  }
}

async function assertInvalidUserRejected(token) {
  const { response, payload } = await requestGateway(
    token,
    JSON.stringify({ action: "health", payload: {} }),
    null,
    { "x-financial-app-user-token": "invalid-build-probe-token" },
  );
  if (response.status !== 401 || payload?.error !== "workspace_user_invalid") {
    throw new Error(
      `gateway_invalid_user_not_rejected_${response.status}_${payload?.error ?? "invalid_response"}`,
    );
  }
}

async function assertPreviewWriteBlocked(token) {
  const { response, payload } = await requestGateway(
    token,
    JSON.stringify({ action: "account.save", payload: {} }),
  );
  if (response.status !== 403 || payload?.error !== "preview_production_write_forbidden") {
    throw new Error(
      `gateway_preview_write_not_blocked_${response.status}_${payload?.error ?? "invalid_response"}`,
    );
  }
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

// PRE-001+ security boundary: Vercel OIDC authenticates the calling deployment, but it
// must never be sufficient to read workspace-scoped data. Build-time probes therefore
// verify the fail-closed user/workspace boundary instead of bypassing it with a user token.
await assertWorkspaceBoundary(
  oidcToken,
  JSON.stringify({ action: "source.capabilities", payload: {} }),
  "plain",
);

const gzipSource = JSON.stringify({
  action: "source.capabilities",
  payload: { transportProbe: "phase2-gzip-probe|".repeat(6000) },
});
const originalBytes = Buffer.byteLength(gzipSource, "utf8");
if (originalBytes < GZIP_THRESHOLD_BYTES) throw new Error("gzip_probe_below_threshold");
const gzipBody = gzipSync(gzipSource);
await assertWorkspaceBoundary(oidcToken, gzipBody, "gzip", "gzip");

await assertWorkspaceBoundary(
  oidcToken,
  JSON.stringify({ action: "health", payload: {} }),
  "health",
);
await assertInvalidUserRejected(oidcToken);

let previewChecks = "not-applicable";
if (environment === "preview") {
  await assertWorkspaceBoundary(
    oidcToken,
    JSON.stringify({ action: "test.invariants", payload: {} }),
    "invariants",
  );
  await assertPreviewWriteBlocked(oidcToken);
  previewChecks = "invariants_boundary=ok|normal_write=blocked";
}

console.log(
  `VERCEL_SOURCE_RUNTIME_GATE|environment=${environment}|oidc=ok|workspace_boundary=ok|gzip_boundary=ok|health_boundary=ok|invalid_user=blocked|${previewChecks}|original_bytes=${originalBytes}|gzip_bytes=${gzipBody.byteLength}|region=${SUPABASE_GATEWAY_REGION}`,
);
