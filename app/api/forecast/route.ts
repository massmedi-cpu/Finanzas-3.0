import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { resolveForecastSelection } from "../../../src/application/forecast/forecast-selection";
import { isForecastSnapshotForSelection, isForecastCandidateSnapshotForRequest } from "../../../src/application/forecast/forecast-contract";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONFIDENCES = new Set(["high", "medium", "low"]);
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const SNAPSHOT_QUERY_PARAMETERS = new Set(["dateFrom", "dateTo", "accountId"]);
const CANDIDATE_QUERY_PARAMETERS = new Set(["itemId", "days", "limit"]);

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

function forecastRange(dateFromValue: unknown, dateToValue: unknown) {
  return resolveForecastSelection({
    dateFrom: dateValue(dateFromValue, "invalid_forecast_date_from"),
    dateTo: dateValue(dateToValue, "invalid_forecast_date_to"),
  });
}

function timestampValue(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 64) throw new Error(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(code);
  return value;
}

function integerValue(value: unknown, code: string, min?: number, max?: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(code);
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) throw new Error(code);
  return value;
}

function queryInteger(raw: string | null, fallback: number, code: string, min: number, max: number) {
  if (raw === null) return fallback;
  // Number("") and Number(" ") both become zero, and 1e1 becomes 10.
  // Reject ambiguous query text rather than silently changing a candidate search.
  if (!/^\\d+$/.test(raw)) throw new Error(code);
  return integerValue(Number(raw), code, min, max);
}

function nonZeroIntegerValue(value: unknown, code: string) {
  const result = integerValue(value, code);
  if (result === 0) throw new Error(code);
  return result;
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

  if (error instanceof Error && error.message === "invalid_forecast_candidates_contract") {
    return Response.json(
      { error: "invalid_forecast_candidates", code: "invalid_forecast_candidates_contract" },
      { status: 502, headers: HEADERS },
    );
  }

  if (error instanceof Error && error.message === "invalid_forecast_snapshot_contract") {
    return Response.json(
      { error: "invalid_forecast_snapshot", code: "invalid_forecast_snapshot_contract" },
      { status: 502, headers: HEADERS },
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
    if ([...searchParams.keys()].some((name) => searchParams.getAll(name).length > 1)) {
      throw new Error("invalid_forecast_duplicate_parameters");
    }
    const candidateRequest = searchParams.has("itemId");
    const allowedParameters = candidateRequest ? CANDIDATE_QUERY_PARAMETERS : SNAPSHOT_QUERY_PARAMETERS;
    if ([...searchParams.keys()].some((name) => !allowedParameters.has(name))) {
      throw new Error("invalid_forecast_query_parameters");
    }
    const itemId = searchParams.get("itemId");

    if (candidateRequest) {
      const id = requiredUuid(itemId, "invalid_forecast_item_id");
      const daysRaw = searchParams.get("days");
      const limitRaw = searchParams.get("limit");
      const days = queryInteger(daysRaw, 7, "invalid_forecast_candidate_days", 0, 31);
      const limit = queryInteger(limitRaw, 8, "invalid_forecast_candidate_limit", 1, 20);
      const result = await callPersistenceGateway("forecast.candidates", { id, days, limit });
      if (!isForecastCandidateSnapshotForRequest(result, { itemId: id, days, limit })) throw new Error("invalid_forecast_candidates_contract");
      return Response.json(result, { headers: HEADERS });
    }

    const { dateFrom, dateTo } = forecastRange(searchParams.get("dateFrom"), searchParams.get("dateTo"));
    const accountId = nullableUuid(searchParams.get("accountId"), "invalid_forecast_account_id");
    const selection = { dateFrom, dateTo, accountId };
    const result = await callPersistenceGateway("forecast.snapshot", selection);
    if (!isForecastSnapshotForSelection(result, selection)) throw new Error("invalid_forecast_snapshot_contract");
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
      const { dateFrom, dateTo } = forecastRange(row.dateFrom, row.dateTo);
      const payload = {
        dateFrom,
        dateTo,
        accountId: nullableUuid(row.accountId, "invalid_forecast_account_id"),
      };
      const result = await callPersistenceGateway("forecast.refresh", payload);
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "manual") {
      const payload = {
        date: dateValue(row.date, "invalid_forecast_date"),
        concept: stringValue(row.concept, "invalid_forecast_concept", 240),
        amountCents: nonZeroIntegerValue(row.amountCents, "invalid_forecast_amount"),
        accountId: nullableUuid(row.accountId, "invalid_forecast_account_id"),
        categoryId: nullableUuid(row.categoryId, "invalid_forecast_category_id"),
        merchantId: nullableUuid(row.merchantId, "invalid_forecast_merchant_id"),
        confidence: confidenceValue(row.confidence ?? "high"),
      };
      const idempotencyKey = requiredUuid(
        request.headers.get("idempotency-key") ?? row.idempotencyKey,
        "invalid_forecast_idempotency_key",
      );
      const result = await callPersistenceGateway("forecast.manual", { ...payload, idempotencyKey });
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
      const expectedUpdatedAt = timestampValue(row.expectedUpdatedAt, "invalid_forecast_expected_updated_at");
      const result = await callPersistenceGateway("forecast.exclude", { id, excluded: row.excluded, reason, expectedUpdatedAt });
      return Response.json(result, { headers: HEADERS });
    }

    if (action === "reconcile") {
      const transactionId = nullableUuid(row.transactionId, "invalid_forecast_transaction_id");
      const note = stringValue(row.note ?? "", "invalid_forecast_reconciliation_note", 500, true);
      const expectedUpdatedAt = timestampValue(row.expectedUpdatedAt, "invalid_forecast_expected_updated_at");
      const result = await callPersistenceGateway("forecast.reconcile", { id, transactionId, note, expectedUpdatedAt });
      return Response.json(result, { headers: HEADERS });
    }

    throw new Error("invalid_forecast_action");
  } catch (error) {
    return apiError(error);
  }
}
