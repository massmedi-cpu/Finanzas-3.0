import { expect, test } from "@playwright/test";

async function clearVisualPreferences(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem("financial-app:visual-preferences-v1");
  });
}

test.describe("ART-010 · tema system / light / dark", () => {
  test("Sistema sigue prefers-color-scheme y reacciona en vivo", async ({ page }) => {
    await clearVisualPreferences(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/configuration/appearance");

    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-theme-preference", "system");
    await expect(root).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("theme-current")).toContainText("Sistema");
    await expect(page.getByTestId("theme-resolved")).toContainText("claro");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(root).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("theme-resolved")).toContainText("oscuro");
  });

  test("Claro y oscuro prevalecen sobre el sistema y persisten tras recarga", async ({ page }) => {
    await clearVisualPreferences(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/configuration/appearance");

    const root = page.locator("html");
    await page.getByTestId("theme-light").check();
    await expect(root).toHaveAttribute("data-theme-preference", "light");
    await expect(root).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(root).toHaveAttribute("data-theme-preference", "light");
    await expect(root).toHaveAttribute("data-theme", "light");

    await page.getByTestId("theme-dark").check();
    await expect(root).toHaveAttribute("data-theme-preference", "dark");
    await expect(root).toHaveAttribute("data-theme", "dark");

    await page.getByTestId("theme-system").check();
    await expect(root).toHaveAttribute("data-theme-preference", "system");
    await expect(root).toHaveAttribute("data-theme", "dark");
  });

  test("el cambio de tema no altera densidad ni preferencia de movimiento", async ({ page }) => {
    await clearVisualPreferences(page);
    await page.goto("/configuration/appearance");

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
