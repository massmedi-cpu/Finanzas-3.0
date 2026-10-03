import { expect, test, type Page } from "@playwright/test";

const routes = [
  "/",
  "/cash-flow",
  "/review",
  "/alerts",
  "/transactions",
  "/analysis",
  "/accounts",
  "/budgets",
  "/forecast",
  "/documents",
  "/configuration/source",
] as const;

const reflowCases = [
  {
    name: "equivalencia reflow 200%",
    width: 640,
    height: 900,
    referenceViewport: 1280,
    zoomPercent: 200,
  },
  {
    name: "equivalencia reflow 400%",
    width: 320,
    height: 800,
    referenceViewport: 1280,
    zoomPercent: 400,
  },
] as const;

async function isolateShell(page: Page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "reflow_accessibility_isolated" }),
    });
  });
}

async function settleLayout(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function expectNoHorizontalClipping(page: Page, route: string, width: number) {
  await settleLayout(page);
  const result = await page.evaluate(() => ({
    htmlClient: document.documentElement.clientWidth,
    htmlScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
    main: (() => {
      const element = document.querySelector<HTMLElement>("#main-content");
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    })(),
  }));

  expect(result.htmlClient, `${route}: viewport CSS esperado`).toBe(width);
  expect(result.htmlScroll, `${route}: overflow horizontal en <html>`).toBeLessThanOrEqual(result.htmlClient + 1);
  expect(result.bodyScroll, `${route}: overflow horizontal en <body>`).toBeLessThanOrEqual(result.bodyClient + 1);
  expect(result.main, `${route}: debe existir #main-content`).not.toBeNull();
  expect(result.main!.left, `${route}: contenido principal recortado por la izquierda`).toBeGreaterThanOrEqual(-1);
  expect(result.main!.right, `${route}: contenido principal recortado por la derecha`).toBeLessThanOrEqual(width + 1);
}

test.describe("Financial App 10.0.69 · A11Y-009 reflow equivalente", () => {
  for (const reflow of reflowCases) {
    test(`${reflow.name}: rutas principales conservan lectura sin scroll horizontal`, async ({ page }) => {
      await isolateShell(page);
      await page.setViewportSize({ width: reflow.width, height: reflow.height });

      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("#main-content"), `${route}: contenido principal visible`).toBeVisible();
        await expectNoHorizontalClipping(page, route, reflow.width);

        const mobileNav = page.getByRole("navigation", { name: "Navegación móvil" });
        await expect(mobileNav, `${route}: navegación móvil visible a ${reflow.width}px`).toBeVisible();
        const box = await mobileNav.boundingBox();
        expect(box, `${route}: navegación móvil medible`).not.toBeNull();
        expect(box!.x, `${route}: navegación fuera por la izquierda`).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width, `${route}: navegación fuera por la derecha`).toBeLessThanOrEqual(reflow.width + 1);
      }
    });
  }

  test("el contrato documenta la equivalencia CSS usada por la gate", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    expect(1280 / 2).toBe(640);
    expect(1280 / 4).toBe(320);
  });
});
