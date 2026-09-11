import { expect, test, type Page, type Route } from "@playwright/test";

function holdResponse(route: Route, gate: Promise<void>) {
  return gate.then(() => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "temporary_unavailable" }),
  }));
}

test("Inicio pinta estructura útil antes de que terminen las fuentes financieras", async ({ page }: { page: Page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });

  await page.route("**/api/financial?*", (route) => holdResponse(route, gate));
  await page.route("**/api/budgets?*", (route) => holdResponse(route, gate));
  await page.route("**/api/forecast?*", (route) => holdResponse(route, gate));
  await page.route("**/api/transactions?*", (route) => holdResponse(route, gate));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Tu dinero, claro en segundos." })).toBeVisible();
  const primaryNav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(primaryNav).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Inicio", exact: true })).toHaveAttribute("aria-current", "page");

  const cards = page.locator("main[aria-busy='true'] article");
  await expect(cards).toHaveCount(6);
  const expectedSpan = (page.viewportSize()?.width ?? 1280) <= 1050 ? "span 12" : "span 6";
  for (let index = 0; index < 6; index += 1) {
    await expect(cards.nth(index)).toHaveCSS("grid-column-end", expectedSpan);
  }
  await expect(page.getByText("Preparando tu resumen financiero…").first()).toBeVisible();

  release();
  await expect(page.getByRole("heading", { name: "No se ha podido cargar Inicio" })).toBeVisible();
});
