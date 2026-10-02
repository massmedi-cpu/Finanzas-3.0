import { expect, test } from "@playwright/test";

const routes = ["/", "/transactions", "/configuration"] as const;

for (const route of routes) {
  test(`${route} usa exactamente un AppShell compartido`, async ({ page }) => {
    await page.goto(route);

    await expect(page.locator('[data-app-shell="shared"]')).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(1);
    await expect(page.locator("#main-content")).toHaveCount(1);
    await expect(page.locator("#main-content")).toBeVisible();
  });
}

test("Configuración hereda el shell sin wrapper local", async ({ page }) => {
  await page.goto("/configuration");

  await expect(page.getByRole("link", { name: /Financial App .* ir a Inicio/ })).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(1);
  await expect(page.locator('[data-nav-href="/configuration"]')).toHaveAttribute("aria-current", "page");
});
