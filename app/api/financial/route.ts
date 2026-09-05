import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MODES = new Set(["snapshot", "period", "balances", "monthly"]);
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

function optionalText(params: URLSearchParams, key: string, maxLength: number) {
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

function optionalBoolean(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (value === null || value === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`invalid_${key}`);
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  console.error("financial-api", error instanceof Error ? error.message : String(error));
  return Response.json(
    { error: "invalid_request", code: error instanceof Error ? error.message : null },
    { status: 400, headers: HEADERS },
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = optionalText(searchParams, "mode", 16) ?? "snapshot";
    if (!MODES.has(mode)) throw new Error("invalid_mode");

    const dateFrom = optionalDate(searchParams, "dateFrom");
    const dateTo = optionalDate(searchParams, "dateTo");
    if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("invalid_financial_date_range");
    const accountId = optionalUuid(searchParams, "accountId");
    const includeArchived = optionalBoolean(searchParams, "includeArchived");

    const action = mode === "period"
      ? "financial.period"
      : mode === "balances"
        ? "financial.balances"
        : mode === "monthly"
          ? "financial.monthly"
          : "financial.snapshot";

    const payload = mode === "balances"
      ? { asOfDate: dateTo, includeArchived }
      : { dateFrom, dateTo, accountId, includeArchived };

    const result = await callPersistenceGateway(action, payload);
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
