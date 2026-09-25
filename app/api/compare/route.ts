import {
  loadComparisonSnapshot,
} from "../../../src/application/comparison/comparison-loader";
import type { ComparisonSelectionInput } from "../../../src/application/comparison/comparison-selection";
import {
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

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

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    console.error("comparison-api-gateway", {
      status: error.status,
      code: error.code ?? null,
    });
    return Response.json(
      { error: "comparison_unavailable", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: HEADERS,
      },
    );
  }

  const code = error instanceof Error ? error.message : "comparison_invalid_request";
  const invalid = code.startsWith("invalid_comparison_") || code === "comparison_period_too_large";
  const unavailable = code === "comparison_reconciliation_failed" || code === "comparison_gateway_period_mismatch";
  const status = invalid ? 400 : unavailable ? 503 : 500;
  console.error("comparison-api", code);
  return Response.json(
    { error: status === 400 ? "invalid_request" : "comparison_unavailable", code },
    { status, headers: HEADERS },
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
    return apiError(error);
  }
}
