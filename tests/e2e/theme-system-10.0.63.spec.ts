import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "financial-app:visual-preferences-v1";

async function resetVisualPreferences(page: Page) {
  await page.goto("/configuration/appearance");
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
}

async function expectLightSurface(page: Page, selector: string) {
  const surface = page.locator(selector).first();
  await expect(surface).toBeVisible();
  const style = await surface.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      color: computed.color,
    };
  });
  expect(`${style.backgroundColor} ${style.backgroundImage}`).not.toContain("rgb(8, 15, 31)");
  expect(`${style.backgroundColor} ${style.backgroundImage}`).not.toContain("rgb(7, 14, 29)");
  expect(style.color).not.toBe("rgb(220, 229, 246)");
}

test.describe("ART-010 · tema system / light / dark", () => {
  test("Sistema sigue prefers-color-scheme y reacciona en vivo", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await resetVisualPreferences(page);

    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-theme-preference", "system");
    await expect(root).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("theme-current")).toContainText("Sistema");
    await expect(page.getByTestId("theme-resolved")).toContainText("claro");
    await expectLightSurface(page, ".config-panel");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(root).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("theme-resolved")).toContainText("oscuro");
  });

  test("Claro y oscuro prevalecen sobre el sistema y persisten tras recarga", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await resetVisualPreferences(page);

    const root = page.locator("html");
    await page.getByTestId("theme-light").check();
    await expect(root).toHaveAttribute("data-theme-preference", "light");
    await expect(root).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(root).toHaveAttribute("data-theme-preference", "light");
    await expect(root).toHaveAttribute("data-theme", "light");

    await page.goto("/transactions");
    await expect(root).toHaveAttribute("data-theme", "light");
    await expectLightSurface(page, 'main:has(form[aria-label="Filtros de movimientos"]) > header');
    await expectLightSurface(page, 'form[aria-label="Filtros de movimientos"]');
    await expectLightSurface(page, 'section[aria-labelledby="transaction-list-heading"]');

    await page.goto("/configuration/appearance");
    await page.getByTestId("theme-dark").check();
    await expect(root).toHaveAttribute("data-theme-preference", "dark");
    await expect(root).toHaveAttribute("data-theme", "dark");

    await page.getByTestId("theme-system").check();
    await expect(root).toHaveAttribute("data-theme-preference", "system");
    await expect(root).toHaveAttribute("data-theme", "dark");
  });

  test("el cambio de tema no altera densidad ni preferencia de movimiento", async ({ page }) => {
    await resetVisualPreferences(page);

    await page.getByRole("radio", { name: /Compacta/ }).check();
    await page.getByTestId("reduce-motion-toggle").check();
    await page.getByTestId("theme-light").check();

    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-density", "compact");
    await expect(root).toHaveAttribute("data-reduce-motion", "true");
    await expect(root).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(root).toHaveAttribute("data-density", "compact");
    await expect(root).toHaveAttribute("data-reduce-motion", "true");
    await expect(root).toHaveAttribute("data-theme", "light");
  });
});
