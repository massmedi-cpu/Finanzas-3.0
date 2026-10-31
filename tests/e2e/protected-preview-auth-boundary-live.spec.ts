import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

// CR-001D final release gate: this spec is intentionally exercised against the exact protected Preview SHA.
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
    const body = await response.json();
    if (response.status() === 401) {
      // Personal release preview: the outer auth proxy rejects the request
      // before the persistence gateway or any deferred document handler.
      expect(body).toEqual({ error: "authentication_required", code: null });
    } else if (endpoint === "/api/documents" && response.status() === 404) {
      expect(body).toEqual({ error: "feature_deferred", code: null });
    } else {
      expect(response.status(), `${endpoint} debe fallar cerrado sin workspace`).toBe(403);
      expect(body.code).toBe("workspace_context_required");
      expect(body.error).toEqual(expect.any(String));
    }
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});

test("protected preview no puede abrir el autoservicio de borrado de Production", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const response = await request.get("/api/data/deletion");
  if (response.status() === 401) {
    await expect(response.json()).resolves.toEqual({ error: "authentication_required", code: null });
  } else {
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "workspace_deletion_production_only",
      code: "preview_production_deletion_forbidden",
    });
  }
  expect(response.headers()["cache-control"]).toContain("no-store");
});
