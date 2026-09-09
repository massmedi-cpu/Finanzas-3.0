import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("PRE-005 protected preview rejects a cross-site login mutation before the public auth route", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const response = await request.post("/api/auth/login", {
    headers: {
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
      "content-type": "application/json",
    },
    data: {},
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: "cross_site_mutation_rejected", code: null });
  expect(response.headers()["cache-control"]).toBe("no-store");
});

test("PRE-005 protected preview preserves same-origin login routing", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const previewUrl = process.env.VERCEL_PREVIEW_URL!;
  const origin = new URL(previewUrl.startsWith("http") ? previewUrl : `https://${previewUrl}`).origin;
  const response = await request.post("/api/auth/login", {
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    data: {},
  });

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "invalid_credentials", code: null });
});
