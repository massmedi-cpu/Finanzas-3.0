import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("PRE-003 protected preview rejects a valid account write and leaves no Production residue", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const marker = `PRE003-PREVIEW-BLOCK-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const before = await request.get("/api/configuration");
  expect(before.ok()).toBeTruthy();
  const beforePayload = await before.json();
  expect(Array.isArray(beforePayload.accounts)).toBe(true);
  expect(beforePayload.accounts.some((account: any) => account?.name === marker)).toBe(false);

  const blocked = await request.post("/api/configuration", {
    data: {
      operation: "account.create",
      draft: {
        name: marker,
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
  expect(after.ok()).toBeTruthy();
  const afterPayload = await after.json();
  expect(Array.isArray(afterPayload.accounts)).toBe(true);
  expect(afterPayload.accounts.some((account: any) => account?.name === marker)).toBe(false);
});
