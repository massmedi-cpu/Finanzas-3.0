import { createEdgeConfigurationService } from "../../../../src/infrastructure/persistence/edge-configuration-runtime";
import { callPersistenceGateway } from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";
import {
  isSupportedCategoryColor,
  isSupportedCategoryIcon,
} from "../../../../src/domain/category-visuals";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "preview_only" }, { status: 404 });
  }

  try {
    const service = createEdgeConfigurationService();
    const [accounts, categories, canonicalEngines] = await Promise.all([
      service.listAccounts(),
      service.listCategories(),
      callPersistenceGateway<{
        accountReorderEngine: boolean;
        categoryReorderEngine: boolean;
        categoryMergeEngine: boolean;
      }>("test.invariants"),
    ]);

    const byId = new Map(categories.map((category) => [category.id, category]));
    const ids = new Set(categories.map((category) => category.id));
    const kinds = new Set(categories.filter((category) => category.lifecycle === "active").map((category) => category.kind));

    const checks = [
      { name: "accounts-readable", passed: accounts.length > 0 },
      { name: "category-catalog-populated", passed: categories.length >= 64 },
      { name: "all-category-kinds-present", passed: kinds.has("expense") && kinds.has("income") && kinds.has("transfer") },
      {
        name: "category-visuals-supported",
        passed: categories.every((category) => isSupportedCategoryIcon(category.iconKey) && isSupportedCategoryColor(category.colorToken)),
      },
      {
        name: "category-parent-exists",
        passed: categories.every((category) => !category.parentCategoryId || ids.has(category.parentCategoryId)),
      },
      {
        name: "category-hierarchy-one-level-and-kind-consistent",
        passed: categories.every((category) => {
          if (!category.parentCategoryId) return true;
          const parent = byId.get(category.parentCategoryId);
          return Boolean(parent && parent.parentCategoryId === null && parent.kind === category.kind);
        }),
      },
      { name: "category-identities-unique", passed: ids.size === categories.length },
      { name: "canonical-account-reorder-engine", passed: canonicalEngines.accountReorderEngine },
      { name: "canonical-category-reorder-engine", passed: canonicalEngines.categoryReorderEngine },
      { name: "canonical-category-merge-engine", passed: canonicalEngines.categoryMergeEngine },
    ];

    const passed = checks.filter((check) => check.passed).length;
    return Response.json(
      {
        status: passed === checks.length ? "ok" : "failed",
        passed,
        total: checks.length,
        checks,
        catalog: { accounts: accounts.length, categories: categories.length },
        writeVerification: "covered_by_transactional_database_regression",
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
    return Response.json({ status: "failed", reason: "read_integrity_error" }, { status: 500 });
  }
}
