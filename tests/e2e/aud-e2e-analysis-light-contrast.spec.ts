import { expect, test } from "@playwright/test";

test.describe("AUD-E2E-UI-001 · Análisis respeta contraste y temas", () => {
  test("los filtros, botones y rangos tienen un contraste consistente en tema claro", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/analysis");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    const form = page.getByRole("form", { name: "Filtros del análisis" });
    await expect(form).toBeVisible();
    const month = form.locator('input[type="month"]');
    const account = form.locator("select");
    const selectedRange = form.locator('button[aria-pressed="true"]');
    const apply = form.getByRole("button", { name: /Aplicar|Actualizando/ });

    await expect(month).toHaveCSS("color", "rgb(20, 35, 59)");
    await expect(account).toHaveCSS("color", "rgb(20, 35, 59)");
    await expect(month).toHaveCSS("background-color", "rgba(255, 255, 255, 0.98)");
    await expect(selectedRange).toHaveCSS("color", "rgb(20, 35, 59)");
    await expect(apply).toHaveCSS("background-color", "rgb(49, 95, 206)");
    await expect(apply).toHaveCSS("color", "rgb(255, 255, 255)");
  });

  test("la lectura no queda anclada al tema claro cuando el sistema cambia al oscuro", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/analysis");
    const month = page.getByRole("form", { name: "Filtros del análisis" }).locator('input[type="month"]');
    await expect(month).toHaveCSS("color", "rgb(20, 35, 59)");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(month).not.toHaveCSS("color", "rgb(20, 35, 59)");
  });

  for (const width of [360, 390, 820, 1440]) {
    test(`Análisis conserva filtros accesibles en ${width}px sin desbordamiento de página`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("/analysis");
      const form = page.getByRole("form", { name: "Filtros del análisis" });
      await expect(form.getByRole("button", { name: /Aplicar|Actualizando/ })).toBeVisible();
      await expect(form.locator("select")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }
});


test("REC-VIS-003 · los acentos semánticos cian y dorado superan AA sobre el lienzo claro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/analysis");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const contrast = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const token = (name: string) => style.getPropertyValue(name).trim();
    const luminance = (hex: string) => {
      const bytes = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      if (!bytes) throw new Error(`Expected six-digit token, got ${hex}`);
      const values = bytes.slice(1).map((part) => parseInt(part, 16) / 255);
      const linear = values.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const ratio = (fg: string, bg: string) => {
      const a = luminance(fg), b = luminance(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const bg = token("--color-bg");
    return {
      bg,
      cyan: ratio(token("--color-cyan"), bg),
      gold: ratio(token("--color-gold-bright"), bg),
    };
  });
  expect(contrast.cyan, `Cian sobre ${contrast.bg}`).toBeGreaterThanOrEqual(4.5);
  expect(contrast.gold, `Dorado sobre ${contrast.bg}`).toBeGreaterThanOrEqual(4.5);
});
