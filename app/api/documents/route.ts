import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const TYPES = new Set(["ticket", "invoice", "other"]);
const STATUSES = new Set(["imported", "pending_review", "confirmed", "archived"]);
const METHODS = new Set(["manual", "suggested"]);
const MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function objectBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_document_body");
  return value as Record<string, unknown>;
}

function text(value: unknown, code: string, max: number, allowEmpty = false) {
  if (typeof value !== "string") throw new Error(code);
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > max) throw new Error(code);
  return result;
}

function nullableText(value: unknown, code: string, max: number) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, code, max);
}

function uuid(value: unknown, code: string) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(code);
  return value;
}

function nullableDate(value: unknown, code: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(code);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(code);
  return value;
}

function integer(value: unknown, code: string, min?: number, max?: number, nullable = false) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(code);
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) throw new Error(code);
  return value;
}

function typeValue(value: unknown) {
  if (typeof value !== "string" || !TYPES.has(value)) throw new Error("invalid_document_type");
  return value;
}

function statusValue(value: unknown, nullable = false) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !STATUSES.has(value)) throw new Error("invalid_document_status");
  return value;
}

function methodValue(value: unknown) {
  if (typeof value !== "string" || !METHODS.has(value)) throw new Error("invalid_document_association_method");
  return value;
}

function mimeValue(value: unknown) {
  if (typeof value !== "string" || !MIMES.has(value.toLowerCase())) throw new Error("unsupported_document_mime_type");
  return value.toLowerCase();
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    if (error.status === 404) return Response.json({ error: "not_found", code: error.code ?? null }, { status: 404, headers: HEADERS });
    if (error.status === 409) return Response.json({ error: "conflict", code: error.code ?? null }, { status: 409, headers: HEADERS });
    if (error.status === 400) return Response.json({ error: "invalid_request", code: error.code ?? null }, { status: 400, headers: HEADERS });
    return Response.json(
      { error: "persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  if (error instanceof Error && (error.message.startsWith("invalid_document_") || error.message.startsWith("unsupported_document_"))) {
    return Response.json({ error: "invalid_request", code: error.message }, { status: 400, headers: HEADERS });
  }
  console.error("documents-api-internal", error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "internal_error", code: null }, { status: 500, headers: HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idRaw = searchParams.get("id");
    const mode = searchParams.get("mode");

    if (idRaw) {
      const id = uuid(idRaw, "invalid_document_id");
      if (mode === "candidates") {
        const daysRaw = searchParams.get("days");
        const limitRaw = searchParams.get("limit");
        const days = daysRaw === null ? 7 : integer(Number(daysRaw), "invalid_document_candidate_days", 0, 31);
        const limit = limitRaw === null ? 8 : integer(Number(limitRaw), "invalid_document_candidate_limit", 1, 20);
        const result = await callPersistenceGateway("document.candidates", { id, days, limit });
        return Response.json(result, { headers: HEADERS });
      }
      if (mode === "open") {
        const result = await callPersistenceGateway("document.open", { id });
        return Response.json(result, { headers: HEADERS });
      }
      if (mode) throw new Error("invalid_document_mode");
      const result = await callPersistenceGateway("document.detail", { id });
      return Response.json(result, { headers: HEADERS });
    }

    if (mode) throw new Error("invalid_document_mode");
    const status = statusValue(searchParams.get("status"), true);
    const query = nullableText(searchParams.get("q"), "invalid_document_query", 200);
    const limitRaw = searchParams.get("limit");
    const offsetRaw = searchParams.get("offset");
    const limit = limitRaw === null ? 50 : integer(Number(limitRaw), "invalid_document_limit", 1, 100);
    const offset = offsetRaw === null ? 0 : integer(Number(offsetRaw), "invalid_document_offset", 0, 100000);
    const result = await callPersistenceGateway("document.list", { status, query, limit, offset });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const row = objectBody(await request.json().catch(() => null));
    const action = text(row.action, "invalid_document_action", 40);

    if (action === "upload_sign") {
      const payload = {
        type: typeValue(row.type),
        originalFileName: text(row.originalFileName, "invalid_document_file_name", 500),
        mimeType: mimeValue(row.mimeType),
        sizeBytes: integer(row.sizeBytes, "invalid_document_size", 1, 15 * 1024 * 1024),
      };
      const result = await callPersistenceGateway("document.upload_sign", payload);
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "upload_finalize") {
      const payload = {
        type: typeValue(row.type),
        originalFileName: text(row.originalFileName, "invalid_document_file_name", 500),
        mimeType: mimeValue(row.mimeType),
        path: text(row.path, "invalid_document_storage_key", 1000),
      };
      const result = await callPersistenceGateway("document.upload_finalize", payload);
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "drive_batch") {
      if (!Array.isArray(row.files) || row.files.length < 1 || row.files.length > 200) throw new Error("invalid_document_drive_batch");
      const files = row.files.map((raw) => {
        const item = objectBody(raw);
        return {
          type: typeValue(item.type ?? "other"),
          name: text(item.name, "invalid_document_file_name", 500),
          mimeType: mimeValue(item.mimeType),
          fileId: text(item.fileId, "invalid_document_drive_file_id", 300),
          sizeBytes: integer(item.sizeBytes, "invalid_document_size", 0, Number.MAX_SAFE_INTEGER, true),
          modifiedTime: nullableText(item.modifiedTime, "invalid_document_source_modified_at", 80),
        };
      });
      const result = await callPersistenceGateway("document.drive_batch", { files });
      return Response.json(result, { headers: HEADERS });
    }

    throw new Error("invalid_document_action");
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const row = objectBody(await request.json().catch(() => null));
    const action = text(row.action, "invalid_document_action", 40);

    if (action === "metadata") {
      const payload = {
        id: uuid(row.id, "invalid_document_id"),
        type: typeValue(row.type),
        documentDate: nullableDate(row.documentDate, "invalid_document_date"),
        issuerName: nullableText(row.issuerName, "invalid_document_issuer", 300),
        totalCents: integer(row.totalCents, "invalid_document_total", -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, true),
        notes: row.notes === null || row.notes === undefined ? "" : text(String(row.notes), "invalid_document_notes", 2000, true),
      };
      const result = await callPersistenceGateway("document.update", payload);
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "status") {
      const result = await callPersistenceGateway("document.status", {
        id: uuid(row.id, "invalid_document_id"),
        status: statusValue(row.status),
      });
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "associate") {
      const result = await callPersistenceGateway("document.associate", {
        documentId: uuid(row.documentId, "invalid_document_id"),
        transactionId: uuid(row.transactionId, "invalid_document_transaction_id"),
        method: methodValue(row.method),
      });
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "unassociate") {
      const result = await callPersistenceGateway("document.unassociate", {
        documentId: uuid(row.documentId, "invalid_document_id"),
        transactionId: uuid(row.transactionId, "invalid_document_transaction_id"),
      });
      return Response.json(result, { headers: HEADERS });
    }

    throw new Error("invalid_document_action");
  } catch (error) {
    return apiError(error);
  }
}
