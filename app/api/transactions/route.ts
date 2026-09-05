import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["income", "expense", "transfer", "refund", "adjustment"]);
const REVIEW_STATES = new Set(["confirmed", "pending", "needs_review"]);
const DUPLICATE_STATES = new Set(["none", "suspected", "confirmed"]);

function optionalText(params: URLSearchParams, key: string, maxLength = 160) {
  const value = params.get(key)?.trim() ?? "";
  if (!value) return null;
  if (value.length > maxLength) throw new Error(`invalid_${key}`);
  return value;
}

function optionalUuid(params: URLSearchParams, key: string) {
  const value = optionalText(params, key, 64);
  if (value === null) return null;
  if (!UUID.test(value)) throw new Error(`invalid_${key}`);
  return value;
}

function optionalDate(params: URLSearchParams, key: string) {
  const value = optionalText(params, key, 10);
  if (value === null) return null;
  if (!DATE.test(value)) throw new Error(`invalid_${key}`);
  return value;
}

function optionalEnum(params: URLSearchParams, key: string, allowed: Set<string>) {
  const value = optionalText(params, key, 32);
  if (value === null) return null;
  if (!allowed.has(value)) throw new Error(`invalid_${key}`);
  return value;
}

function pageLimit(params: URLSearchParams) {
  const raw = params.get("limit");
  if (raw === null || raw === "") return 50;
  if (!/^\d+$/.test(raw)) throw new Error("invalid_limit");
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("invalid_limit");
  return value;
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "persistence_failed", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  }
  console.error("transactions-api", error instanceof Error ? error.message : String(error));
  return Response.json(
    { error: "invalid_request", code: error instanceof Error ? error.message : null },
    { status: 400, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("mode") === "facets") {
      const result = await callPersistenceGateway("transaction.facets");
      return Response.json(result, {
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      });
    }

    const dateFrom = optionalDate(searchParams, "dateFrom");
    const dateTo = optionalDate(searchParams, "dateTo");
    if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("invalid_date_range");

    const cursorBankDate = optionalDate(searchParams, "cursorBankDate");
    const cursorId = optionalUuid(searchParams, "cursorId");
    if ((cursorBankDate === null) !== (cursorId === null)) throw new Error("invalid_cursor");

    const result = await callPersistenceGateway("transaction.query", {
      query: optionalText(searchParams, "q"),
      accountId: optionalUuid(searchParams, "accountId"),
      categoryId: optionalUuid(searchParams, "categoryId"),
      merchantId: optionalUuid(searchParams, "merchantId"),
      kind: optionalEnum(searchParams, "kind", KINDS),
      reviewState: optionalEnum(searchParams, "reviewState", REVIEW_STATES),
      duplicateState: optionalEnum(searchParams, "duplicateState", DUPLICATE_STATES),
      dateFrom,
      dateTo,
      cursorBankDate,
      cursorId,
      limit: pageLimit(searchParams),
    });

    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  } catch (error) {
    return apiError(error);
  }
}
