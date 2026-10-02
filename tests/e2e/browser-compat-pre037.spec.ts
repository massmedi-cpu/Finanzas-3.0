import { expect, test } from "@playwright/test";

const STORAGE_KEY = "financial-app:visual-preferences-v1";

test("PRE-037 · preferencias funcionan con interacción accesible", async ({ page, browserName }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/configuration/appearance");
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Apariencia y accesibilidad" })).toBeVisible();

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-density", "comfortable");
  await expect(root).toHaveAttribute("data-reduce-motion", "false");

  const compactInput = page.getByRole("radio", { name: /Compacta/ });
  await expect(compactInput).toBeEnabled();
  await compactInput.click();
  await expect(compactInput).toBeChecked();
  await expect(root).toHaveAttribute("data-density", "compact");
  await expect(page.getByTestId("density-current")).toHaveText("Compacta");

  const motionToggle = page.getByRole("checkbox", { name: /Reducir movimiento/ });
  await expect(motionToggle).toBeEnabled();
  await motionToggle.click();
  await expect(motionToggle).toBeChecked();
  await expect(root).toHaveAttribute("data-reduce-motion", "true");
  await expect(page.getByTestId("appearance-notice")).toContainText("Reducir movimiento activado");

  expect(pageErrors, `${browserName}: errores de página`).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${browserName}: scroll horizontal global`).toBeLessThanOrEqual(1);

  const persisted = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  expect(persisted).toEqual({ density: "compact", reduceMotion: true });
});
