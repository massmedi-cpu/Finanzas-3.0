import { expect, test } from "@playwright/test";
import { navigationItems } from "../../app/navigation-items";

// Shell-only smoke: isolates live APIs, never certifies banking data or backend behavior.
const destinations = navigationItems.map((item) => ({ path: item.href, label: item.label }));
test.describe("REC-VIS-004 · shell de navegación responsive", () => {
  for (const width of [390, 1440]) for (const colorScheme of ["light", "dark"] as const) {
    test(`${destinations.length} destinos a ${width}px y tema ${colorScheme}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium-desktop", "Matriz completa recorrida en proyecto desktop");
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.route("**/api/**", async (route) => {
        if (new URL(route.request().url()).pathname === "/api/build") return route.continue();
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "isolated_visual_smoke" }) });
      });
      for (const { path, label } of destinations) {
        await test.step(`${path}: navegación, tema y anchura`, async () => {
          await page.goto(path, { waitUntil: "domcontentloaded" });
          await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
          await expect(page.locator("#main-content")).toBeAttached();
          if (width < 600) {
            await expect(page.getByRole("navigation", { name: "Navegación móvil" })).toBeVisible();
          } else {
            const nav = page.getByRole("navigation", { name: "Navegación principal" });
            await expect(nav).toBeVisible();
            await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
          }
          const geometry = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            page: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
          }));
          expect(Math.max(geometry.page, geometry.body), `${path} ${width}px ${colorScheme} must not overflow`)
            .toBeLessThanOrEqual(geometry.width + 1);
        });
      }
    });
  }
});
