import {
  loadComparisonSnapshot,
} from "../../../src/application/comparison/comparison-loader";
import type { ComparisonSelectionInput } from "../../../src/application/comparison/comparison-selection";
import {
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { logPersistenceGatewayFailure } from "../../../src/infrastructure/persistence/gateway-observability";

export const dynamic = "force-dynamic";

const ALLOWED_PARAMETERS = new Set([
  "primaryFrom",
  "primaryTo",
  "referenceFrom",
  "referenceTo",
  "accountId",
]);

const HEADERS = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex",
  "x-comparison-contract": "1",
};

export function apiError(error: unknown, started: number) {
  const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);
  const responseHeaders = { ...HEADERS, "server-timing": "comparison;dur=" + durationMs };
  if (error instanceof PersistenceGatewayError) {
    logPersistenceGatewayFailure("comparison-api-gateway", error);
    return Response.json(
      { error: "comparison_unavailable", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: responseHeaders,
      },
    );
  }

  const code = error instanceof Error ? error.message : "";
  const invalid = /^invalid_comparison_[a-z0-9_]+$/.test(code) || code === "comparison_period_too_large";
  const unavailable = code === "comparison_reconciliation_failed" || code === "comparison_gateway_period_mismatch";
  const status = invalid ? 400 : unavailable ? 503 : 500;
  console.error("comparison-api", status === 500 ? error instanceof Error ? error.name : typeof error : code);
  return Response.json(
    { error: status === 400 ? "invalid_request" : "comparison_unavailable", code: status === 500 ? null : code },
    { status, headers: responseHeaders },
  );
}

export async function GET(request: Request) {
  const started = performance.now();
  try {
    const { searchParams } = new URL(request.url);
    for (const key of searchParams.keys()) {
      if (!ALLOWED_PARAMETERS.has(key) || searchParams.getAll(key).length !== 1) {
        throw new Error("invalid_comparison_parameter");
      }
    }

    const input: ComparisonSelectionInput = {
      primaryFrom: searchParams.get("primaryFrom"),
      primaryTo: searchParams.get("primaryTo"),
      referenceFrom: searchParams.get("referenceFrom"),
      referenceTo: searchParams.get("referenceTo"),
      accountId: searchParams.get("accountId"),
    };
    const snapshot = await loadComparisonSnapshot(input);
    const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);

    return Response.json(snapshot, {
      headers: {
        ...HEADERS,
        "server-timing": `comparison;dur=${durationMs}`,
        "x-comparison-data-operations": "1",
      },
    });
  } catch (error) {
    return apiError(error, started);
  }
}
