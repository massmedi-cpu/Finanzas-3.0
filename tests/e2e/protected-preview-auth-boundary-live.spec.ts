import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

const blockedReadEndpoints = [
  "/api/accounts",
  "/api/analysis",
  "/api/budgets",
  "/api/configuration",
  "/api/documents",
  "/api/forecast",
  "/api/recurrences",
  "/api/transactions?limit=1",
] as const;

test("protected preview mantiene la navegación privada detrás del login de aplicación", async ({ page }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  await page.goto("/");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();
});

test("protected preview bloquea toda la superficie financiera sin workspace autenticado", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  for (const endpoint of blockedReadEndpoints) {
    const response = await request.get(endpoint);
    expect(response.status(), `${endpoint} debe fallar cerrado sin workspace`).toBe(403);
    await expect(response.json(), `${endpoint} debe devolver el contrato de frontera de workspace`).resolves.toEqual({
      error: "persistence_failed",
      code: "workspace_context_required",
    });
  }
});
