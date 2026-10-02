import { expect, test } from "@playwright/test";

const STORAGE_KEY = "financial-app:visual-preferences-v1";

test("PRE-037 · preferencias funcionan con interacción táctil/visible", async ({ page, browserName }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/configuration/appearance");
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Apariencia y accesibilidad" })).toBeVisible();

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-density", "comfortable");
  await expect(root).toHaveAttribute("data-reduce-motion", "false");

  try {
    await expect(root).toHaveAttribute("data-visual-preferences-ready", "true", { timeout: 8_000 });
  } catch (cause) {
    throw new Error(
      `El cliente no hidrató VisualPreferences en ${browserName}. ` +
      `pageErrors=${JSON.stringify(pageErrors)} consoleErrors=${JSON.stringify(consoleErrors)}\n${String(cause)}`,
    );
  }

  const compactInput = page.locator('input[name="density"][value="compact"]');
  const compactOption = page.locator('label:has(input[name="density"][value="compact"])');
  await compactOption.click();
  await expect(compactInput).toBeChecked();
  await expect(root).toHaveAttribute("data-density", "compact");
  await expect(page.getByTestId("density-current")).toHaveText("Compacta");

  const motionToggle = page.getByTestId("reduce-motion-toggle");
  const motionRow = page.locator('label:has([data-testid="reduce-motion-toggle"])');
  await motionRow.click();
  await expect(motionToggle).toBeChecked();
  await expect(root).toHaveAttribute("data-reduce-motion", "true");
  await expect(page.getByTestId("appearance-notice")).toContainText("Reducir movimiento activado");

  expect(pageErrors, `${browserName}: errores de página`).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${browserName}: scroll horizontal global`).toBeLessThanOrEqual(1);

  const persisted = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  expect(persisted).toEqual({ density: "compact", reduceMotion: true });
});
