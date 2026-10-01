import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

function fail(code: string, status: number) {
  return Response.json({ error: status === 409 ? "document_delete_forbidden" : "document_delete_failed", code }, { status, headers: HEADERS });
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    const status = error.status >= 400 && error.status < 600 ? error.status : 503;
    return fail(error.code ?? (status === 404 ? "document_not_found" : "persistence_failed"), status);
  }
  if (error instanceof Error) {
    if (error.message === "invalid_document_id" || error.message === "invalid_document_delete_query") {
      return fail(error.message, 400);
    }
  }
  console.error("document-delete-api-internal", error instanceof Error ? error.name : typeof error);
  return fail("internal_error", 500);
}

function documentId(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !UUID.test(id)) throw new Error("invalid_document_id");
  if ([...searchParams.keys()].some((key) => key !== "id")) throw new Error("invalid_document_delete_query");
  return id;
}

export async function GET(request: Request) {
  try {
    const id = documentId(request);
    const result = await callPersistenceGateway("document.delete_preflight", { id });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = documentId(request);
    const result = await callPersistenceGateway("document.delete", { id });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
