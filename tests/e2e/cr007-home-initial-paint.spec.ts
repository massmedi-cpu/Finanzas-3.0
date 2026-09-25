import { expect, test, type Page, type Route } from "@playwright/test";

function holdFailure(route: Route, gate: Promise<void>) {
  return gate.then(() =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "temporary_unavailable" }),
    }),
  );
}

test("Inicio pinta estructura útil antes de que terminen las fuentes financieras", async ({ page }: { page: Page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/api/source/google/sync", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: null }) }),
  );
  await page.route("**/api/dashboard?*", (route) => holdFailure(route, gate));
  await page.route("**/api/financial?*", (route) => holdFailure(route, gate));
  await page.route("**/api/budgets?*", (route) => holdFailure(route, gate));
  await page.route("**/api/forecast?*", (route) => holdFailure(route, gate));
  await page.route("**/api/transactions?*", (route) => holdFailure(route, gate));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
  const primaryNav = page.getByRole("navigation", { name: "Navegación principal" });
  const mobileNav = page.getByRole("navigation", { name: "Navegación móvil" });
  const activeNav = await primaryNav.isVisible() ? primaryNav : mobileNav;
  await expect(activeNav).toBeVisible();
  await expect(activeNav.getByRole("link", { name: "Inicio", exact: true })).toHaveAttribute("aria-current", "page");

  const summary = page.getByRole("region", { name: "Resumen financiero principal" });
  await expect(summary).toBeVisible();
  await expect(summary.locator("article")).toHaveCount(4);
  for (const heading of [
    "Últimos 12 meses",
    "Qué viene después",
    "Disponible por cuenta",
    "Gasto y presupuesto",
    "Últimos movimientos",
  ]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.locator("main[aria-busy='true']")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  release();

  await expect(page.locator("main[aria-busy='true']")).toHaveCount(0);
  await expect(page.getByText("La evolución no está disponible ahora.", { exact: true })).toBeVisible();
  await expect(page.getByText("Las cuentas no están disponibles ahora.", { exact: true })).toBeVisible();
  await expect(page.getByText("Parte del resumen no está disponible", { exact: true })).toBeVisible();
});
