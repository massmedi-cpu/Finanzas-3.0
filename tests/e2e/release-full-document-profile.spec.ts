import { expect, test } from "@playwright/test";

/**
 * REC-PUB-FULL-272 · Product acceptance profile is NOT the old restricted
 * 10.0.104 profile. This tests the optimized build's served metadata, not
 * merely the presence of source files or runtime env vars.
 */
test("full release surface exposes Documentos, OCR and DriveSync in exact optimized build", async ({ page }) => {
  const response = await page.request.get("/api/build", { headers: { "cache-control": "no-cache" } });
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const info = await response.json();
  expect(info.releaseFeatures).toEqual({
    documents: true,
    documentOcr: true,
    documentDriveSync: true,
  });

  // Confirm the same built Next app has the actual documents route. Do not
  // contact private Storage, fetch owner data or execute any mutation here.
  const documents = await page.request.get("/documents");
  expect(documents.status()).not.toBe(404);
  const body = await documents.text();
  expect(body).not.toContain('"error":"feature_deferred"');
});
