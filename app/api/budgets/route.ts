import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

function validMonth(value: unknown) {
  if (typeof value !== "string" || !MONTH.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year >= 1;
}

function monthValue(value: unknown) {
  if (!validMonth(value)) throw new Error("invalid_budget_month");
  return value as string;
}

function categoryValue(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("invalid_budget_category_id");
  return value;
}

function manualAmountValue(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("invalid_budget_manual_amount");
  }
  return value;
}

function objectBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_budget_body");
  }
  return value as Record<string, unknown>;
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    if (error.status === 404 && error.code === "budget_category_not_found") {
      return Response.json(
        { error: "not_found", code: error.code },
        { status: 404, headers: HEADERS },
      );
    }

    if (
      error.status === 400 &&
      error.code &&
      (
        error.code.startsWith("invalid_budget_") ||
        error.code === "budget_category_must_be_expense"
      )
    ) {
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

  if (error instanceof Error && error.message.startsWith("invalid_budget_")) {
    return Response.json(
      { error: "invalid_request", code: error.message },
      { status: 400, headers: HEADERS },
    );
  }

  console.error("budget-api-internal", error instanceof Error ? error.name : typeof error);
  return Response.json(
    { error: "internal_error", code: null },
    { status: 500, headers: HEADERS },
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = monthValue(searchParams.get("month"));
    const result = await callPersistenceGateway("budget.snapshot", { month });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const row = objectBody(await request.json().catch(() => null));
    const month = monthValue(row.month);
    const result = await callPersistenceGateway("budget.refresh", { month });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const row = objectBody(await request.json().catch(() => null));
    const month = monthValue(row.month);
    if (!Object.prototype.hasOwnProperty.call(row, "categoryId")) {
      throw new Error("invalid_budget_category_id");
    }
    const categoryId = categoryValue(row.categoryId);
    if (!Object.prototype.hasOwnProperty.call(row, "manualAmountCents")) {
      throw new Error("invalid_budget_manual_amount");
    }
    const manualAmountCents = manualAmountValue(row.manualAmountCents);
    const result = await callPersistenceGateway("budget.set_manual", {
      month,
      categoryId,
      manualAmountCents,
    });
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
