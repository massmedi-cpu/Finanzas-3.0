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
  await expect(primaryNav).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Inicio", exact: true })).toHaveAttribute("aria-current", "page");

  const summary = page.getByRole("region", { name: "Resumen financiero principal" });
  await expect(summary).toBeVisible();
  await expect(summary.locator("article")).toHaveCount(5);
  for (const heading of [
    "Ingresos, gastos y balance",
    "Disponible por cuenta",
    "Gasto y presupuesto",
    "Lo que viene",
    "Últimos 10 movimientos",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.locator("main[aria-busy='true']")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  release();

  await expect(page.locator("main[aria-busy='true']")).toHaveCount(0);
  await expect(page.getByText("No se pudo cargar la evolución.")).toBeVisible();
  await expect(page.getByText("Sin cuentas activas.")).toBeVisible();
  await expect(page.getByText(/Algunos módulos no han podido actualizarse:/)).toBeVisible();
});
