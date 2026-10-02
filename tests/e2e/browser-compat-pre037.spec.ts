import { expect, test } from "@playwright/test";

const STORAGE_KEY = "financial-app:visual-preferences-v1";

test("PRE-037 · preferencias funcionan con interacción táctil/visible", async ({ page, browserName }) => {
  await page.goto("/configuration/appearance");
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Apariencia y accesibilidad" })).toBeVisible();

  const compactInput = page.locator('input[name="density"][value="compact"]');
  const compactOption = page.locator('label:has(input[name="density"][value="compact"])');
  await compactOption.click();
  await expect(compactInput).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.getByTestId("density-current")).toHaveText("Compacta");

  const motionToggle = page.getByTestId("reduce-motion-toggle");
  const motionRow = page.locator('label:has([data-testid="reduce-motion-toggle"])');
  await motionRow.click();
  await expect(motionToggle).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
  await expect(page.getByTestId("appearance-notice")).toContainText("Reducir movimiento activado");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${browserName}: scroll horizontal global`).toBeLessThanOrEqual(1);

  const persisted = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  expect(persisted).toEqual({ density: "compact", reduceMotion: true });
});
