import { createEdgeConfigurationService } from "../../../src/infrastructure/persistence/edge-configuration-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await createEdgeConfigurationService().listCategories();
    return Response.json(
      { categories },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    console.error("category-identity-api", error instanceof Error ? error.message : String(error));
    return Response.json(
      { error: "category_identity_unavailable" },
      { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
}
