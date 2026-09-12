import { expect, test } from "@playwright/test";

test("Financial App declara identidad regional y chrome de aplicación", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "es-ES");
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute("content", "Financial App");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#07101f");
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");
});
