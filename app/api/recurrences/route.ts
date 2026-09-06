import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CANDIDATE_KEY = /^[0-9a-f]{32}$/i;
const STATUSES = new Set(["active", "ignored", "archived"]);
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

function objectBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_recurrence_body");
  }
  return value as Record<string, unknown>;
}

function nullableUuid(value: unknown, code: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(code);
  return value;
}

function requiredUuid(value: unknown, code: string) {
  const result = nullableUuid(value, code);
  if (!result) throw new Error(code);
  return result;
}

function nullableDate(value: unknown, code: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(code);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(code);
  }
  return value;
}

function integerValue(value: unknown, code: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(code);
  }
  return value;
}

function enumValue(value: unknown, code: string, allowed: Set<string>) {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(code);
  return value;
}

function candidateKeyValue(value: unknown) {
  if (typeof value !== "string" || !CANDIDATE_KEY.test(value)) {
    throw new Error("invalid_recurrence_candidate_key");
  }
  return value.toLowerCase();
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    if (
      error.status === 404 &&
      (error.code === "recurrence_not_found" || error.code === "recurrence_candidate_not_found")
    ) {
      return Response.json(
        { error: "not_found", code: error.code },
        { status: 404, headers: HEADERS },
      );
    }
    if (error.status === 400 && error.code?.startsWith("invalid_recurrence_")) {
      return Response.json(
        { error: "invalid_request", code: error.code },
        { status: 400, headers: HEADERS },
      );
    }
    return Response.json(
      { error: "persistence_failed", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: HEADERS,
      },
    );
  }

  if (error instanceof Error && error.message.startsWith("invalid_recurrence_")) {
    return Response.json(
      { error: "invalid_request", code: error.message },
      { status: 400, headers: HEADERS },
    );
  }

  console.error("recurrence-api-internal", error instanceof Error ? error.name : typeof error);
  return Response.json(
    { error: "internal_error", code: null },
    { status: 500, headers: HEADERS },
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = nullableDate(searchParams.get("dateFrom"), "invalid_recurrence_date_from");
    const dateTo = nullableDate(searchParams.get("dateTo"), "invalid_recurrence_date_to");
    const minRaw = searchParams.get("minOccurrences");
    const minOccurrences = minRaw === null
      ? 3
      : integerValue(Number(minRaw), "invalid_recurrence_min_occurrences", 3, 24);

    const result = await callPersistenceGateway("recurrence.snapshot", {
      dateFrom,
      dateTo,
      minOccurrences,
    });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const row = objectBody(await request.json().catch(() => null));
    const payload = {
      candidateKey: candidateKeyValue(row.candidateKey),
      status: enumValue(row.status, "invalid_recurrence_status", STATUSES),
      dateFrom: nullableDate(row.dateFrom, "invalid_recurrence_date_from"),
      dateTo: nullableDate(row.dateTo, "invalid_recurrence_date_to"),
      minOccurrences: row.minOccurrences === undefined
        ? 3
        : integerValue(row.minOccurrences, "invalid_recurrence_min_occurrences", 3, 24),
    };

    const result = await callPersistenceGateway("recurrence.save", payload);
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const row = objectBody(await request.json().catch(() => null));
    const id = requiredUuid(row.id, "invalid_recurrence_id");
    const status = enumValue(row.status, "invalid_recurrence_status", STATUSES);
    const result = await callPersistenceGateway("recurrence.status", { id, status });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
