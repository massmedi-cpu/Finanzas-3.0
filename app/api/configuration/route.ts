import { ConfigurationValidationError } from "../../../src/application/configuration-commands";
import {
  ConfigurationRequestError,
  parseConfigurationApiCommand,
} from "../../../src/application/configuration-api-contract";
import { ConfigurationNotFoundError } from "../../../src/application/configuration-service";
import { PersistenceGatewayError } from "../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { createEdgeConfigurationService } from "../../../src/infrastructure/persistence/edge-configuration-runtime";

export const dynamic = "force-dynamic";

function apiError(error: unknown) {
  if (error instanceof ConfigurationRequestError) {
    return Response.json(
      { error: "invalid_request", code: error.code, message: error.message },
      { status: 400 },
    );
  }

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
    const command = parseConfigurationApiCommand(await request.json());
    const service = createEdgeConfigurationService();

    switch (command.operation) {
      case "account.create":
        return Response.json(
          { account: await service.createAccount(command.draft) },
          { status: 201 },
        );

      case "account.update":
        return Response.json({
          account: await service.updateAccount(command.id, command.draft),
        });

      case "account.archive":
        return Response.json({
          account: await service.setAccountArchived(command.id, command.archived),
        });

      case "account.reorder":
        await service.reorderAccounts(command.orderedIds);
        return Response.json({ ok: true });

      case "category.create":
        return Response.json(
          { category: await service.createCategory(command.draft) },
          { status: 201 },
        );

      case "category.update":
        return Response.json({
          category: await service.updateCategory(command.id, command.draft),
        });

      case "category.archive":
        return Response.json({
          category: await service.setCategoryArchived(command.id, command.archived),
        });

      case "category.reorder":
        await service.reorderCategories(command.orderedIds);
        return Response.json({ ok: true });

      case "category.merge":
        await service.mergeCategories(command.sourceCategoryId, command.targetCategoryId);
        return Response.json({ ok: true });
    }
  } catch (error) {
    return apiError(error);
  }
}
