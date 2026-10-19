import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("PRE-003 protected preview fails closed without workspace session for reads and writes", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const before = await request.get("/api/configuration");
  expect(before.status()).toBe(403);
  await expect(before.json()).resolves.toEqual({
    error: "persistence_failed",
    code: "workspace_context_required",
  });

  const blocked = await request.post("/api/configuration", {
    data: {
      operation: "account.create",
      draft: {
        name: `PRE003-PREVIEW-BLOCK-${Date.now()}`,
        institution: "PRE-003 isolation probe",
        type: "checking",
        openingBalanceCents: 12345,
        lifecycle: "active",
        sortOrder: 9999,
      },
    },
  });

  expect(blocked.status()).toBe(403);
  await expect(blocked.json()).resolves.toEqual({
    error: "persistence_failed",
    code: "workspace_context_required",
  });

  const after = await request.get("/api/configuration");
  expect(after.status()).toBe(403);
  await expect(after.json()).resolves.toEqual({
    error: "persistence_failed",
    code: "workspace_context_required",
  });
});


test("REC-AUTH-209 · preview protegida no expone conexión de Google sin sesión de Financial App", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires exact protected preview and trusted bypass");
  // Safe GETs only. Never invoke a real source preflight, sync, DELETE or mutation.
  const result = await request.get("/api/source/google/status");
  expect(result.status()).toBe(401);
  expect(result.headers()["cache-control"]).toContain("no-store");
  const body = await result.json();
  expect(body).toEqual({ error: "authentication_required" });
  expect(body).not.toHaveProperty("connection");
  expect(body).not.toHaveProperty("accountEmail");
  expect(body).not.toHaveProperty("authMode");
});

test("REC-AUTH-210 · preview protegida rechaza lectura de estado financiero sin sesión", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires exact protected preview and trusted bypass");
  for (const path of ["/api/health/source-runtime", "/api/source/google/sync"]) {
    const result = await request.get(path);
    expect(result.status()).toBe(401);
    const body = await result.json();
    expect(body).toEqual({ error: "authentication_required" });
  }
});
