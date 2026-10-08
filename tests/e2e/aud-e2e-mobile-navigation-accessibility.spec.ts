import { expect, test } from "@playwright/test";

test.describe("AUD-E2E-VAL-001 · navegación móvil accesible", () => {
  for (const width of [360, 390, 768]) {
    test(`el panel Más conserva teclado, foco y ancho en ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto("/onboarding");

      const dock = page.getByRole("navigation", { name: "Navegación móvil" });
      const more = dock.getByRole("button", { name: "Más", exact: true });
      await expect(more).toBeVisible();
      await more.focus();
      await page.keyboard.press("Enter");

      const panel = page.locator("#mobile-more-navigation");
      const close = panel.getByRole("button", { name: "Cerrar más secciones" });
      await expect(more).toHaveAttribute("aria-expanded", "true");
      await expect(close).toBeVisible();
      await expect(close).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(panel.getByRole("navigation", { name: "Más secciones" }).getByRole("link").first()).toBeFocused();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      await page.keyboard.press("Escape");
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(more).toBeFocused();

      await more.click();
      await close.click();
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(more).toBeFocused();
    });
  }

  test("el panel se cierra al tocar fuera sin secuestrar el foco del usuario", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto("/onboarding");

    const more = page.getByRole("navigation", { name: "Navegación móvil" }).getByRole("button", { name: "Más", exact: true });
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await page.locator(".premium-nav-frame").click({ position: { x: 5, y: 5 } });
    await expect(more).toHaveAttribute("aria-expanded", "false");
  });
});

test("AUD-E2E-NAV-001 · salto de móvil a escritorio cierra Más y recupera el foco visible", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: '{"error":"isolated_mobile_navigation"}',
  }));
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  const mobile = page.getByRole("navigation", { name: "Navegación móvil" });
  const more = mobile.getByRole("button", { name: "Más", exact: true });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Cerrar más secciones" })).toBeFocused();

  await page.setViewportSize({ width: 820, height: 900 });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(mobile).toBeHidden();
  const desktop = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(desktop).toBeVisible();
  await expect(desktop.locator('[aria-current="page"]')).toBeFocused();

  await page.setViewportSize({ width: 390, height: 780 });
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "false");
});
