import { expect, test, type Locator, type Page } from "@playwright/test";

const mobileViewports = [
  { width: 360, height: 780 },
  { width: 430, height: 932 },
  { width: 480, height: 900 },
] as const;

async function isolateApis(page: Page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "mobile_quality_isolated" }),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(dimensions.clientWidth).toBe(width);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(width + 1);
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(width + 1);
}

async function expectTouchTarget(control: Locator, label: string) {
  await expect(control, `${label} debe ser visible`).toBeVisible();
  const box = await control.boundingBox();
  expect(box, `${label} debe tener caja medible`).not.toBeNull();
  expect(box!.width, `${label} debe medir al menos 44px de ancho`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} debe medir al menos 44px de alto`).toBeGreaterThanOrEqual(44);
}

test.describe("Financial App 10.0.65 · calidad móvil", () => {
  for (const viewport of mobileViewports) {
    test(`/configuration/source ${viewport.width}px no desborda y conserva navegación táctil`, async ({ page }) => {
      await isolateApis(page);
      await page.setViewportSize(viewport);
      await page.goto("/configuration/source");

      await expect(page.locator("#main-content")).toBeVisible();
      await expectNoHorizontalOverflow(page, viewport.width);

      const mobile = page.getByRole("navigation", { name: "Navegación móvil" });
      await expect(mobile).toBeVisible();
      await expectTouchTarget(mobile.getByRole("link", { name: "Inicio", exact: true }), "Inicio");
      await expectTouchTarget(mobile.getByRole("link", { name: "Movs.", exact: true }), "Movs.");
      await expectTouchTarget(mobile.getByRole("link", { name: "Análisis", exact: true }), "Análisis");
      await expectTouchTarget(mobile.getByRole("button", { name: "Más", exact: true }), "Más");
    });
  }

  test("Previsión mantiene controles esenciales >=44x44 en móvil compacto", async ({ page }) => {
    await isolateApis(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/forecast");
    await expect(page.locator("#main-content")).toBeVisible();

    const controls = page.locator("#main-content button:visible, #main-content input:visible, #main-content select:visible, #main-content textarea:visible");
    const count = await controls.count();
    expect(count, "Previsión debe exponer controles operativos incluso si los datos remotos fallan").toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const box = await control.boundingBox();
      if (!box) continue;
      expect(box.height, `control ${index} debe medir al menos 44px de alto`).toBeGreaterThanOrEqual(44);
      if (await control.evaluate((node) => node.matches("button,[role='button']"))) {
        expect(box.width, `control táctil ${index} debe medir al menos 44px de ancho`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("viewport bajo permite enfocar y alcanzar un campo de Previsión por encima del dock", async ({ page }) => {
    await isolateApis(page);
    await page.setViewportSize({ width: 390, height: 568 });
    await page.goto("/forecast");
    await expect(page.locator("#main-content")).toBeVisible();

    const field = page.locator("#main-content input:visible, #main-content select:visible, #main-content textarea:visible").last();
    await expect(field).toBeVisible();
    await field.scrollIntoViewIfNeeded();
    await field.focus();

    const dock = page.getByRole("navigation", { name: "Navegación móvil" });
    await expect(dock).toBeVisible();
    const fieldBox = await field.boundingBox();
    const dockBox = await dock.boundingBox();
    expect(fieldBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(fieldBox!.y).toBeGreaterThanOrEqual(0);
    expect(fieldBox!.y + fieldBox!.height, "el campo enfocado no debe quedar oculto bajo el dock fijo").toBeLessThanOrEqual(dockBox!.y + 1);
  });
});
