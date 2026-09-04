import { runDataQualityHealthChecks } from "../../../../src/core/data-quality-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = runDataQualityHealthChecks();
  return Response.json(health, {
    status: health.status === "ok" ? 200 : 500,
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
