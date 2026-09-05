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
const DUPLICATE_DECISIONS = new Set(["confirmed", "dismissed"]);
const PATCH_FIELDS = new Set([
  "concept",
  "merchantMode",
  "merchantId",
  "categoryMode",
  "categoryId",
  "kind",
  "reviewState",
  "excludedFromAnalytics",
  "note",
]);

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

function requiredUuid(params: URLSearchParams, key: string) {
  const value = optionalUuid(params, key);
  if (!value) throw new Error(`invalid_${key}`);
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

function optionalBoolean(params: URLSearchParams, key: string) {
  const raw = params.get(key);
  if (raw === null || raw === "") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`invalid_${key}`);
}

function pageLimit(params: URLSearchParams) {
  const raw = params.get("limit");
  if (raw === null || raw === "") return 50;
  if (!/^\d+$/.test(raw)) throw new Error("invalid_limit");
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("invalid_limit");
  return value;
}

function transferDayWindow(params: URLSearchParams) {
  const raw = params.get("dayWindow");
  if (raw === null || raw === "") return 3;
  if (!/^\d+$/.test(raw)) throw new Error("invalid_transfer_day_window");
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 7) throw new Error("invalid_transfer_day_window");
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

function validatePatchBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_patch_body");
  const body = value as Record<string, unknown>;
  const ids = body.transactionIds;
  const patch = body.patch;

  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 200) throw new Error("invalid_transaction_ids");
  if (ids.some((id) => typeof id !== "string" || !UUID.test(id))) throw new Error("invalid_transaction_ids");
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_transaction_ids");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("invalid_transaction_patch");

  const keys = Object.keys(patch as Record<string, unknown>);
  if (keys.length < 1 || keys.some((key) => !PATCH_FIELDS.has(key))) throw new Error("invalid_transaction_patch");
  return { transactionIds: ids as string[], patch: patch as Record<string, unknown> };
}

function reviewBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_review_body");
  const body = value as Record<string, unknown>;
  if (typeof body.action !== "string") throw new Error("invalid_review_action");
  if (typeof body.transactionId !== "string" || !UUID.test(body.transactionId)) throw new Error("invalid_transaction_id");

  if (body.action === "duplicate-review") {
    if (typeof body.decision !== "string" || !DUPLICATE_DECISIONS.has(body.decision)) {
      throw new Error("invalid_duplicate_review_decision");
    }
    return { action: body.action, transactionId: body.transactionId, decision: body.decision } as const;
  }
  if (body.action === "transfer-pair") {
    if (typeof body.pairId !== "string" || !UUID.test(body.pairId) || body.pairId === body.transactionId) {
      throw new Error("invalid_pair_id");
    }
    return { action: body.action, transactionId: body.transactionId, pairId: body.pairId } as const;
  }
  if (body.action === "transfer-unpair") {
    return { action: body.action, transactionId: body.transactionId } as const;
  }
  throw new Error("invalid_review_action");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");
    if (mode === "facets") {
      const result = await callPersistenceGateway("transaction.facets");
      return Response.json(result, {
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      });
    }
    if (mode === "duplicate-group") {
      const result = await callPersistenceGateway("transaction.duplicate_group", {
        transactionId: requiredUuid(searchParams, "transactionId"),
      });
      return Response.json(result, {
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      });
    }
    if (mode === "transfer-candidates") {
      const result = await callPersistenceGateway("transaction.transfer_candidates", {
        transactionId: requiredUuid(searchParams, "transactionId"),
        dayWindow: transferDayWindow(searchParams),
      });
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

    const uncategorized = optionalBoolean(searchParams, "uncategorized");
    const categoryId = optionalUuid(searchParams, "categoryId");
    if (uncategorized && categoryId) throw new Error("invalid_category_filter_combination");

    const result = await callPersistenceGateway("transaction.query", {
      query: optionalText(searchParams, "q"),
      accountId: optionalUuid(searchParams, "accountId"),
      categoryId,
      merchantId: optionalUuid(searchParams, "merchantId"),
      kind: optionalEnum(searchParams, "kind", KINDS),
      reviewState: optionalEnum(searchParams, "reviewState", REVIEW_STATES),
      duplicateState: optionalEnum(searchParams, "duplicateState", DUPLICATE_STATES),
      dateFrom,
      dateTo,
      cursorBankDate,
      cursorId,
      limit: pageLimit(searchParams),
      uncategorized,
    });

    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const raw = await request.json().catch(() => null);
    const { transactionIds, patch } = validatePatchBody(raw);
    const result = await callPersistenceGateway("transaction.patch", { transactionIds, patch });
    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const command = reviewBody(await request.json().catch(() => null));
    const result = command.action === "duplicate-review"
      ? await callPersistenceGateway("transaction.duplicate_review", command)
      : command.action === "transfer-pair"
        ? await callPersistenceGateway("transaction.transfer_pair", command)
        : await callPersistenceGateway("transaction.transfer_unpair", command);
    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  } catch (error) {
    return apiError(error);
  }
}
