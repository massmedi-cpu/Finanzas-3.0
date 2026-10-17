import { publicGatewayErrorCode } from "../../../../src/infrastructure/http/gateway-public-error";
import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { LimitedJsonRequestError, readLimitedJsonRequest } from "../../../../src/infrastructure/http/limited-json-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const DOCUMENT_TYPES = new Set(["ticket", "invoice", "other"]);
// Allows 200 valid OCR lines of up to 500 characters while forbidding oversized requests.
const MAX_REVIEW_JSON_BYTES = 256 * 1024;

export function errorResponse(error: unknown) {
  if (error instanceof LimitedJsonRequestError) {
    const status = error.reason === "too_large" ? 413 : 400;
    const code = error.reason === "too_large" ? "document_review_too_large" : "invalid_json";
    return Response.json({ error: "invalid_request", code }, { status, headers: HEADERS });
  }
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: error.status === 404 ? "not_found" : "persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  // Only local OCR validation codes may cross the HTTP boundary. Never
  // return raw backend exception messages, original OCR text or credentials.
  if (error instanceof SyntaxError) {
    return Response.json(
      { error: "invalid_request", code: "invalid_json" },
      { status: 400, headers: HEADERS },
    );
  }
  // Line-item validation encodes the actual source line index (0..199).
  // Its bounded format is a public error code; arbitrary numeric error text
  // must not bypass the shared response sanitizer.
  const indexedCode = error instanceof Error
    && /^invalid_document_line_(?:0|[1-9]\d?|1\d{2})_(?:description|quantity|unit_price|total)$/.test(error.message)
    ? error.message : null;
  const code = indexedCode ?? publicGatewayErrorCode(error);
  if (/^invalid_document_[a-z0-9_]+$/.test(code)) {
    return Response.json({ error: "invalid_request", code }, { status: 400, headers: HEADERS });
  }
  console.error("document-ocr-review-internal", error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "internal_error", code: null }, { status: 500, headers: HEADERS });
}

function uuid(value: unknown, field: string) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`invalid_${field}`);
  return value;
}

function nullableUuid(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  return uuid(value, field);
}

function nullableText(value: unknown, field: string, max: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`invalid_${field}`);
  return normalized;
}

function nullableDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new Error("invalid_document_date");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("invalid_document_date");
  return value;
}

function nullableTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !TIME.test(value)) throw new Error("invalid_document_time");
  return value;
}

function nullableMoney(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`invalid_${field}`);
  return value;
}

function nullableQuantity(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error(`invalid_${field}`);
  return value;
}

function lineItems(value: unknown) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) throw new Error("invalid_document_line_items");
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_document_line_items");
    const row = raw as Record<string, unknown>;
    const description = nullableText(row.description, `document_line_${index}_description`, 500);
    if (!description) throw new Error("invalid_document_line_items");
    return {
      description,
      quantity: nullableQuantity(row.quantity, `document_line_${index}_quantity`),
      unitPriceCents: nullableMoney(row.unitPriceCents, `document_line_${index}_unit_price`),
      totalCents: nullableMoney(row.totalCents, `document_line_${index}_total`),
    };
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    // The document identity must be unique: URLSearchParams.get() silently
    // ignores a second, conflicting ID, and arbitrary query keys are unsafe
    // for an authenticated private evidence history.
    if (url.searchParams.getAll("id").length !== 1
      || [...url.searchParams.keys()].some((key) => key !== "id")) {
      throw new Error("invalid_document_review_query");
    }
    const id = uuid(url.searchParams.get("id"), "document_id");
    const result = await callPersistenceGateway("document.ocr_history", { id });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readLimitedJsonRequest(request, MAX_REVIEW_JSON_BYTES);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_document_review");
    const input = body as Record<string, unknown>;
    const documentId = uuid(input.documentId, "document_id");
    const ocrRunId = nullableUuid(input.ocrRunId, "document_ocr_run_id");
    if (typeof input.type !== "string" || !DOCUMENT_TYPES.has(input.type)) throw new Error("invalid_document_type");
    const notes = input.notes === null || input.notes === undefined ? "" : input.notes;
    if (typeof notes !== "string" || notes.length > 2000) throw new Error("invalid_document_notes");

    const payload = {
      documentId,
      ocrRunId,
      type: input.type,
      documentDate: nullableDate(input.documentDate),
      documentTime: nullableTime(input.documentTime),
      issuerName: nullableText(input.issuerName, "document_issuer", 300),
      issuerTaxId: nullableText(input.issuerTaxId, "document_issuer_tax_id", 40),
      documentNumber: nullableText(input.documentNumber, "document_number", 120),
      billingPeriod: nullableText(input.billingPeriod, "document_billing_period", 200),
      taxBaseCents: nullableMoney(input.taxBaseCents, "document_tax_base"),
      taxesCents: nullableMoney(input.taxesCents, "document_taxes"),
      totalCents: nullableMoney(input.totalCents, "document_total"),
      paymentMethod: nullableText(input.paymentMethod, "document_payment_method", 120),
      lineItems: lineItems(input.lineItems),
      notes,
    };

    const result = await callPersistenceGateway("document.ocr_confirm", payload);
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
