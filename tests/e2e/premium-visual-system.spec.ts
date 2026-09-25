import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("el sistema visual premium se carga después de densidad y antes de accesibilidad forzada", () => {
  const layout = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");
  const densityIndex = layout.indexOf('import "./visual-density.css"');
  const premiumIndex = layout.indexOf('import "./premium-theme.css"');
  const forcedColorsIndex = layout.indexOf('import "./accessibility-forced-colors.css"');

  expect(densityIndex).toBeGreaterThan(-1);
  expect(premiumIndex).toBeGreaterThan(densityIndex);
  expect(forcedColorsIndex).toBeGreaterThan(premiumIndex);
});

test("la identidad del shell usa la versión real y no una versión escrita a mano", () => {
  const shell = readFileSync(resolve(process.cwd(), "app/app-shell.tsx"), "utf8");

  expect(shell).toContain('import { APP_VERSION } from "../src/core/build-info"');
  expect(shell).toContain('className="financial-brand"');
  expect(shell).toContain("v{APP_VERSION}");
  expect(shell).not.toContain("v10.0.3");
});

test("login conserva legibilidad y recibe el tratamiento premium real", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();
  const card = page.locator(".reset-card");
  await expect(card).toBeVisible();

  const visual = await card.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundImage: style.backgroundImage,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
    };
  });

  expect(visual.backgroundImage).toContain("radial-gradient");
  expect(visual.boxShadow).not.toBe("none");
  expect(visual.borderColor).not.toBe("rgba(0, 0, 0, 0)");

  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#030711");
});

test("el manifiesto instalado comparte el mismo color de chrome", async ({ page }) => {
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json() as { background_color?: string; theme_color?: string };

  expect(manifest.background_color).toBe("#030711");
  expect(manifest.theme_color).toBe("#030711");
});
