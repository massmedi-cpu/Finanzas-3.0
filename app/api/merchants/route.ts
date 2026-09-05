import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

type MerchantAction =
  | "merchant.save"
  | "merchant_alias.save"
  | "merchant_alias.delete"
  | "merchant.resolve";

const ALLOWED_ACTIONS = new Set<MerchantAction>([
  "merchant.save",
  "merchant_alias.save",
  "merchant_alias.delete",
  "merchant.resolve",
]);

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_request");
  }
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

  console.error("merchant-api", error instanceof Error ? error.message : String(error));
  return Response.json(
    { error: "invalid_request", code: error instanceof Error ? error.message : null },
    { status: 400, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
}

export async function GET() {
  try {
    const [merchants, aliases] = await Promise.all([
      callPersistenceGateway<{ rows: unknown[] }>("merchant.list"),
      callPersistenceGateway<{ rows: unknown[] }>("merchant_alias.list"),
    ]);

    return Response.json(
      { merchants: merchants.rows, aliases: aliases.rows },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = asObject(await request.json());
    const operation = requiredText(body.operation, "invalid_operation") as MerchantAction;
    if (!ALLOWED_ACTIONS.has(operation)) throw new Error("unsupported_operation");

    if (operation === "merchant.save") {
      const lifecycle = body.lifecycle;
      if (lifecycle !== "active" && lifecycle !== "archived") {
        throw new Error("invalid_merchant_lifecycle");
      }
      const result = await callPersistenceGateway("merchant.save", {
        id: optionalId(body.id),
        name: requiredText(body.name, "merchant_name_required"),
        defaultCategoryId: optionalId(body.defaultCategoryId),
        lifecycle,
      });
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }

    if (operation === "merchant_alias.save") {
      const result = await callPersistenceGateway("merchant_alias.save", {
        id: optionalId(body.id),
        merchantId: requiredText(body.merchantId, "merchant_id_required"),
        alias: requiredText(body.alias, "merchant_alias_required"),
      });
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }

    if (operation === "merchant_alias.delete") {
      const result = await callPersistenceGateway("merchant_alias.delete", {
        id: requiredText(body.id, "merchant_alias_id_required"),
      });
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }

    const result = await callPersistenceGateway("merchant.resolve", {
      label: requiredText(body.label, "merchant_label_required"),
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
