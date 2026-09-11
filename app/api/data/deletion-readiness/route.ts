import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const SAFE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
};

type DeletionReadinessGatewayResult = {
  readiness: unknown;
};

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "workspace_deletion_readiness_failed", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: SAFE_HEADERS,
      },
    );
  }
  console.error(
    "data-deletion-readiness-api-internal",
    error instanceof Error ? error.name : typeof error,
  );
  return Response.json(
    { error: "internal_error", code: null },
    { status: 500, headers: SAFE_HEADERS },
  );
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "production") {
    return Response.json(
      {
        error: "workspace_deletion_readiness_production_only",
        code: "preview_production_deletion_readiness_forbidden",
      },
      { status: 403, headers: SAFE_HEADERS },
    );
  }

  try {
    const result = await callPersistenceGateway<DeletionReadinessGatewayResult>(
      "data.deletion_readiness_v1",
    );
    const readiness = result?.readiness as
      | { canExecute?: unknown; destructiveOperationExecuted?: unknown }
      | null
      | undefined;
    if (
      !readiness ||
      typeof readiness !== "object" ||
      Array.isArray(readiness) ||
      typeof readiness.canExecute !== "boolean" ||
      readiness.destructiveOperationExecuted !== false
    ) {
      throw new PersistenceGatewayError(
        "El gateway ha devuelto un readiness de borrado inválido.",
        503,
        "invalid_deletion_readiness_payload",
      );
    }
    return Response.json(readiness, { status: 200, headers: SAFE_HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
