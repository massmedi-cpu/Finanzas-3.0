import { expect, test } from "@playwright/test";

// Explicitly mock reads: no DB or original bank sheet is ever modified.
test("FA-UI-031 · quick presets discard stale conflicting filters but keep owner context", async ({ page }) => {
  await page.route("**/api/transactions**", async (route) => {
    const mode = new URL(route.request().url()).searchParams.get("mode");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(mode === "facets"
        ? { accounts: [], categories: [], merchants: [] }
        : { rows: [], totalCount: 0, hasMore: false, nextCursor: null }),
    });
  });

  await page.goto("/transactions?dateFrom=2026-09-25&dateTo=2026-09-25&q=Mercadona&kind=expense&uncategorized=true&duplicateState=suspected");
  const nav = page.getByRole("navigation", { name: "Filtros rápidos de movimientos" });
  await expect(nav.getByRole("link", { name: "Gastos", exact: true })).not.toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Ingresos", exact: true }).click();
  await expect.poll(() => {
    const p = new URL(page.url()).searchParams;
    return [p.get("kind"), p.get("categoryId"), p.get("uncategorized"), p.get("duplicateState"), p.get("dateFrom"), p.get("q")];
  }).toEqual(["income", null, null, null, "2026-09-25", "Mercadona"]);
  await expect(nav.getByRole("link", { name: "Ingresos", exact: true })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Sin categoría", exact: true }).click();
  await expect.poll(() => {
    const p = new URL(page.url()).searchParams;
    return [p.get("kind"), p.get("categoryId"), p.get("uncategorized"), p.get("duplicateState"), p.get("dateTo")];
  }).toEqual([null, "__uncategorized__", null, null, "2026-09-25"]);
  await expect(nav.getByRole("link", { name: "Sin categoría", exact: true })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Posibles duplicados", exact: true }).click();
  await expect.poll(() => {
    const p = new URL(page.url()).searchParams;
    return [p.get("kind"), p.get("categoryId"), p.get("uncategorized"), p.get("duplicateState"), p.get("q")];
  }).toEqual([null, null, null, "suspected", "Mercadona"]);
  await expect(nav.getByRole("link", { name: "Posibles duplicados", exact: true })).toHaveAttribute("aria-current", "page");
});
