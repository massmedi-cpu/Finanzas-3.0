import { expect, test } from "@playwright/test";

test("Financial App sirve favicon comercial sin respuestas 404", async ({ request }) => {
  const response = await request.get("/favicon.ico");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"] ?? "").toMatch(/image\/(?:x-icon|vnd\.microsoft\.icon|ico)/i);

  const body = await response.body();
  expect(body.byteLength).toBeGreaterThan(1000);
});
