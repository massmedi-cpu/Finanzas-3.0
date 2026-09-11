import { APP_VERSION } from "../../../../src/core/build-info";
import {
  parseOperationalTelemetry,
  webVitalWithinBudget,
} from "../../../../src/observability/operational-telemetry-contract";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
};
const MAX_BODY_BYTES = 2_048;

function jsonError(error: string, status: number) {
  return Response.json({ error, code: null }, { status, headers: HEADERS });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonError("unsupported_media_type", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonError("payload_too_large", 413);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("invalid_request", 400);
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonError("payload_too_large", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const telemetry = parseOperationalTelemetry(body);
  if (!telemetry) return jsonError("invalid_telemetry", 400);

  // Preview, CI y desarrollo validan el contrato pero nunca contaminan la muestra RUM real.
  if (process.env.VERCEL_ENV !== "production") {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  const common = {
    contractVersion: 1,
    appVersion: APP_VERSION,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    route: telemetry.route,
  };

  if (telemetry.type === "web_vital") {
    console.info("financial-app-rum", JSON.stringify({
      ...common,
      metric: telemetry.name,
      value: telemetry.value,
      rating: telemetry.rating,
      budget: telemetry.name,
      withinBudget: webVitalWithinBudget(telemetry.name, telemetry.value),
    }));
  } else {
    console.info("financial-app-client-error", JSON.stringify({
      ...common,
      kind: telemetry.kind,
      errorName: telemetry.errorName,
    }));
  }

  return new Response(null, { status: 204, headers: HEADERS });
}
