import { expect, test } from "@playwright/test";

test("FA-UI-032: Preferencias stays on one line in compact mobile navigation", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/build") return route.continue();
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "isolated_visual_smoke" }) });
  });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/configuration/preferences");
      const nav = page.getByRole("navigation", { name: "Áreas de configuración" });
      const summary = nav.locator("details > summary");
      await expect(summary).toBeVisible();
      const current = summary.locator("strong");
      await expect(current).toHaveText("Preferencias");
      const lineCount = await current.evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length;
      });
      expect(lineCount, `No mid-word wrap at ${width}px / ${theme}`).toBe(1);
      await summary.click();
      await expect(nav.getByRole("link", { name: "Fuente bancaria", exact: true })).toBeVisible();
    }
  }
});
