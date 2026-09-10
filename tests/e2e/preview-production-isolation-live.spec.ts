import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("PRE-003 protected preview fails closed without workspace session and blocks writes", async ({ request }) => {
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
    code: "preview_production_write_forbidden",
  });

  const after = await request.get("/api/configuration");
  expect(after.status()).toBe(403);
  await expect(after.json()).resolves.toEqual({
    error: "persistence_failed",
    code: "workspace_context_required",
  });
});
