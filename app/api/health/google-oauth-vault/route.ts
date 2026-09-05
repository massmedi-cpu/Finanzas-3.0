import { callPersistenceGateway } from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

type GoogleOauthVaultHealth = {
  verified: boolean;
  clean: boolean;
};

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "preview_only" }, { status: 404 });
  }

  try {
    const result = await callPersistenceGateway<GoogleOauthVaultHealth>("test.google_oauth_vault");
    const ok = result.verified === true && result.clean === true;
    return Response.json(
      { status: ok ? "ok" : "failed", ...result },
      {
        status: ok ? 200 : 500,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  } catch (error) {
    return Response.json(
      {
        status: "failed",
        error: error instanceof Error ? error.message : "google_oauth_vault_health_failed",
      },
      {
        status: 500,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  }
}
