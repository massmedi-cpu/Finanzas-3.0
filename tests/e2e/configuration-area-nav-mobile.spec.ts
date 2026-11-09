import { expect, test } from "@playwright/test";

test("FA-UI-032: Preferencias stays on one line in compact mobile navigation", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/build") return route.continue();
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "isolated_visual_smoke" }) });
  });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [320, 360, 390]) {
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
      await expect(nav.locator("details a")).toHaveCount(7);
      await expect(nav.getByRole("link", { name: "Preferencias", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(nav.getByRole("link", { name: "Fuente bancaria", exact: true })).toBeVisible();
    }
  }
});

test("REC-UI-624 · diagnóstico vuelve a Fuente bancaria por teclado y tacto en móvil", async ({ page }) => {
  // No real bank access. The breadcrumb remains usable even if all APIs fail.
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/build") return route.continue();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "isolated_navigation_smoke" }),
    });
  });

  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 667 });
      await page.goto("/configuration/source/diagnostics");
      await expect(page.getByRole("heading", {
        name: "Diagnóstico de la fuente bancaria", exact: true,
      })).toBeVisible();
      const back = page.getByRole("link", { name: "Volver a Fuente bancaria" });
      await expect(back).toHaveAttribute("href", "/configuration/source");
      await expect(back).toBeVisible();

      // Keyboard activation covers focusable navigation, even in an API outage.
      await back.focus();
      await expect(back).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/configuration\/source(?:\?|$)/);
      await expect(page.getByRole("heading", { name: "Fuente bancaria", exact: true })).toBeVisible();
    }
  }
});
