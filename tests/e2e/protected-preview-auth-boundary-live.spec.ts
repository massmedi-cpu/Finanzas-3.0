import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

const blockedReadEndpoints = [
  "/api/analysis",
  "/api/budgets",
  "/api/configuration",
  "/api/documents",
  "/api/forecast",
  "/api/recurrences",
  "/api/transactions?limit=1",
] as const;

test("protected preview mantiene la superficie privada detrás del acceso de aplicación", async ({ page }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test("protected preview bloquea toda la superficie financiera sin workspace autenticado", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  for (const endpoint of blockedReadEndpoints) {
    const response = await request.get(endpoint);
    expect(response.status(), `${endpoint} debe fallar cerrado sin workspace`).toBe(403);

    const body = await response.json();
    expect(body, `${endpoint} debe conservar el código canónico de frontera de workspace`).toMatchObject({
      code: "workspace_context_required",
    });
    expect(body.error, `${endpoint} debe aportar un error de módulo no vacío`).toEqual(expect.any(String));
    expect(body.error.length, `${endpoint} debe aportar un error de módulo no vacío`).toBeGreaterThan(0);
  }
});
