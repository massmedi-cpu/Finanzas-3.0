import {
  SourceSyncRuntimeCompatibilityError,
  assertSourceSyncRuntimeCapabilities,
  type SourceSyncRuntimeCapabilities,
} from "../../../../src/application/source-sync-runtime-contract";
import {
  PersistenceGatewayError,
  callPersistenceGateway,
} from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { requireSourceSession, sourceWorkspaceAuthError } from "../../../../src/infrastructure/auth/source-metadata-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const missing = await requireSourceSession();
  if (missing) return missing;

  try {
    const capabilities = await callPersistenceGateway<SourceSyncRuntimeCapabilities>("source.capabilities");
    assertSourceSyncRuntimeCapabilities(capabilities);

    return Response.json(
      { status: "ok", compatible: true, capabilities },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    const denied = sourceWorkspaceAuthError(error);
    if (denied) return denied;

    const incompatible =
      error instanceof SourceSyncRuntimeCompatibilityError ||
      (error instanceof PersistenceGatewayError && error.code === "unsupported_action");

    return Response.json(
      {
        status: "failed",
        compatible: false,
        error: incompatible ? "source_runtime_incompatible" : "source_runtime_unavailable",
      },
      {
        status: 503,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  }
}
