import { expect, test } from "@playwright/test";
import { configurationRoutes, navigationItems } from "../../app/navigation-items";

// REC-REL-440: audit the ACTUAL launch profile (documents=deferred).
// The ordinary 21-route visual suite runs with Documents enabled, so it cannot
// certify the 20-route release profile. All API reads here are synthetic 503s.
const routes = [...navigationItems.map(item => item.href), ...configurationRoutes];

test("REC-REL-440 · deferred launch exposes exactly 20 canonical destinations", async ({ request }) => {
  const response = await request.get("/api/build");
  expect(response.ok()).toBe(true);
  const build = await response.json();
  expect(build.releaseFeatures).toEqual({
    documents: false, documentOcr: false, documentDriveSync: false,
  });
  expect(routes).toHaveLength(20);
  expect(new Set(routes).size).toBe(20);
  expect(routes).not.toContain("/documents");
  expect(routes).toContain("/configuration/preferences");
  expect(routes).toContain("/transactions");
});

for (const width of [360, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`REC-REL-441 · 20 release destinations ${width}px ${theme} without document links or overflow`, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.route("**/api/**", async route => {
        if (new URL(route.request().url()).pathname === "/api/build") return route.continue();
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"isolated_release_visual_smoke"}' });
      });
      for (const path of routes) {
        await test.step(path, async () => {
          await page.goto(path, { waitUntil: "domcontentloaded" });
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await expect(page.locator("#main-content")).toBeAttached();
          if (width < 600) {
            await expect(page.getByRole("navigation", { name: "Navegación móvil" })).toBeVisible();
          } else {
            await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
          }
          await expect(page.locator('a[href^="/documents"]')).toHaveCount(0);
          const geometry = await page.evaluate(() => ({
            visible: document.documentElement.clientWidth,
            html: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
          }));
          expect(Math.max(geometry.html, geometry.body),
            `Release ${path}: ${width}px ${theme} must not overflow`)
            .toBeLessThanOrEqual(geometry.visible + 1);
        });
      }
      await expect(page.locator('a[href^="/documents"]')).toHaveCount(0);
    });
  }
}
