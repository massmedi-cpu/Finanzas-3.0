import { expect, test } from "@playwright/test";

const STORAGE_KEY = "financial-app:visual-preferences-v1";

test("PRE-037 · preferencias funcionan en navegador compatible", async ({ page, browserName }) => {
  await page.goto("/configuration/appearance");
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Apariencia y accesibilidad" })).toBeVisible();
  await page.locator('input[name="density"][value="compact"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");

  await page.getByTestId("reduce-motion-toggle").check();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${browserName}: scroll horizontal global`).toBeLessThanOrEqual(1);

  const persisted = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  expect(persisted).toEqual({ density: "compact", reduceMotion: true });
});
