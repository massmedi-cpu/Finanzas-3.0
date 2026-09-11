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
  await expect(page.getByText("Preparando tu resumen financiero…").first()).toBeVisible();

  const geometry = await cards.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
    };
  }));

  const isMobile = (page.viewportSize()?.width ?? 1280) <= 1050;
  if (isMobile) {
    for (let index = 1; index < geometry.length; index += 1) {
      expect(Math.abs(geometry[index].left - geometry[0].left)).toBeLessThanOrEqual(2);
      expect(Math.abs(geometry[index].width - geometry[0].width)).toBeLessThanOrEqual(2);
      expect(geometry[index].top).toBeGreaterThanOrEqual(geometry[index - 1].bottom);
    }
  } else {
    for (let index = 0; index < geometry.length; index += 2) {
      const leftCard = geometry[index];
      const rightCard = geometry[index + 1];
      expect(Math.abs(leftCard.top - rightCard.top)).toBeLessThanOrEqual(2);
      expect(Math.abs(leftCard.width - rightCard.width)).toBeLessThanOrEqual(2);
      expect(leftCard.right).toBeLessThanOrEqual(rightCard.left);
    }
  }

  release();
  await expect(page.getByRole("heading", { name: "No se ha podido cargar Inicio" })).toBeVisible();
});
