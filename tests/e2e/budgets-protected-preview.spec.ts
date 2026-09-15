import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("Presupuestos protegido conserva procedencia y falla cerrado sin workspace", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const build = await request.get("/api/build");
  expect(build.status()).toBe(200);
  const buildJson = await build.json();
  expect(buildJson.phase).toBeGreaterThanOrEqual(6);
  expect(buildJson.environment).toBe("preview");
  const expectedPreviewSha = process.env.BUDGETS_PREVIEW_SHA;
  if (expectedPreviewSha) expect(buildJson.commit).toBe(expectedPreviewSha);

  const snapshot = await request.get("/api/budgets?month=2026-09");
  expect(snapshot.status()).toBe(403);
  await expect(snapshot.json()).resolves.toEqual({
    error: "persistence_failed",
    code: "workspace_context_required",
  });

  const refresh = await request.post("/api/budgets", { data: { month: "2026-09" } });
  expect(refresh.status()).toBe(403);
  await expect(refresh.json()).resolves.toEqual({
    error: "persistence_failed",
    code: "preview_production_write_forbidden",
  });
});
