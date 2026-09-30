import { expect, test, type Page } from "@playwright/test";

type ViewportCase = {
  name: string;
  width: number;
  height: number;
  mode: "mobile" | "desktop";
};

const viewports: ViewportCase[] = [
  { name: "móvil compacto 360", width: 360, height: 780, mode: "mobile" },
  { name: "móvil amplio 430", width: 430, height: 932, mode: "mobile" },
  { name: "antes de 30rem", width: 479, height: 900, mode: "mobile" },
  { name: "después de 30rem", width: 481, height: 900, mode: "mobile" },
  { name: "intermedio 600", width: 600, height: 900, mode: "mobile" },
  { name: "tablet antes de 48rem", width: 767, height: 1024, mode: "mobile" },
  { name: "tablet exacto 48rem", width: 768, height: 1024, mode: "mobile" },
  { name: "tablet tras 48rem", width: 769, height: 1024, mode: "desktop" },
  { name: "tablet vertical", width: 820, height: 1180, mode: "desktop" },
  { name: "tablet horizontal", width: 1024, height: 768, mode: "desktop" },
  { name: "portátil", width: 1366, height: 768, mode: "desktop" },
  { name: "antes de 90rem", width: 1439, height: 900, mode: "desktop" },
  { name: "exacto 90rem", width: 1440, height: 900, mode: "desktop" },
  { name: "después de 90rem", width: 1441, height: 900, mode: "desktop" },
  { name: "escritorio", width: 1920, height: 1080, mode: "desktop" },
  { name: "pantalla ancha", width: 2560, height: 1440, mode: "desktop" },
];

async function isolateShell(page: Page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "responsive_matrix_isolated" }),
    });
  });
}

async function expectNoViewportOverflow(page: Page, width: number) {
  const dimensions = await page.evaluate(() => ({
    htmlClient: document.documentElement.clientWidth,
    htmlScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));

  expect(dimensions.htmlClient).toBe(width);
  expect(dimensions.htmlScroll, `overflow horizontal en <html> a ${width}px`).toBeLessThanOrEqual(dimensions.htmlClient + 1);
  expect(dimensions.bodyScroll, `overflow horizontal en <body> a ${width}px`).toBeLessThanOrEqual(dimensions.bodyClient + 1);
}

async function expectMobileNavigation(page: Page) {
  const mobile = page.getByRole("navigation", { name: "Navegación móvil" });
  const desktop = page.getByRole("navigation", { name: "Navegación principal" });

  await expect(mobile).toBeVisible();
  await expect(desktop).toBeHidden();

  for (const control of [
    mobile.getByRole("link", { name: "Inicio", exact: true }),
    mobile.getByRole("link", { name: "Movs.", exact: true }),
    mobile.getByRole("link", { name: "Análisis", exact: true }),
    mobile.getByRole("link", { name: "Revisar", exact: true }),
    mobile.getByRole("button", { name: "Más", exact: true }),
  ]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}

async function expectDesktopNavigation(page: Page, width: number) {
  const desktop = page.getByRole("navigation", { name: "Navegación principal" });
  const mobile = page.getByRole("navigation", { name: "Navegación móvil" });

  await expect(desktop).toBeVisible();
  await expect(mobile).toBeHidden();

  const box = await desktop.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);

  const active = desktop.locator('[aria-current="page"]');
  await expect(active).toBeVisible();
  const activeBox = await active.boundingBox();
  expect(activeBox).not.toBeNull();
  expect(activeBox!.height).toBeGreaterThanOrEqual(44);
}

test.describe("Financial App 10.0.49 · contrato responsive Axioma §§72–76", () => {
  for (const viewport of viewports) {
    test(`${viewport.name}: ${viewport.width}x${viewport.height} sin overflow y con navegación correcta`, async ({ page }) => {
      await isolateShell(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");

      await expect(page.locator("#main-content")).toBeVisible();
      await expectNoViewportOverflow(page, viewport.width);

      if (viewport.mode === "mobile") {
        await expectMobileNavigation(page);
      } else {
        await expectDesktopNavigation(page, viewport.width);
      }
    });
  }

  test("la interfaz cruza 768/769 y 1440/1441 sin recargar ni generar overflow", async ({ page }) => {
    await isolateShell(page);
    await page.setViewportSize({ width: 767, height: 1024 });
    await page.goto("/");

    for (const viewport of [
      { width: 767, height: 1024, mode: "mobile" as const },
      { width: 768, height: 1024, mode: "mobile" as const },
      { width: 769, height: 1024, mode: "desktop" as const },
      { width: 820, height: 1180, mode: "desktop" as const },
      { width: 1024, height: 768, mode: "desktop" as const },
      { width: 1439, height: 900, mode: "desktop" as const },
      { width: 1440, height: 900, mode: "desktop" as const },
      { width: 1441, height: 900, mode: "desktop" as const },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expectNoViewportOverflow(page, viewport.width);
      if (viewport.mode === "mobile") {
        await expectMobileNavigation(page);
      } else {
        await expectDesktopNavigation(page, viewport.width);
      }
    }
  });
});
