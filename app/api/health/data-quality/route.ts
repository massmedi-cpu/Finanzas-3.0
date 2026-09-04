import { runDataQualityHealthChecks } from "../../../../src/core/data-quality-health";
import { runHistoricalSourceHealthChecks } from "../../../../src/core/historical-source-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const dataQuality = runDataQualityHealthChecks();
  const historicalSource = runHistoricalSourceHealthChecks();
  const checks = [...dataQuality.checks, ...historicalSource.checks];
  const passed = checks.filter((check) => check.passed).length;
  const health = {
    status: passed === checks.length ? ("ok" as const) : ("failed" as const),
    passed,
    total: checks.length,
    checks,
  };

  return Response.json(health, {
    status: health.status === "ok" ? 200 : 500,
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
