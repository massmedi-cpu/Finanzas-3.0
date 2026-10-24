import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("PRE-003 protected preview denies workspace reads without session (GET-only)", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  // PRE-003 must NEVER issue account.create or any other live POST here:
  // the preview points to the production database and a regression in its
  // security boundary must not turn a safety test into an unintended write.
  // Separate PRE-003 gateway source checks prove the preview's write deny
  // occurs before obtaining the PostgreSQL connection.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request.get("/api/configuration");
    const body = await response.json();
    // Older protected previews deny at the workspace gateway; the release
    // candidate denies earlier at app auth. Neither may leak private data.
    if (response.status() === 401) {
      expect(body).toEqual({ error: "authentication_required", code: null });
    } else {
      expect(response.status()).toBe(403);
      expect(body).toEqual({ error: "persistence_failed", code: "workspace_context_required" });
    }
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
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
