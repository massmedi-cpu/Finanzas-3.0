import { createEdgeConfigurationService } from "../../../../src/infrastructure/persistence/edge-configuration-runtime";
import { callPersistenceGateway } from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";
import type { Clock, IdentityProvider } from "../../../../src/application/configuration-service";

export const dynamic = "force-dynamic";

const TEST_IDS = {
  account: "10000000-0000-4000-8000-000000000001",
  targetCategory: "20000000-0000-4000-8000-000000000001",
  sourceCategory: "20000000-0000-4000-8000-000000000002",
} as const;

async function cleanup() {
  await callPersistenceGateway<{ ok: true }>("test.cleanup");
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "preview_only" }, { status: 404 });
  }

  const ids = [TEST_IDS.account, TEST_IDS.targetCategory, TEST_IDS.sourceCategory];
  let idIndex = 0;
  let tick = 0;

  const identities: IdentityProvider = {
    nextId: () => ids[idIndex++] ?? crypto.randomUUID(),
  };

  const clock: Clock = {
    now: () => new Date(Date.UTC(2026, 8, 3, 20, 40, tick++)).toISOString(),
  };

  try {
    await cleanup();
    const service = createEdgeConfigurationService({ identities, clock });

    const [beforeAccounts, beforeCategories] = await Promise.all([
      service.listAccounts(),
      service.listCategories(),
    ]);

    const cleanStart =
      !beforeAccounts.some((account) => account.id === TEST_IDS.account) &&
      !beforeCategories.some(
        (category) =>
          category.id === TEST_IDS.targetCategory || category.id === TEST_IDS.sourceCategory,
      );

    const createdAccount = await service.createAccount({
      name: "  Cuenta   validación runtime  ",
      institution: "Banco temporal",
      type: "checking",
      openingBalanceCents: 12345,
      lifecycle: "active",
      sortOrder: 0,
    });

    const updatedAccount = await service.updateAccount(createdAccount.id, {
      name: "Cuenta validación runtime",
      institution: "Banco temporal actualizado",
      type: "checking",
      openingBalanceCents: 12345,
      lifecycle: "active",
      sortOrder: 0,
    });

    const archivedAccount = await service.setAccountArchived(createdAccount.id, true);

    const target = await service.createCategory({
      name: "Destino validación runtime",
      kind: "expense",
      parentCategoryId: null,
      iconKey: "check-circle",
      colorToken: "category.validation.target",
      lifecycle: "active",
      sortOrder: 0,
    });

    const source = await service.createCategory({
      name: "Origen validación runtime",
      kind: "expense",
      parentCategoryId: null,
      iconKey: "merge",
      colorToken: "category.validation.source",
      lifecycle: "active",
      sortOrder: 1,
    });

    const gatewayGuards = await callPersistenceGateway<{
      accountReorderGuard: boolean;
      categoryReorderGuard: boolean;
      activeMergeTargetGuard: boolean;
    }>("test.invariants");

    await service.mergeCategories(source.id, target.id);

    const [afterAccounts, afterCategories] = await Promise.all([
      service.listAccounts(),
      service.listCategories(),
    ]);

    const rereadAccount = afterAccounts.find((account) => account.id === createdAccount.id);
    const rereadTarget = afterCategories.find((category) => category.id === target.id);
    const rereadSource = afterCategories.find((category) => category.id === source.id);

    const checks = [
      { name: "clean-test-start", passed: cleanStart },
      {
        name: "account-created-and-normalized",
        passed:
          createdAccount.id === TEST_IDS.account &&
          createdAccount.name === "Cuenta validación runtime" &&
          createdAccount.currency === "EUR",
      },
      { name: "account-updated", passed: updatedAccount.institution === "Banco temporal actualizado" },
      {
        name: "account-archived-and-reread",
        passed: archivedAccount.lifecycle === "archived" && rereadAccount?.lifecycle === "archived",
      },
      {
        name: "categories-created",
        passed:
          target.id === TEST_IDS.targetCategory &&
          source.id === TEST_IDS.sourceCategory,
      },
      {
        name: "gateway-account-reorder-group-guard",
        passed: gatewayGuards.accountReorderGuard,
      },
      {
        name: "gateway-category-reorder-group-guard",
        passed: gatewayGuards.categoryReorderGuard,
      },
      {
        name: "gateway-active-merge-target-guard",
        passed: gatewayGuards.activeMergeTargetGuard,
      },
      {
        name: "category-merge-reread",
        passed: rereadTarget?.lifecycle === "active" && rereadSource?.lifecycle === "archived",
      },
      { name: "database-roundtrip", passed: Boolean(rereadAccount && rereadTarget && rereadSource) },
    ];

    const passed = checks.filter((check) => check.passed).length;
    return Response.json(
      {
        status: passed === checks.length ? "ok" : "failed",
        passed,
        total: checks.length,
        checks,
      },
      {
        status: passed === checks.length ? 200 : 500,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  } catch (error) {
    console.error(
      "configuration-persistence-health",
      error instanceof Error ? error.message : String(error),
    );
    return Response.json({ status: "failed", reason: "roundtrip_error" }, { status: 500 });
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error(
        "configuration-persistence-cleanup",
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      );
    }
  }
}
