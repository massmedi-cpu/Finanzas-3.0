import { publicGatewayErrorCode } from "../../../src/infrastructure/http/gateway-public-error";
import {
  GoogleDriveDocumentDownloader,
  GoogleDriveDocumentError,
} from "../../../src/infrastructure/google/google-drive-document-downloader";
import {
  GOOGLE_DOCUMENT_READONLY_SCOPES,
  GoogleServiceAccountAccessTokenProvider,
  GoogleServiceAccountError,
  getGoogleServiceAccountCredentialsFromEnvironment,
} from "../../../src/infrastructure/google/google-service-account";
import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { parseDocumentQueryInteger as optionalQueryInteger } from "../../../src/application/document-query-integer";
import { verifyDriveDocumentBatchMetadata } from "../../../src/application/document-drive-batch-verification";
import { LimitedJsonRequestError, readLimitedJsonRequest } from "../../../src/infrastructure/http/limited-json-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const TYPES = new Set(["ticket", "invoice", "other"]);
const STATUSES = new Set(["imported", "pending_review", "confirmed", "archived"]);
const METHODS = new Set(["manual", "suggested"]);
const SCOPES = new Set(["ordinary", "tests", "all"]);
const MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
// Includes the largest supported batch of 200 original Drive metadata rows.
const MAX_DOCUMENT_JSON_BYTES = 512 * 1024;
const DOCUMENT_LIST_KEYS = new Set(["status", "q", "limit", "offset", "scope", "unassociated"]);
const DOCUMENT_DETAIL_KEYS = new Set(["id"]);
const DOCUMENT_OPEN_KEYS = new Set(["id", "mode"]);
const DOCUMENT_CANDIDATE_KEYS = new Set(["id", "mode", "days", "limit"]);
let googleDriveDownloader: GoogleDriveDocumentDownloader | null = null;

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

function driveDownloader() {
  if (!googleDriveDownloader) {
    const credentials = getGoogleServiceAccountCredentialsFromEnvironment();
    const accessTokens = new GoogleServiceAccountAccessTokenProvider(
      credentials,
      fetch,
      Date.now,
      GOOGLE_DOCUMENT_READONLY_SCOPES,
    );
    googleDriveDownloader = new GoogleDriveDocumentDownloader(accessTokens);
  }
  return googleDriveDownloader;
}

function apiError(error: unknown) {
  if (error instanceof LimitedJsonRequestError) {
    const status = error.reason === "too_large" ? 413 : 400;
    return Response.json({ error: "invalid_request", code: status === 413 ? "document_body_too_large" : "invalid_document_body" }, { status, headers: HEADERS });
  }
  if (error instanceof GoogleDriveDocumentError) {
    const status: Record<GoogleDriveDocumentError["code"], number> = {
      google_drive_document_id_invalid: 400,
      google_drive_document_access_denied: 409,
      google_drive_document_not_found: 404,
      google_drive_document_metadata_invalid: 409,
      google_drive_document_source_changed: 409,
      google_drive_document_mime_mismatch: 415,
      google_drive_document_content_mismatch: 415,
      google_drive_document_too_large: 413,
      google_drive_document_download_failed: 503,
    };
    return Response.json({ error: "invalid_drive_document", code: error.code }, { status: status[error.code], headers: HEADERS });
  }
  if (error instanceof GoogleServiceAccountError) {
    return Response.json({ error: "drive_reader_unavailable", code: error.code }, { status: 503, headers: HEADERS });
  }
  if (error instanceof PersistenceGatewayError) {
    // "unauthorized" at this gateway means Vercel OIDC verification failed;
    // it is not evidence that the user's interactive session expired.
    if (error.status === 401 && error.code === "unauthorized") {
      return Response.json(
        { error: "persistence_failed", code: "gateway_identity_unavailable" },
        { status: 503, headers: HEADERS },
      );
    }
    if (error.status === 404) return Response.json({ error: "not_found", code: error.code ?? null }, { status: 404, headers: HEADERS });
    if (error.status === 409) return Response.json({ error: "conflict", code: error.code ?? null }, { status: 409, headers: HEADERS });
    if (error.status === 400) return Response.json({ error: "invalid_request", code: error.code ?? null }, { status: 400, headers: HEADERS });
    return Response.json(
      { error: "persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  const publicCode = publicGatewayErrorCode(error);
  if (publicCode.startsWith("invalid_document_") || publicCode.startsWith("unsupported_document_")) {
    return Response.json({ error: "invalid_request", code: publicCode }, { status: 400, headers: HEADERS });
  }
  console.error("documents-api-internal", error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "internal_error", code: null }, { status: 500, headers: HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Never let URLSearchParams.get() silently pick the first of two
    // contradictory filters or document IDs.
    for (const key of searchParams.keys()) {
      if (searchParams.getAll(key).length > 1) throw new Error("invalid_document_query_duplicate");
    }
    const idRaw = searchParams.get("id");
    const mode = searchParams.get("mode");
    // Preserve the established public contract for unknown/empty modes
    // while still rejecting extra selectors on valid mode requests.
    // Existing browser clients distinguish invalid_document_mode from
    // invalid_document_query_parameters.
    if (mode !== null && (idRaw === null || (mode !== "open" && mode !== "candidates"))) {
      throw new Error("invalid_document_mode");
    }
    const allowedKeys = idRaw !== null
      ? mode === "candidates" ? DOCUMENT_CANDIDATE_KEYS
        : mode === "open" ? DOCUMENT_OPEN_KEYS : DOCUMENT_DETAIL_KEYS
      : DOCUMENT_LIST_KEYS;
    if ([...searchParams.keys()].some((key) => !allowedKeys.has(key))) {
      throw new Error("invalid_document_query_parameters");
    }

    if (idRaw !== null) {
      const id = uuid(idRaw, "invalid_document_id");
      if (mode === "candidates") {
        const daysRaw = searchParams.get("days");
        const limitRaw = searchParams.get("limit");
        const days = optionalQueryInteger(daysRaw, "invalid_document_candidate_days", 7, 0, 31);
        const limit = optionalQueryInteger(limitRaw, "invalid_document_candidate_limit", 8, 1, 20);
        const result = await callPersistenceGateway("document.candidates", { id, days, limit });
        return Response.json(result, { headers: HEADERS });
      }
      if (mode === "open") {
        const result = await callPersistenceGateway("document.open", { id });
        return Response.json(result, { headers: HEADERS });
      }
      if (mode !== null) throw new Error("invalid_document_mode");
      const result = await callPersistenceGateway("document.detail", { id });
      return Response.json(result, { headers: HEADERS });
    }

    if (mode !== null) throw new Error("invalid_document_mode");
    const status = statusValue(searchParams.get("status"), true);
    const query = nullableText(searchParams.get("q"), "invalid_document_query", 200);
    const limitRaw = searchParams.get("limit");
    const offsetRaw = searchParams.get("offset");
    const limit = optionalQueryInteger(limitRaw, "invalid_document_limit", 50, 1, 100);
    const offset = optionalQueryInteger(offsetRaw, "invalid_document_offset", 0, 0, 100000);
    const scope = searchParams.get("scope") ?? "ordinary";
    if (!SCOPES.has(scope)) throw new Error("invalid_document_scope");
    const unassociatedRaw = searchParams.get("unassociated");
    if (unassociatedRaw !== null && unassociatedRaw !== "true" && unassociatedRaw !== "false") throw new Error("invalid_document_association_filter");
    const result = await callPersistenceGateway("document.list", {
      status, query, limit, offset, scope, unassociatedOnly: unassociatedRaw === "true",
    });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const row = objectBody(await readLimitedJsonRequest(request, MAX_DOCUMENT_JSON_BYTES));
    const action = text(row.action, "invalid_document_action", 40);

    if (action === "upload_sign") {
      const payload = {
        type: typeValue(row.type),
        originalFileName: text(row.originalFileName, "invalid_document_file_name", 500),
        mimeType: mimeValue(row.mimeType),
        sizeBytes: integer(row.sizeBytes, "invalid_document_size", 1, 15 * 1024 * 1024),
        // Optional only for an older client; new clients include the digest
        // so different devices receive the same signed private object path.
        expectedSha256: row.expectedSha256 === null || row.expectedSha256 === undefined
          ? null : text(row.expectedSha256, "invalid_document_content_sha256", 64),
      };
      if (payload.expectedSha256 !== null && !/^[0-9a-f]{64}$/.test(payload.expectedSha256)) {
        throw new Error("invalid_document_content_sha256");
      }
      const result = await callPersistenceGateway("document.upload_sign", payload);
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "upload_finalize") {
      const payload = {
        type: typeValue(row.type),
        originalFileName: text(row.originalFileName, "invalid_document_file_name", 500),
        mimeType: mimeValue(row.mimeType),
        path: text(row.path, "invalid_document_storage_key", 1000),
        // Optional for recovery of uploads created before hash-aware clients.
        // New uploads provide both; all hash validation is repeated at gateway.
        expectedSizeBytes: integer(row.expectedSizeBytes, "invalid_document_expected_size", 1, 15 * 1024 * 1024, true),
        expectedSha256: row.expectedSha256 === null || row.expectedSha256 === undefined
          ? null : text(row.expectedSha256, "invalid_document_expected_sha256", 64),
      };
      if (payload.expectedSha256 !== null && !/^[0-9a-f]{64}$/.test(payload.expectedSha256)) {
        throw new Error("invalid_document_expected_sha256");
      }
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
          // Never accept a browser-provided modification timestamp as Drive evidence.
        };
      });

      // Reject duplicate IDs before contacting Google: duplicate inventory
      // rows cannot be independent financial documents.
      if (new Set(files.map((file) => file.fileId)).size !== files.length) {
        throw new Error("invalid_document_drive_batch");
      }
      const downloader = driveDownloader();
      // Bounded concurrency reduces latency for large imports, while
      // preserving original ordering and verifying *every* Drive revision.
      // A failed verification prevents the single downstream batch write.
      const verifiedFiles = await verifyDriveDocumentBatchMetadata(files, async (file) => {
        const downloaded = await downloader.download({ fileId: file.fileId, expectedMimeType: file.mimeType });
        return {
          ...file,
          name: downloaded.fileName ?? file.name,
          mimeType: downloaded.mimeType,
          sizeBytes: downloaded.sizeBytes,
          modifiedTime: downloaded.modifiedTime, // Authoritative Google metadata only.
        };
      });

      const result = await callPersistenceGateway("document.drive_batch", { files: verifiedFiles });
      return Response.json(result, { headers: HEADERS });
    }

    throw new Error("invalid_document_action");
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const row = objectBody(await readLimitedJsonRequest(request, MAX_DOCUMENT_JSON_BYTES));
    const action = text(row.action, "invalid_document_action", 40);

    if (action === "test_designation") {
      if (typeof row.isTest !== "boolean") throw new Error("invalid_document_test_designation");
      if (row.ownerReviewed !== true) throw new Error("invalid_document_owner_review");
      const result = await callPersistenceGateway("document.test_designation", {
        id: uuid(row.id, "invalid_document_id"),
        isTest: row.isTest,
        ownerReviewed: true,
        reason: text(row.reason, "invalid_document_designation_reason", 500),
      });
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "metadata") {
      const payload = {
        id: uuid(row.id, "invalid_document_id"),
        type: typeValue(row.type),
        documentDate: nullableDate(row.documentDate, "invalid_document_date"),
        issuerName: nullableText(row.issuerName, "invalid_document_issuer", 300),
        totalCents: integer(row.totalCents, "invalid_document_total", -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, true),
        notes: row.notes === null || row.notes === undefined ? "" : text(row.notes, "invalid_document_notes", 2000, true),
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
