import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("el sistema visual premium se carga en orden y deja accesibilidad como última capa", () => {
  const layout = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");
  const densityIndex = layout.indexOf('import "./visual-density.css"');
  const premiumIndex = layout.indexOf('import "./premium-theme.css"');
  const hardeningIndex = layout.indexOf('import "./premium-hardening.css"');
  const forcedColorsIndex = layout.indexOf('import "./accessibility-forced-colors.css"');

  expect(densityIndex).toBeGreaterThan(-1);
  expect(premiumIndex).toBeGreaterThan(densityIndex);
  expect(hardeningIndex).toBeGreaterThan(premiumIndex);
  expect(forcedColorsIndex).toBeGreaterThan(hardeningIndex);
});

test("la identidad del shell usa la versión real y no una versión escrita a mano", () => {
  const shell = readFileSync(resolve(process.cwd(), "app/app-shell.tsx"), "utf8");

  expect(shell).toContain('import { APP_VERSION } from "../src/core/build-info"');
  expect(shell).toContain('className="financial-brand"');
  expect(shell).toContain("v{APP_VERSION}");
  expect(shell).not.toContain("v10.0.3");
});

test("el hardening premium protege foco, móvil, reduced-motion y contraste reforzado", () => {
  const css = readFileSync(resolve(process.cwd(), "app/premium-hardening.css"), "utf8");

  expect(css).toContain(".financial-brand:focus-visible");
  expect(css).toContain('nav[aria-label="Navegación móvil"] button:focus-visible');
  expect(css).toContain("@media (max-width: 48rem)");
  expect(css).toContain("background-attachment: scroll");
  expect(css).toContain("touch-action: manipulation");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  expect(css).toContain("@media (prefers-contrast: more)");
});

test("forced-colors elimina efectos decorativos que pueden ocultar el estado activo", () => {
  const css = readFileSync(resolve(process.cwd(), "app/accessibility-forced-colors.css"), "utf8");

  expect(css).toContain("@media (forced-colors: active)");
  expect(css).toContain(".financial-brand");
  expect(css).toContain("background: Canvas !important");
  expect(css).toContain("border-color: Highlight !important");
  expect(css).toContain("box-shadow: none !important");
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

test("el fondo premium evita attachment fijo en móvil y lo conserva en escritorio", async ({ page }) => {
  await page.goto("/login");
  const state = await page.evaluate(() => ({
    mobile: window.matchMedia("(max-width: 48rem)").matches,
    attachment: window.getComputedStyle(document.body).backgroundAttachment,
  }));

  const expected = state.mobile ? "scroll" : "fixed";
  const layers = state.attachment.split(",").map((value) => value.trim());
  expect(layers.length).toBeGreaterThan(0);
  expect(layers.every((value) => value === expected)).toBe(true);
});

test("el shell expone foco visible en navegación sin depender de hover", async ({ page }) => {
  await page.goto("/");
  const mobile = await page.evaluate(() => window.matchMedia("(max-width: 48rem)").matches);
  const target = mobile
    ? page.getByRole("navigation", { name: "Navegación móvil" }).getByRole("link").first()
    : page.getByRole("link", { name: /Financial App .*ir a Inicio/i });

  await expect(target).toBeVisible();
  await target.focus();
  const outline = await target.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });

  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("el manifiesto instalado comparte el mismo color de chrome", async ({ page }) => {
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json() as { background_color?: string; theme_color?: string };

  expect(manifest.background_color).toBe("#030711");
  expect(manifest.theme_color).toBe("#030711");
});

test("el shell premium conserva navegación y evita desbordamiento en seis anchos", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz de seis anchos se ejecuta una vez");
  await page.goto("/");

  for (const width of [360, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const navigation = width <= 768
      ? page.getByRole("navigation", { name: "Navegación móvil" })
      : page.getByRole("navigation", { name: "Navegación principal" });
    await expect(navigation, `Navegación visible a ${width}px`).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `Sin desbordamiento horizontal a ${width}px`).toBe(true);
  }
});
