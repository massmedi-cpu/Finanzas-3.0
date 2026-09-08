import { expect, test, type Page } from "@playwright/test";

const routes = [
  { path: "/", current: "Inicio" },
  { path: "/transactions", current: "Movimientos" },
  { path: "/forecast", current: "Previsión" },
] as const;

const primaryLinks = ["Inicio", "Movimientos", "Cuentas", "Presupuestos", "Recurrentes", "Previsión", "Documentos", "Configuración"] as const;

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
      body: JSON.stringify({ error: "app_shell_contract_data_isolated" }),
    });
  });
}

async function expectSharedNavigation(page: Page, current: string) {
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav).toBeVisible();

  for (const name of primaryLinks) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }

  const active = nav.getByRole("link", { name: current, exact: true });
  await expect(active).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link").filter({ has: page.locator('[aria-current="page"]') })).toHaveCount(1);
}

test("D2 · Inicio, Movimientos y Previsión comparten un AppShell persistente con estado activo", async ({ page }) => {
  await isolateShellFromData(page);

  for (const route of routes) {
    await page.goto(route.path);
    await expectSharedNavigation(page, route.current);
  }
});

test("D2 · el AppShell móvil conserva Recurrentes, targets táctiles y cero overflow", async ({ page }) => {
  await isolateShellFromData(page);

  for (const width of [360, 430, 480]) {
    await page.setViewportSize({ width, height: 844 });

    for (const route of routes) {
      await page.goto(route.path);
      const nav = page.getByRole("navigation", { name: "Navegación principal" });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link", { name: "Recurrentes", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: route.current, exact: true })).toHaveAttribute("aria-current", "page");

      for (const name of primaryLinks) {
        const link = nav.getByRole("link", { name, exact: true });
        const box = await link.boundingBox();
        expect(box, `${name} debe conservar un target táctil medible en ${width}px`).not.toBeNull();
        expect(box!.height, `${name} debe medir al menos 44px de alto en ${width}px`).toBeGreaterThanOrEqual(44);
      }

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `${route.path} no debe introducir overflow horizontal a ${width}px`,
      ).toBe(true);
    }
  }
});
