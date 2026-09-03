import { ConfigurationValidationError } from "../../../src/application/configuration-commands";
import { ConfigurationNotFoundError } from "../../../src/application/configuration-service";
import type { AccountDraft, CategoryDraft } from "../../../src/domain/configuration";
import type { EntityId } from "../../../src/domain/models";
import { PersistenceGatewayError } from "../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { createEdgeConfigurationService } from "../../../src/infrastructure/persistence/edge-configuration-runtime";

export const dynamic = "force-dynamic";

function apiError(error: unknown) {
  if (error instanceof ConfigurationValidationError) {
    return Response.json(
      { error: "validation_failed", issues: error.issues },
      { status: 422 },
    );
  }

  if (error instanceof ConfigurationNotFoundError) {
    return Response.json({ error: "not_found", message: error.message }, { status: 404 });
  }

  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503 },
    );
  }

  console.error("configuration-api", error instanceof Error ? error.message : String(error));
  return Response.json({ error: "invalid_request" }, { status: 400 });
}

export async function GET() {
  try {
    const service = createEdgeConfigurationService();
    const [accounts, categories] = await Promise.all([
      service.listAccounts(),
      service.listCategories(),
    ]);

    return Response.json(
      { accounts, categories },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const operation = body.operation;
    const service = createEdgeConfigurationService();

    switch (operation) {
      case "account.create":
        return Response.json(
          { account: await service.createAccount(body.draft as AccountDraft) },
          { status: 201 },
        );

      case "account.update":
        return Response.json({
          account: await service.updateAccount(body.id as EntityId, body.draft as AccountDraft),
        });

      case "account.archive":
        return Response.json({
          account: await service.setAccountArchived(body.id as EntityId, Boolean(body.archived)),
        });

      case "account.reorder":
        await service.reorderAccounts(body.orderedIds as EntityId[]);
        return Response.json({ ok: true });

      case "category.create":
        return Response.json(
          { category: await service.createCategory(body.draft as CategoryDraft) },
          { status: 201 },
        );

      case "category.update":
        return Response.json({
          category: await service.updateCategory(body.id as EntityId, body.draft as CategoryDraft),
        });

      case "category.archive":
        return Response.json({
          category: await service.setCategoryArchived(body.id as EntityId, Boolean(body.archived)),
        });

      case "category.reorder":
        await service.reorderCategories(body.orderedIds as EntityId[]);
        return Response.json({ ok: true });

      case "category.merge":
        await service.mergeCategories(
          body.sourceCategoryId as EntityId,
          body.targetCategoryId as EntityId,
        );
        return Response.json({ ok: true });

      default:
        return Response.json({ error: "unsupported_operation" }, { status: 400 });
    }
  } catch (error) {
    return apiError(error);
  }
}
