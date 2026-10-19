import { resolveWorkspaceSession } from "./workspace-session";
import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../persistence/vercel-supabase-gateway";

const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

/** No app session means no account metadata, including in protected previews. */
export async function requireSourceSession(): Promise<Response | null> {
  const session = await resolveWorkspaceSession();
  return session
    ? null
    : Response.json({ error: "authentication_required" }, { status: 401, headers: HEADERS });
}

/** Expose only stable auth errors, not gateway response text. */
export function sourceWorkspaceAuthError(error: unknown): Response | null {
  if (!(error instanceof PersistenceGatewayError)) return null;
  if (error.code === "workspace_access_denied") {
    return Response.json({ error: "workspace_access_denied" }, { status: 403, headers: HEADERS });
  }
  if (error.code === "workspace_context_required" || error.code === "workspace_user_invalid") {
    return Response.json({ error: "authentication_required" }, { status: 401, headers: HEADERS });
  }
  return null;
}

/**
 * A cookie is not proof of membership. Verify Auth and the workspace using
 * the existing read-only Edge capability action before serving metadata.
 */
export async function requireVerifiedSourceWorkspace(): Promise<Response | null> {
  const missing = await requireSourceSession();
  if (missing) return missing;

  try {
    await callPersistenceGateway("source.capabilities");
    return null;
  } catch (error) {
    return sourceWorkspaceAuthError(error) ??
      Response.json({ error: "source_access_unavailable" }, { status: 503, headers: HEADERS });
  }
}
