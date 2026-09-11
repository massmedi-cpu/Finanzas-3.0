import { expect, test, type Page } from "@playwright/test";

const primaryRoutes = [
  { path: "/", current: "Inicio" },
  { path: "/onboarding", current: "Primeros pasos" },
  { path: "/review", current: "Para revisar" },
  { path: "/transactions", current: "Movimientos" },
  { path: "/analysis", current: "Análisis" },
  { path: "/accounts", current: "Cuentas" },
  { path: "/budgets", current: "Presupuestos" },
  { path: "/recurrences", current: "Recurrentes" },
  { path: "/forecast", current: "Previsión" },
  { path: "/documents", current: "Documentos" },
  { path: "/configuration", current: "Configuración" },
] as const;

async function isolateShellFromData(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/build") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "cr006_accessibility_hardening_data_isolated" }),
    });
  });
}

test("CR-006 · 320 CSS px, equivalente al reflow de 400% sobre 1280 px, no introduce overflow documental", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz CR-006 se ejecuta una vez por run");
  test.setTimeout(90_000);
  await isolateShellFromData(page);
  await page.setViewportSize({ width: 320, height: 900 });

  for (const route of primaryRoutes) {
    await page.goto(route.path);
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: route.current, exact: true })).toHaveAttribute("aria-current", "page");

    const dimensions = await page.evaluate(() => ({
      rootClientWidth: document.documentElement.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));

    expect(dimensions.rootClientWidth, `${route.path} debe conservar 320 CSS px de viewport útil`).toBe(320);
    expect(dimensions.rootScrollWidth, `${route.path} no debe desbordar horizontalmente a 320 CSS px`).toBeLessThanOrEqual(dimensions.rootClientWidth + 1);
    expect(dimensions.bodyScrollWidth, `${route.path} no debe forzar overflow horizontal desde body`).toBeLessThanOrEqual(dimensions.rootClientWidth + 1);
  }
});

test("CR-006 · el foco de teclado sigue siendo perceptible con Forced Colors activo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la prueba de Forced Colors se ejecuta una vez por run");
  await isolateShellFromData(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/");

  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  await page.keyboard.press("Tab");

  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  const focusStyle = await focused.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset),
    };
  });

  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(focusStyle.outlineOffset).toBeGreaterThanOrEqual(2);
});

test("CR-006 · teclado y lector de pantalla pueden saltar la navegación repetida", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la prueba de bypass CR-006 se ejecuta una vez por run");
  await isolateShellFromData(page);
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Saltar al contenido principal" });
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.getByRole("main")).toHaveCount(1);
});
