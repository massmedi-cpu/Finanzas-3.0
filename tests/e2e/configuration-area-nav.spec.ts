import { expect, test } from "@playwright/test";

const destinations = [
  { label: "Cuentas y categorías", href: "/configuration" },
  { label: "Comercios y alias", href: "/configuration/merchants" },
  { label: "Reglas", href: "/configuration/rules" },
  { label: "Fuente bancaria", href: "/configuration/source" },
  { label: "Datos y privacidad", href: "/configuration/data" },
] as const;

test("configuration area navigation is semantic, touch-safe and mobile-friendly", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/configuration");

  const nav = page.getByRole("navigation", { name: "Áreas de configuración" });
  await expect(nav).toBeVisible();

  for (const destination of destinations) {
    const link = nav.getByRole("link", { name: destination.label });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", destination.href);

    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await expect(nav.getByRole("link", { name: "Cuentas y categorías" })).toHaveAttribute("aria-current", "page");
  await expect(nav.locator("svg")).toHaveCount(5);

  const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fitsViewport).toBe(true);

  const firstLink = nav.getByRole("link", { name: "Cuentas y categorías" });
  await firstLink.focus();
  await expect(firstLink).toBeFocused();
});
