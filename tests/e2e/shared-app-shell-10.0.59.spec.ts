import { expect, test } from "@playwright/test";

const routes = ["/", "/transactions", "/configuration"] as const;

for (const route of routes) {
  test(`${route} usa exactamente un AppShell compartido`, async ({ page }) => {
    await page.goto(route);

    await expect(page.locator('[data-app-shell="shared"]')).toHaveCount(1);
    await expect(page.locator('nav[aria-label="Navegación principal"]')).toHaveCount(1);
    await expect(page.locator("#main-content")).toHaveCount(1);
    await expect(page.locator("#main-content")).toBeVisible();
  });
}

test("Configuración hereda el shell sin wrapper local", async ({ page }) => {
  await page.goto("/configuration");

  await expect(page.locator("a.financial-brand")).toHaveCount(1);
  await expect(page.locator('nav[aria-label="Navegación principal"]')).toHaveCount(1);
  await expect(page.locator('[data-nav-href="/configuration"]')).toHaveAttribute("aria-current", "page");
});
