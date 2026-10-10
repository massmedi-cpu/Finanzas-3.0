import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { navigationItems } from "../../app/navigation-items";
import { mockRecoveryHome } from "./helpers/recovery-home";

const widths = [360, 390, 430, 600, 768, 820, 1024, 1100, 1366, 1440, 1920];
const routes = [...navigationItems.map((item) => item.href), "/configuration/accounts", "/configuration/categories", "/configuration/merchants", "/configuration/rules", "/configuration/source", "/configuration/data", "/configuration/appearance"];

async function noOverflow(page: Page, width: number) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll("body *")].flatMap((element) => {
      const box = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return box.width && box.right > innerWidth + 1 && css.visibility !== "hidden" && css.position !== "fixed"
        ? [{ tag: element.tagName, className: element.className, right: Math.round(box.right) }] : [];
    }).slice(0, 12),
  }));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
    timeout: 1500, message: `${width}px: ${JSON.stringify(layout.offenders)}`,
  }).toBeLessThanOrEqual(1);
}

// This matrix verifies browser rendering with synthetic data and unavailable states.
// Real persistence is evaluated separately by authenticated isolation, without mocks.
for (const theme of ["light", "dark"] as const) {
  for (const route of routes) {
    test(`REC-UI · ${theme} ${route} · 11 tamaños y accesibilidad`, async ({ page }, info) => {
      await mockRecoveryHome(page, "covered");
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Next.js 404 pages contain an h1. A "visible heading" alone used to
      // let two missing configuration routes pass all 11 viewport checks.
      await expect(page.getByText("Esta página no existe", { exact: true })).toHaveCount(0);
      await page.waitForTimeout(150);
      for (const width of widths) {
        await page.setViewportSize({ width, height: width < 768 ? 900 : 1024 });
        await noOverflow(page, width);
        if (width >= 1100) {
          const nav = page.getByRole("navigation", { name: "Navegación principal" });
          await expect(nav).toHaveCSS("flex-direction", "column");
          await expect.poll(() => nav.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(224);
          expect(await page.locator("#main-content").evaluate((element) => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(224);
        }
        if (width === 360 || width === 1366) {
          await page.screenshot({ path: info.outputPath(`${theme}-${route === "/" ? "inicio" : route.slice(1).replaceAll("/", "-")}-${width}.png`), fullPage: true });
        }
      }
      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })) }))).toEqual([]);
    });
  }
}

test("REC-UI-CONFIG · account/category routes render the shared settings with their correct selection", async ({ page }) => {
  await mockRecoveryHome(page);
  const cases = [
    { path: "/configuration/accounts", selected: "Cuentas", unselected: "Categorías" },
    { path: "/configuration/categories", selected: "Categorías", unselected: "Cuentas" },
  ];
  for (const scenario of cases) {
    await page.goto(scenario.path);
    await expect(page.getByRole("heading", { name: "Cuentas y categorías", level: 1 })).toBeVisible();
    await expect(page.getByText("Esta página no existe", { exact: true })).toHaveCount(0);
    const navigation = page.getByRole("navigation", { name: "Secciones de configuración" });
    await expect(navigation.getByRole("button", { name: new RegExp(scenario.selected) })).toHaveAttribute("aria-pressed", "true");
    await expect(navigation.getByRole("button", { name: new RegExp(scenario.unselected) })).toHaveAttribute("aria-pressed", "false");
  }
});

for (const width of [360, 820, 1366]) {
  test(`REC-UI · buscador abierto y teclado a ${width}px`, async ({ page }) => {
    await mockRecoveryHome(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Buscar en Financial App", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    await expect(page.getByRole("combobox", { name: "Buscar en Financial App" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Cerrar buscador" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
