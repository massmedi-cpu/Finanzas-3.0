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

type DeletionImpactGatewayResult = {
  impact: unknown;
};

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "data_deletion_impact_failed", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: SAFE_HEADERS,
      },
    );
  }

  console.error(
    "data-deletion-impact-api-internal",
    error instanceof Error ? error.name : typeof error,
  );
  return Response.json(
    { error: "internal_error", code: null },
    { status: 500, headers: SAFE_HEADERS },
  );
}

export async function GET() {
  // PRE-020C se audita en Preview, pero nunca puede usar Preview para leer Production.
  if (process.env.VERCEL_ENV !== "production") {
    return Response.json(
      {
        error: "data_deletion_impact_production_only",
        code: "preview_production_deletion_impact_forbidden",
      },
      { status: 403, headers: SAFE_HEADERS },
    );
  }

  try {
    const result = await callPersistenceGateway<DeletionImpactGatewayResult>(
      "data.deletion_impact_v1",
    );
    const impact = result?.impact;
    if (!impact || typeof impact !== "object" || Array.isArray(impact)) {
      throw new PersistenceGatewayError(
        "El gateway ha devuelto un manifiesto de borrado inválido.",
        503,
        "invalid_deletion_impact_payload",
      );
    }

    return Response.json(impact, { status: 200, headers: SAFE_HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
