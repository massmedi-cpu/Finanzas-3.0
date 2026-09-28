import { expect, test, type Page, type Route } from "@playwright/test";

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function isolateData(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/build") return route.continue();
    if (url.pathname === "/api/analysis/source-freshness") {
      return fulfillJson(route, 200, { available: true, latestMovementDate: null, sync: null });
    }
    return fulfillJson(route, 503, { error: "navigation_performance_data_isolated" });
  });
}

test("10.0.30 · el menú superior expone las trece secciones y controles de desplazamiento", async ({ page }) => {
  await isolateData(page);
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveCount(13);

  const nextButton = page.getByRole("button", { name: "Ver más secciones del menú" });
  await expect(nextButton).toBeVisible();
  await expect(nextButton).toBeEnabled();

  const before = await navigation.evaluate((element) => element.scrollLeft);
  await nextButton.click();
  await expect.poll(() => navigation.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
});

test("10.0.30 · la rueda vertical desplaza horizontalmente el menú cuando hay contenido oculto", async ({ page }) => {
  await isolateData(page);
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Navegación principal" });
  const before = await navigation.evaluate((element) => element.scrollLeft);
  await navigation.dispatchEvent("wheel", { deltaY: 420, deltaX: 0 });
  await expect.poll(() => navigation.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
});

test("10.0.30 · el enlace activo vuelve a quedar visible tras cambiar de sección", async ({ page }) => {
  await isolateData(page);
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/configuration");

  const navigation = page.getByRole("navigation", { name: "Navegación principal" });
  const configuration = navigation.getByRole("link", { name: "Configuración" });
  await expect(configuration).toHaveAttribute("aria-current", "page");

  await expect.poll(() => configuration.evaluate((element) => {
    const item = element.getBoundingClientRect();
    const parent = element.closest("nav")!.getBoundingClientRect();
    return item.left >= parent.left - 1 && item.right <= parent.right + 1;
  })).toBe(true);
});

test("10.0.30 · móvil conserva el dock y Más da acceso a las secciones secundarias", async ({ page }) => {
  await isolateData(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeHidden();
  const mobile = page.getByRole("navigation", { name: "Navegación móvil" });
  await expect(mobile).toBeVisible();
  await mobile.getByRole("button", { name: "Más" }).click();

  const more = page.getByRole("navigation", { name: "Más secciones" });
  await expect(more).toBeVisible();
  await expect(more.getByRole("link", { name: "Configuración" })).toBeVisible();
  await expect(more.getByRole("link", { name: "Documentos" })).toBeVisible();
});
