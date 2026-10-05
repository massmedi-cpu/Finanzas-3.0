import { loadAnalysisSnapshot } from "../../../../src/application/analysis/analysis-loader";
import { prepareAnalysisPresentationSnapshot } from "../../../../src/application/analysis/analysis-presentation";
import { buildHomeAnalysisSummary } from "../../../../src/application/dashboard/home-analysis";
import { PersistenceGatewayError } from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
  "x-home-analysis-contract": "1",
};

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function previousCompletedMonth(today: string) {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const started = performance.now();
  try {
    const month = previousCompletedMonth(madridToday());
    const snapshot = prepareAnalysisPresentationSnapshot(await loadAnalysisSnapshot({
      periodMode: "month",
      month,
      compareMode: "previous",
    }));
    const summary = buildHomeAnalysisSummary(snapshot);
    const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);

    return Response.json(summary, {
      headers: {
        ...HEADERS,
        "server-timing": `home-analysis;dur=${durationMs}`,
      },
    });
  } catch (error) {
    const code = error instanceof PersistenceGatewayError
      ? error.code ?? "analysis_gateway_unavailable"
      : error instanceof Error ? error.message : "home_analysis_unavailable";
    console.error("home-analysis-api", code);
    return Response.json(
      { error: "home_analysis_unavailable", code },
      { status: 503, headers: HEADERS },
    );
  }
}
