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
  for (const name of primaryLinks) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  const active = nav.getByRole("link", { name: current, exact: true });
  await expect(active).toHaveAttribute("aria-current", "page");
  await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
}

test("D2 · Inicio, Primeros pasos, Para revisar, Movimientos, Análisis y Previsión comparten un AppShell persistente con estado activo", async ({ page }) => {
  await isolateShellFromData(page);
  for (const route of firstWaveRoutes) {
    await page.goto(route.path);
    await expectSharedNavigation(page, route.current);
  }
});

test("D2 · el AppShell móvil conserva la navegación completa, targets táctiles y cero overflow", async ({ page }) => {
  await isolateShellFromData(page);
  for (const width of [360, 430, 480]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of firstWaveRoutes) {
      await page.goto(route.path);
      const nav = page.getByRole("navigation", { name: "Navegación principal" });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link", { name: "Recurrentes", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: route.current, exact: true })).toHaveAttribute("aria-current", "page");
      for (const name of primaryLinks) {
        const box = await nav.getByRole("link", { name, exact: true }).boundingBox();
        expect(box, `${name} debe conservar un target táctil medible en ${width}px`).not.toBeNull();
        expect(box!.height, `${name} debe medir al menos 44px de alto en ${width}px`).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${route.path} no debe introducir overflow horizontal a ${width}px`).toBe(true);
    }
  }
});

test("D2 · Cuentas, Presupuestos, Recurrentes, Documentos y Configuración comparten el mismo AppShell", async ({ page }) => {
  await isolateShellFromData(page);
  for (const route of secondWaveRoutes) {
    await page.goto(route.path);
    await expectSharedNavigation(page, route.current);
  }
});

test("D2 · la segunda ola mantiene navegación móvil usable en 360, 430 y 480", async ({ page }) => {
  test.setTimeout(60_000);
  await isolateShellFromData(page);
  for (const width of [360, 430, 480]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of secondWaveRoutes) {
      await page.goto(route.path);
      const nav = page.getByRole("navigation", { name: "Navegación principal" });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link", { name: route.current, exact: true })).toHaveAttribute("aria-current", "page");
      for (const name of primaryLinks) {
        const box = await nav.getByRole("link", { name, exact: true }).boundingBox();
        expect(box, `${name} debe conservar un target táctil medible en ${width}px`).not.toBeNull();
        expect(box!.height, `${name} debe medir al menos 44px de alto en ${width}px`).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${route.path} no debe introducir overflow horizontal a ${width}px`).toBe(true);
    }
  }
});

test("D2 · Login permanece fuera del AppShell de la aplicación autenticada", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(0);
});
