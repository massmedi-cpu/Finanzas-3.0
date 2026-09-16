import {
  loadAnalysisSnapshot,
  type AnalysisSelectionInput,
} from "../../../src/application/analysis/analysis-loader";
import {
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex",
  "x-analysis-contract": "2",
};

function logGatewayError(scope: string, error: PersistenceGatewayError) {
  console.error(scope, {
    status: error.status,
    code: error.code ?? null,
  });
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    logGatewayError("analysis-api-gateway", error);
    return Response.json(
      { error: "analysis_unavailable", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: HEADERS,
      },
    );
  }

  const code = error instanceof Error ? error.message : "analysis_invalid_request";
  const invalid = code.startsWith("invalid_analysis_") || code.startsWith("invalid_financial_analysis_");
  const status = code === "analysis_reconciliation_failed" ? 503 : invalid ? 400 : 500;
  console.error("analysis-api", code);
  return Response.json(
    { error: status === 400 ? "invalid_request" : "analysis_unavailable", code },
    { status, headers: HEADERS },
  );
}

export async function GET(request: Request) {
  const started = performance.now();
  try {
    const { searchParams } = new URL(request.url);
    for (const key of searchParams.keys()) {
      if (!new Set(["month", "range", "accountId"]).has(key)) throw new Error("invalid_analysis_parameter");
    }

    const input: AnalysisSelectionInput = {
      month: searchParams.get("month"),
      range: searchParams.get("range"),
      accountId: searchParams.get("accountId"),
    };
    const snapshot = await loadAnalysisSnapshot(input);
    const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);

    return Response.json(snapshot, {
      headers: {
        ...HEADERS,
        "server-timing": `analysis;dur=${durationMs}`,
        "x-analysis-data-operations": "1",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
