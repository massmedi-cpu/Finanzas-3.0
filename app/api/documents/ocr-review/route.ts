import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const DOCUMENT_TYPES = new Set(["ticket", "invoice", "other"]);

function errorResponse(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: error.status === 404 ? "not_found" : "persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  const code = error instanceof Error ? error.message : "invalid_request";
  return Response.json({ error: "invalid_request", code }, { status: 400, headers: HEADERS });
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

function nullableMoney(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`invalid_${field}`);
  return value;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = uuid(url.searchParams.get("id"), "document_id");
    const result = await callPersistenceGateway("document.ocr_history", { id });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
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
      issuerName: nullableText(input.issuerName, "document_issuer", 300),
      issuerTaxId: nullableText(input.issuerTaxId, "document_issuer_tax_id", 40),
      documentNumber: nullableText(input.documentNumber, "document_number", 120),
      billingPeriod: nullableText(input.billingPeriod, "document_billing_period", 200),
      taxBaseCents: nullableMoney(input.taxBaseCents, "document_tax_base"),
      taxesCents: nullableMoney(input.taxesCents, "document_taxes"),
      totalCents: nullableMoney(input.totalCents, "document_total"),
      paymentMethod: nullableText(input.paymentMethod, "document_payment_method", 120),
      notes,
    };

    const result = await callPersistenceGateway("document.ocr_confirm", payload);
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
