import {
  assertSourceSyncRuntimeCapabilities,
  type SourceSyncRuntimeCapabilities,
} from "../../../../src/application/source-sync-runtime-contract";
import { callPersistenceGateway } from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

type SourceIngestionHealth = {
  verified: boolean;
  clean: boolean;
  residue: {
    accounts: number;
    mappings: number;
    sources: number;
    transactions: number;
    cursors: number;
  };
};

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "preview_only" }, { status: 404 });
  }

  try {
    const capabilities = await callPersistenceGateway<SourceSyncRuntimeCapabilities>("source.capabilities");
    assertSourceSyncRuntimeCapabilities(capabilities);

    const result = await callPersistenceGateway<SourceIngestionHealth>("test.source_ingestion");
    const ok =
      result.verified === true &&
      result.clean === true &&
      result.residue?.accounts === 0 &&
      result.residue?.mappings === 0 &&
      result.residue?.sources === 0 &&
      result.residue?.transactions === 0 &&
      result.residue?.cursors === 0;

    return Response.json(
      { status: ok ? "ok" : "failed", capabilities, ...result },
      {
        status: ok ? 200 : 500,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  } catch (error) {
    return Response.json(
      {
        status: "failed",
        error: error instanceof Error ? error.message : "source_ingestion_health_failed",
      },
      {
        status: 500,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  }
}
