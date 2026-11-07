import type { PersistenceGatewayError } from "./vercel-supabase-gateway";

/**
 * Authentication rejection is part of the security contract, not a 5xx
 * operational failure. Keep its structured, redacted diagnostic as INFO so
 * error alerts stay actionable. Every unexpected 4xx/5xx remains an ERROR.
 *
 * This only adjusts observability. HTTP statuses and authorization controls
 * remain unchanged.
 */
export function logPersistenceGatewayFailure(scope: string, error: PersistenceGatewayError): void {
  const safe = { status: error.status, code: error.code ?? null };
  if (error.status === 403 && error.code === "workspace_context_required") {
    console.info(scope, safe);
  } else {
    console.error(scope, safe);
  }
}
