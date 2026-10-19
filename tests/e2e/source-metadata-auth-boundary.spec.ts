import { expect, test } from "@playwright/test";
import { GOOGLE_OAUTH_STATE_COOKIE } from "../../src/infrastructure/google/google-source-runtime";

// Anonymous GET only. Never run a mutation against a financial source.
test("REC-AUTH-205 · metadata de Google requiere la sesión propia de Financial App", async ({ request }) => {
  const response = await request.get("/api/source/google/status");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body).toMatchObject({ error: "authentication_required" });
  expect(body).not.toHaveProperty("connection");
  expect(body).not.toHaveProperty("authMode");
  expect(body).not.toHaveProperty("accountEmail");
});

test("REC-AUTH-206 · las rutas de estado no confunden anonimato con caída bancaria", async ({ request }) => {
  for (const path of ["/api/health/source-runtime", "/api/source/google/sync"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("authentication_required");
    expect(body).not.toHaveProperty("capabilities");
    expect(body).not.toHaveProperty("run");
    expect(body).not.toHaveProperty("cursors");
  }
});


test("REC-AUTH-215 · iniciar OAuth exige sesión y workspace antes de emitir state", async ({ request }) => {
  const response = await request.get("/api/source/google/connect", { maxRedirects: 0 });
  expect(response.status()).toBe(401);
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(await response.json()).toEqual({ error: "authentication_required" });
});

test("REC-AUTH-216 · callback OAuth con state válido pero sin sesión no canjea tokens", async ({ request }) => {
  const state = "0123456789abcdef0123456789abcdef";
  const response = await request.get(`/api/source/google/callback?state=${state}&code=synthetic-code`, {
    maxRedirects: 0,
    headers: { cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=${state}` },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "authentication_required" });
});
