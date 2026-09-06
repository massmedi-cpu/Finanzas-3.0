import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONFIDENCES = new Set(["high", "medium", "low"]);
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

function objectBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_forecast_body");
  }
  return value as Record<string, unknown>;
}

function nullableUuid(value: unknown, code: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(code);
  return value;
}

function requiredUuid(value: unknown, code: string) {
  const result = nullableUuid(value, code);
  if (!result) throw new Error(code);
  return result;
}

function dateValue(value: unknown, code: string) {
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(code);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(code);
  return value;
}

function integerValue(value: unknown, code: string, min?: number, max?: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(code);
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) throw new Error(code);
  return value;
}

function stringValue(value: unknown, code: string, max: number, allowEmpty = false) {
  if (typeof value !== "string") throw new Error(code);
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > max) throw new Error(code);
  return result;
}

function confidenceValue(value: unknown) {
  if (typeof value !== "string" || !CONFIDENCES.has(value)) throw new Error("invalid_forecast_confidence");
  return value;
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    if (error.status === 404) {
      return Response.json({ error: "not_found", code: error.code ?? null }, { status: 404, headers: HEADERS });
    }
    if (error.status === 409) {
      return Response.json({ error: "conflict", code: error.code ?? null }, { status: 409, headers: HEADERS });
    }
    if (error.status === 400) {
      return Response.json({ error: "invalid_request", code: error.code ?? null }, { status: 400, headers: HEADERS });
    }
    return Response.json(
      { error: "persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }

  if (error instanceof Error && error.message.startsWith("invalid_forecast_")) {
    return Response.json({ error: "invalid_request", code: error.message }, { status: 400, headers: HEADERS });
  }

  console.error("forecast-api-internal", error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "internal_error", code: null }, { status: 500, headers: HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");

    if (itemId) {
      const id = requiredUuid(itemId, "invalid_forecast_item_id");
      const daysRaw = searchParams.get("days");
      const limitRaw = searchParams.get("limit");
      const days = daysRaw === null ? 7 : integerValue(Number(daysRaw), "invalid_forecast_candidate_days", 0, 31);
      const limit = limitRaw === null ? 8 : integerValue(Number(limitRaw), "invalid_forecast_candidate_limit", 1, 20);
      const result = await callPersistenceGateway("forecast.candidates", { id, days, limit });
      return Response.json(result, { headers: HEADERS });
    }

    const dateFrom = dateValue(searchParams.get("dateFrom"), "invalid_forecast_date_from");
    const dateTo = dateValue(searchParams.get("dateTo"), "invalid_forecast_date_to");
    const accountId = nullableUuid(searchParams.get("accountId"), "invalid_forecast_account_id");
    const result = await callPersistenceGateway("forecast.snapshot", { dateFrom, dateTo, accountId });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const row = objectBody(await request.json().catch(() => null));
    const action = stringValue(row.action, "invalid_forecast_action", 32);

    if (action === "refresh") {
      const payload = {
        dateFrom: dateValue(row.dateFrom, "invalid_forecast_date_from"),
        dateTo: dateValue(row.dateTo, "invalid_forecast_date_to"),
        accountId: nullableUuid(row.accountId, "invalid_forecast_account_id"),
      };
      const result = await callPersistenceGateway("forecast.refresh", payload);
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "manual") {
      const payload = {
        date: dateValue(row.date, "invalid_forecast_date"),
        concept: stringValue(row.concept, "invalid_forecast_concept", 240),
        amountCents: integerValue(row.amountCents, "invalid_forecast_amount"),
        accountId: nullableUuid(row.accountId, "invalid_forecast_account_id"),
        categoryId: nullableUuid(row.categoryId, "invalid_forecast_category_id"),
        merchantId: nullableUuid(row.merchantId, "invalid_forecast_merchant_id"),
        confidence: confidenceValue(row.confidence ?? "high"),
      };
      const result = await callPersistenceGateway("forecast.manual", payload);
      return Response.json(result, { headers: HEADERS });
    }

    throw new Error("invalid_forecast_action");
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const row = objectBody(await request.json().catch(() => null));
    const action = stringValue(row.action, "invalid_forecast_action", 32);
    const id = requiredUuid(row.id, "invalid_forecast_item_id");

    if (action === "exclude") {
      if (typeof row.excluded !== "boolean") throw new Error("invalid_forecast_excluded");
      const reason = stringValue(row.reason ?? "", "invalid_forecast_excluded_reason", 500, !row.excluded);
      const result = await callPersistenceGateway("forecast.exclude", { id, excluded: row.excluded, reason });
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "reconcile") {
      const transactionId = nullableUuid(row.transactionId, "invalid_forecast_transaction_id");
      const note = stringValue(row.note ?? "", "invalid_forecast_reconciliation_note", 500, true);
      const result = await callPersistenceGateway("forecast.reconcile", { id, transactionId, note });
      return Response.json(result, { headers: HEADERS });
    }

    throw new Error("invalid_forecast_action");
  } catch (error) {
    return apiError(error);
  }
}
