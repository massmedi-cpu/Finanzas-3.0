import { getVercelOidcToken } from "@vercel/oidc";

const SUPABASE_GATEWAY_URL =
  "https://btzukbfesxdratqnxuoj.supabase.co/functions/v1/financial-app-db-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const oidcToken = await getVercelOidcToken({
      project: "prj_SbZ64E02YhCK4ds24Yi7qf5CeQjo",
      team: "team_xrSskbkRKwQkyYc0vvLVGUnb",
      expirationBufferMs: 60_000,
    });

    if (!oidcToken) {
      return Response.json(
        {
          status: "failed",
          reason: "vercel_oidc_unavailable",
        },
        { status: 503 },
      );
    }

    const response = await fetch(SUPABASE_GATEWAY_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${oidcToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "health" }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.status !== "ok" || payload?.database !== true) {
      return Response.json(
        {
          status: "failed",
          reason: "database_gateway_rejected",
          gatewayStatus: response.status,
        },
        { status: 503 },
      );
    }

    return Response.json(
      {
        status: "ok",
        connection: "vercel-oidc-to-supabase-edge-to-postgres",
        database: true,
        environment: payload.environment,
      },
      {
        headers: {
          "cache-control": "no-store",
          "x-robots-tag": "noindex",
        },
      },
    );
  } catch (error) {
    console.error(
      "persistence-health",
      error instanceof Error ? error.message : String(error),
    );

    return Response.json(
      {
        status: "failed",
        reason: "database_gateway_unreachable",
      },
      { status: 503 },
    );
  }
}
