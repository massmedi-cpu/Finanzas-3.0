import { GET as runDocumentOcrRequest } from "../route";
import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

function failure(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "ocr_persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  console.error("document-ocr-persist-internal", error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "internal_error", code: null }, { status: 500, headers: HEADERS });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "invalid_ocr_request" }, { status: 400, headers: HEADERS });
    }
    if (Object.keys(body).some((key) => key !== "id")) {
      return Response.json({ error: "invalid_ocr_request" }, { status: 400, headers: HEADERS });
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID.test(id)) {
      return Response.json({ error: "invalid_ocr_document_id" }, { status: 400, headers: HEADERS });
    }

    // Reuse the canonical server-side OCR route. The browser never supplies raw OCR evidence,
    // so persisted recognition cannot be replaced by client-authored geometry/text.
    const ocrUrl = new URL(`/api/documents/ocr?id=${encodeURIComponent(id)}`, request.url);
    const ocrResponse = await runDocumentOcrRequest(new Request(ocrUrl, { method: "GET" }));
    const result = await ocrResponse.json().catch(() => null) as Record<string, unknown> | null;
    if (!ocrResponse.ok || !result) {
      return Response.json(
        result ?? { error: "ocr_failed", code: null },
        { status: ocrResponse.status || 500, headers: HEADERS },
      );
    }

    const interpretation = result.interpretation;
    if (!interpretation || typeof interpretation !== "object" || Array.isArray(interpretation)) {
      return Response.json({ error: "ocr_interpretation_missing" }, { status: 422, headers: HEADERS });
    }
    const { interpretation: _interpretation, ...recognition } = result;
    const status = typeof recognition.status === "string" ? recognition.status : "";
    const extractedAt = typeof recognition.extractedAt === "string" ? recognition.extractedAt : "";

    const persisted = await callPersistenceGateway<{ document?: unknown }>("document.ocr_save", {
      id,
      recognition,
      interpretation,
      status,
      extractedAt,
    });

    return Response.json(
      {
        ...result,
        persisted: true,
        persistedDocument: persisted.document ?? null,
      },
      { headers: HEADERS },
    );
  } catch (error) {
    return failure(error);
  }
}
