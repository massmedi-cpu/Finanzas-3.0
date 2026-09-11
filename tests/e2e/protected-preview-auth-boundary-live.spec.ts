import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

const blockedReadEndpoints = [
  "/api/analysis",
  "/api/budgets?month=2026-09",
  "/api/configuration",
  "/api/documents",
  "/api/forecast?dateFrom=2026-09-01&dateTo=2026-09-30",
  "/api/recurrences",
  "/api/transactions?limit=1",
] as const;

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

test("protected preview no puede abrir el autoservicio de borrado de Production", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const response = await request.get("/api/data/deletion");
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "workspace_deletion_production_only",
    code: "preview_production_deletion_forbidden",
  });
});
