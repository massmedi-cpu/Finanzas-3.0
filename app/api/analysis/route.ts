import { publicGatewayErrorCode } from "../../../src/infrastructure/http/gateway-public-error";
import {
  loadAnalysisSnapshot,
  type AnalysisSelectionInput,
} from "../../../src/application/analysis/analysis-loader";
import { prepareAnalysisPresentationSnapshot } from "../../../src/application/analysis/analysis-presentation";
import {
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { logPersistenceGatewayFailure } from "../../../src/infrastructure/persistence/gateway-observability";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex",
  "x-analysis-contract": "2",
};

const ALLOWED_QUERY_KEYS = new Set([
  "month",
  "range",
  "accountId",
  "periodMode",
  "year",
  "dateFrom",
  "dateTo",
  "compareMode",
  "compareDateFrom",
  "compareDateTo",
]);

export function apiError(error: unknown, started: number) {
  const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);
  const responseHeaders = { ...HEADERS, "server-timing": "analysis;dur=" + durationMs };
  if (error instanceof PersistenceGatewayError) {
    logPersistenceGatewayFailure("analysis-api-gateway", error);
    return Response.json(
      { error: "analysis_unavailable", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: responseHeaders,
      },
    );
  }

  const code = publicGatewayErrorCode(error);
  const invalid = /^invalid_(?:analysis|financial_analysis)_[a-z0-9_]+$/.test(code);
  const unavailable = code === "analysis_reconciliation_failed";
  const status = invalid ? 400 : unavailable ? 503 : 500;
  // Never serialize or log arbitrary exception messages: they can carry
  // private financial filter values or infrastructure details.
  console.error("analysis-api", status === 500 ? error instanceof Error ? error.name : typeof error : code);
  return Response.json(
    { error: status === 400 ? "invalid_request" : "analysis_unavailable", code: status === 500 ? null : code },
    { status, headers: responseHeaders },
  );
}

export async function GET(request: Request) {
  const started = performance.now();
  try {
    const { searchParams } = new URL(request.url);
    for (const key of searchParams.keys()) {
      if (!ALLOWED_QUERY_KEYS.has(key) || searchParams.getAll(key).length !== 1) throw new Error("invalid_analysis_parameter");
    }

    const input: AnalysisSelectionInput = {
      month: searchParams.get("month"),
      range: searchParams.get("range"),
      accountId: searchParams.get("accountId"),
      periodMode: searchParams.get("periodMode"),
      year: searchParams.get("year"),
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      compareMode: searchParams.get("compareMode"),
      compareDateFrom: searchParams.get("compareDateFrom"),
      compareDateTo: searchParams.get("compareDateTo"),
    };
    const snapshot = prepareAnalysisPresentationSnapshot(await loadAnalysisSnapshot(input));
    const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);

    return Response.json(snapshot, {
      headers: {
        ...HEADERS,
        "server-timing": `analysis;dur=${durationMs}`,
        "x-analysis-data-operations": "1",
      },
    });
  } catch (error) {
    return apiError(error, started);
  }
}
