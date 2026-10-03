import { expect, test } from "@playwright/test";
import { navigationItems } from "../../app/navigation-items";

const productHrefs = navigationItems.map((item) => item.href);

function normalizeHref(value: string | null) {
  if (!value) return null;
  return new URL(value, "http://localhost").pathname;
}

test.describe("ART-009 · navegación de producto única", () => {
  test("desktop expone todos los destinos desde una sola navegación y marca la ruta activa", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const mainNav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(mainNav).toHaveCount(1);
    await expect(page.locator("#main-content nav")).toHaveCount(0);

    const hrefs = await mainNav.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const normalized = new Set(hrefs.map(normalizeHref).filter(Boolean));
    for (const href of productHrefs) expect(normalized.has(href), `destino desktop ${href}`).toBe(true);

    await expect(mainNav.locator('[aria-current="page"]')).toHaveAttribute("href", "/");

    await page.goto("/recurrences");
    const recurrenceNav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(recurrenceNav.locator('[aria-current="page"]')).toHaveAttribute("href", "/recurrences");
    await expect(page.locator("#main-content nav")).toHaveCount(0);
  });

  test("móvil mantiene dock persistente, Más como única expansión y acceso a todos los destinos", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const mobileNav = page.getByRole("navigation", { name: "Navegación móvil" });
    await expect(mobileNav).toHaveCount(1);
    await expect(page.locator("#main-content nav")).toHaveCount(0);
    await expect(mobileNav.locator('[aria-current="page"]')).toHaveAttribute("href", "/");

    const moreButton = mobileNav.getByRole("button", { name: "Más" });
    await expect(moreButton).toHaveAttribute("aria-expanded", "false");
    await moreButton.click();
    await expect(moreButton).toHaveAttribute("aria-expanded", "true");

    const moreNav = page.getByRole("navigation", { name: "Más secciones" });
    await expect(moreNav).toHaveCount(1);

    const hrefs = await page.locator('nav[aria-label="Navegación móvil"] a[href], nav[aria-label="Más secciones"] a[href]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const normalized = new Set(hrefs.map(normalizeHref).filter(Boolean));
    for (const href of productHrefs) expect(normalized.has(href), `destino móvil ${href}`).toBe(true);

    await moreNav.getByRole("link", { name: /Recurrentes/ }).click();
    await expect(page).toHaveURL(/\/recurrences$/);
    await expect(page.getByRole("navigation", { name: "Navegación móvil" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/recurrences");
  });
});
