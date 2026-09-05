import { runGoogleOauthHealthChecks } from "../../../../src/core/google-oauth-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await runGoogleOauthHealthChecks();
  return Response.json(health, {
    status: health.status === "ok" ? 200 : 500,
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
