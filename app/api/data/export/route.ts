import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const ERROR_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
};

const DOWNLOAD_HEADERS = {
  ...ERROR_HEADERS,
  "content-type": "application/json; charset=utf-8",
  "content-disposition": 'attachment; filename="financial-app-data-export.json"',
};

type DataExportGatewayResult = {
  export: unknown;
};

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "data_export_failed", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: ERROR_HEADERS,
      },
    );
  }

  console.error("data-export-api-internal", error instanceof Error ? error.name : typeof error);
  return Response.json(
    { error: "internal_error", code: null },
    { status: 500, headers: ERROR_HEADERS },
  );
}

export async function GET() {
  // PRE-020B: la ruta se compila en Preview para poder auditarla, pero jamás debe
  // convertir un token OIDC Preview en una lectura de datos reales de Production.
  if (process.env.VERCEL_ENV !== "production") {
    return Response.json(
      { error: "data_export_production_only", code: "preview_production_export_forbidden" },
      { status: 403, headers: ERROR_HEADERS },
    );
  }

  try {
    const result = await callPersistenceGateway<DataExportGatewayResult>("data.export_v1");
    const exportData = result?.export;
    if (!exportData || typeof exportData !== "object" || Array.isArray(exportData)) {
      throw new PersistenceGatewayError(
        "El gateway ha devuelto una exportación inválida.",
        503,
        "invalid_data_export_payload",
      );
    }

    return new Response(`${JSON.stringify(exportData, null, 2)}\n`, {
      status: 200,
      headers: DOWNLOAD_HEADERS,
    });
  } catch (error) {
    return apiError(error);
  }
}
