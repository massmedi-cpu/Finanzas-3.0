import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("Previsión protegida conserva procedencia verificada y falla cerrada sin workspace", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const build = await request.get("/api/build");
  expect(build.status()).toBe(200);
  const buildJson = await build.json();
  expect(buildJson.phase).toBeGreaterThanOrEqual(8);
  if (buildJson.phase === 8) expect(buildJson.phaseName).toBe("Previsión");

  const expectedPreviewSha = process.env.FORECAST_PREVIEW_SHA ?? process.env.GITHUB_SHA;
  if (expectedPreviewSha) expect(buildJson.commit).toBe(expectedPreviewSha);

  const snapshot = await request.get("/api/forecast?dateFrom=2026-09-07&dateTo=2026-12-31");
  expect(snapshot.status()).toBe(403);
  await expect(snapshot.json()).resolves.toEqual({
    error: "persistence_failed",
    code: "workspace_context_required",
  });
});
