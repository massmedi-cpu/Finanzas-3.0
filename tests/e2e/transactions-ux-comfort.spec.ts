import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const EMPTY_QUERY = { rows: [], totalCount: 0, hasMore: false, nextCursor: null };
const EMPTY_FACETS = { accounts: [], categories: [], merchants: [] };

async function mockTransactions(page: any) {
  await page.route(/\/api\/transactions(?:\?.*)?$/, async (route: any) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_FACETS) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_QUERY) });
  });
}

test("Movimientos ofrece accesos rápidos con filtros canónicos", async ({ page }) => {
  await mockTransactions(page);
  await page.goto("/transactions");

  const nav = page.getByRole("navigation", { name: "Filtros rápidos de movimientos" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Gastos" })).toHaveAttribute("href", "/transactions?kind=expense");
  await expect(nav.getByRole("link", { name: "Ingresos" })).toHaveAttribute("href", "/transactions?kind=income");
  await expect(nav.getByRole("link", { name: "Transferencias" })).toHaveAttribute("href", "/transactions?kind=transfer");
  await expect(nav.getByRole("link", { name: "Sin categoría" })).toHaveAttribute("href", "/transactions?categoryId=__uncategorized__");
  await expect(nav.getByRole("link", { name: "Posibles duplicados" })).toHaveAttribute("href", "/transactions?duplicateState=suspected");
});

test("Un acceso rápido aterriza con el filtro aplicado en el motor existente", async ({ page }) => {
  const requested: string[] = [];
  await page.route(/\/api\/transactions(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_FACETS) });
      return;
    }
    requested.push(url.search);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_QUERY) });
  });

  await page.goto("/transactions?kind=expense");
  const nav = page.getByRole("navigation", { name: "Filtros rápidos de movimientos" });
  await expect(nav.getByRole("link", { name: "Gastos" })).toHaveAttribute("aria-current", "page");
  await expect.poll(() => requested.some((search) => new URLSearchParams(search).get("kind") === "expense")).toBe(true);
});

test("Filtros rápidos caben en móvil y mantienen objetivos táctiles", async ({ page }) => {
  await mockTransactions(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/transactions");

  const nav = page.getByRole("navigation", { name: "Filtros rápidos de movimientos" });
  await expect(nav).toBeVisible();
  const firstPill = nav.getByRole("link", { name: "Todos" });
  const box = await firstPill.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("La mejora de comodidad no crea un segundo motor ni muta el origen bancario", () => {
  const quickNav = readFileSync(resolve(process.cwd(), "app/transactions/transactions-quick-nav.tsx"), "utf8");
  const page = readFileSync(resolve(process.cwd(), "app/transactions/page.tsx"), "utf8");
  expect(page).toContain("<TransactionsClient />");
  expect(quickNav).toContain("/transactions?kind=expense");
  expect(quickNav).toContain("/transactions?duplicateState=suspected");
  expect(quickNav).not.toContain("fetch(");
  expect(quickNav).not.toContain("PATCH");
  expect(quickNav).not.toContain("POST");
});
