import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

type RuleAction = "rule.save" | "rule.evaluate" | "rule.apply" | "rule.apply_all";
const ALLOWED_ACTIONS = new Set<RuleAction>(["rule.save", "rule.evaluate", "rule.apply", "rule.apply_all"]);

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
  return value as Record<string, unknown>;
}

function optionalId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("invalid_id");
  return value;
}

function requiredText(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function optionalText(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("invalid_text");
  const trimmed = value.trim();
  return trimmed || null;
}

function optionalSafeInteger(value: unknown, code: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(code);
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
  console.error("rules-api", error instanceof Error ? error.message : String(error));
  return Response.json(
    { error: "invalid_request", code: error instanceof Error ? error.message : null },
    { status: 400, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
}

export async function GET() {
  try {
    const [rules, accounts, categories, merchants] = await Promise.all([
      callPersistenceGateway<{ rows: unknown[] }>("rule.list"),
      callPersistenceGateway<{ rows: unknown[] }>("account.list"),
      callPersistenceGateway<{ rows: unknown[] }>("category.list"),
      callPersistenceGateway<{ rows: unknown[] }>("merchant.list"),
    ]);
    return Response.json(
      { rules: rules.rows, accounts: accounts.rows, categories: categories.rows, merchants: merchants.rows },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = asObject(await request.json());
    const operation = requiredText(body.operation, "invalid_operation") as RuleAction;
    if (!ALLOWED_ACTIONS.has(operation)) throw new Error("unsupported_operation");

    if (operation === "rule.save") {
      const status = body.status;
      if (status !== "active" && status !== "disabled") throw new Error("invalid_rule_status");
      if (typeof body.priority !== "number" || !Number.isInteger(body.priority) || body.priority < 0 || body.priority > 1_000_000) {
        throw new Error("invalid_rule_priority");
      }
      const payload = {
        id: optionalId(body.id),
        name: requiredText(body.name, "rule_name_required"),
        status,
        priority: body.priority,
        conceptContains: optionalText(body.conceptContains),
        merchantId: optionalId(body.merchantId),
        accountId: optionalId(body.accountId),
        categoryId: optionalId(body.categoryId),
        minimumAmountCents: optionalSafeInteger(body.minimumAmountCents, "invalid_minimum_amount_cents"),
        maximumAmountCents: optionalSafeInteger(body.maximumAmountCents, "invalid_maximum_amount_cents"),
        targetCategoryId: optionalId(body.targetCategoryId),
        targetMerchantId: optionalId(body.targetMerchantId),
      };
      const hasCondition = Boolean(
        payload.conceptContains || payload.merchantId || payload.accountId || payload.categoryId ||
        payload.minimumAmountCents !== null || payload.maximumAmountCents !== null,
      );
      if (!hasCondition) throw new Error("rule_condition_required");
      if (!payload.targetCategoryId && !payload.targetMerchantId) throw new Error("rule_target_required");
      if (
        payload.minimumAmountCents !== null && payload.maximumAmountCents !== null &&
        payload.minimumAmountCents > payload.maximumAmountCents
      ) {
        throw new Error("invalid_rule_amount_range");
      }
      const result = await callPersistenceGateway("rule.save", payload);
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }

    if (operation === "rule.apply_all") {
      const limit = body.limit ?? 10000;
      if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10000) {
        throw new Error("invalid_rule_apply_limit");
      }
      const result = await callPersistenceGateway("rule.apply_all", { limit });
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }

    const transactionId = requiredText(body.transactionId, "transaction_id_required");
    const result = await callPersistenceGateway(operation, { transactionId });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
