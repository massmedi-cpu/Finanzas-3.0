import { expect, test, type Page } from "@playwright/test";

const firstWaveRoutes = [
  { path: "/", current: "Inicio" },
  { path: "/onboarding", current: "Primeros pasos" },
  { path: "/review", current: "Para revisar" },
  { path: "/transactions", current: "Movimientos" },
  { path: "/analysis", current: "Análisis" },
  { path: "/forecast", current: "Previsión" },
] as const;

const secondWaveRoutes = [
  { path: "/accounts", current: "Cuentas" },
  { path: "/budgets", current: "Presupuestos" },
  { path: "/recurrences", current: "Recurrentes" },
  { path: "/documents", current: "Documentos" },
  { path: "/configuration", current: "Configuración" },
  { path: "/configuration/source", current: "Configuración" },
  { path: "/configuration/merchants", current: "Configuración" },
  { path: "/configuration/rules", current: "Configuración" },
] as const;

const primaryLinks = ["Inicio", "Primeros pasos", "Para revisar", "Movimientos", "Análisis", "Cuentas", "Presupuestos", "Recurrentes", "Previsión", "Documentos", "Configuración"] as const;
const mobilePrimary = ["Inicio", "Movs.", "Análisis", "Revisar"] as const;
const mobileSecondary = ["Primeros pasos", "Cuentas", "Presupuestos", "Recurrentes", "Previsión", "Documentos", "Configuración"] as const;

async function isolateShellFromData(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/build") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "app_shell_contract_data_isolated" }) });
  });
}

async function expectSharedNavigation(page: Page, current: string) {
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegación móvil" })).toBeHidden();
  for (const name of primaryLinks) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  const active = nav.getByRole("link", { name: current, exact: true });
  await expect(active).toHaveAttribute("aria-current", "page");
  await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
}

async function expectMobileNavigation(page: Page, current: string, width: number) {
  const desktopNav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(desktopNav).toBeHidden();

  const dock = page.getByRole("navigation", { name: "Navegación móvil" });
  await expect(dock).toBeVisible();
  for (const name of mobilePrimary) {
    const control = dock.getByRole("link", { name, exact: true });
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box, `${name} debe tener target táctil en ${width}px`).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const more = dock.getByRole("button", { name: "Más", exact: true });
  const moreBox = await more.boundingBox();
  expect(moreBox).not.toBeNull();
  expect(moreBox!.height).toBeGreaterThanOrEqual(44);

  const primaryName = current === "Movimientos" ? "Movs." : current === "Para revisar" ? "Revisar" : current;
  if ((mobilePrimary as readonly string[]).includes(primaryName)) {
    await expect(dock.getByRole("link", { name: primaryName, exact: true })).toHaveAttribute("aria-current", "page");
  } else {
    await more.click();
    const extra = page.getByRole("navigation", { name: "Más secciones" });
    await expect(extra).toBeVisible();
    for (const name of mobileSecondary) await expect(extra.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(extra.getByRole("link", { name: current, exact: true })).toHaveAttribute("aria-current", "page");
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test("D2 · Inicio, Primeros pasos, Para revisar, Movimientos, Análisis y Previsión comparten un AppShell persistente con estado activo", async ({ page }) => {
  await isolateShellFromData(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const route of firstWaveRoutes) {
    await page.goto(route.path);
    await expectSharedNavigation(page, route.current);
  }
});

test("D2 · el AppShell móvil prioriza cuatro destinos y deja el resto a un toque, sin overflow", async ({ page }) => {
  test.setTimeout(60_000);
  await isolateShellFromData(page);
  for (const width of [320, 360, 430, 480]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of firstWaveRoutes) {
      await page.goto(route.path);
      await expectMobileNavigation(page, route.current, width);
    }
  }
});

test("D2 · Cuentas, Presupuestos, Recurrentes, Documentos y Configuración comparten el mismo AppShell", async ({ page }) => {
  await isolateShellFromData(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const route of secondWaveRoutes) {
    await page.goto(route.path);
    await expectSharedNavigation(page, route.current);
  }
});

test("D2 · la segunda ola sigue accesible en móvil desde Más con targets táctiles", async ({ page }) => {
  test.setTimeout(60_000);
  await isolateShellFromData(page);
  for (const width of [320, 360, 430, 480]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of secondWaveRoutes) {
      await page.goto(route.path);
      await expectMobileNavigation(page, route.current, width);
    }
  }
});

test("D2 · Login permanece fuera del AppShell de la aplicación autenticada", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Navegación móvil" })).toHaveCount(0);
});

test("D2 · el acceso favorito móvil cambia sin ocultar la sección activa y persiste al volver", async ({ page }) => {
  await isolateShellFromData(page);
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto("/accounts");

  const dock = page.getByRole("navigation", { name: "Navegación móvil" });
  const more = dock.getByRole("button", { name: "Más", exact: true });
  await expect(more).toHaveAttribute("aria-controls", "mobile-more-navigation");
  await more.click();
  const extra = page.getByRole("navigation", { name: "Más secciones" });
  await expect(extra.getByRole("link", { name: "Cuentas", exact: true })).toHaveAttribute("aria-current", "page");
  await extra.getByRole("combobox", { name: "Acceso favorito" }).selectOption("/accounts");
  await expect(dock.getByRole("link", { name: "Cuentas", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(extra.getByRole("link", { name: "Cuentas", exact: true })).toHaveCount(0);

  await page.reload();
  await expect(dock.getByRole("link", { name: "Cuentas", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.evaluate(() => localStorage.getItem("financial-app:mobile-favorite"))).resolves.toBe("/accounts");
});
