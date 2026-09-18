import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const EMPTY_QUERY = { rows: [], totalCount: 0, hasMore: false, nextCursor: null };
const EMPTY_FACETS = { accounts: [], categories: [], merchants: [] };

test("Movimientos no deja un resultado vacío sin salida y permite quitar filtros", async ({ page }) => {
  const requestedSearches: string[] = [];

  await page.route(/\/api\/transactions(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_FACETS) });
      return;
    }
    requestedSearches.push(url.search);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_QUERY) });
  });

  await page.goto("/transactions?kind=expense");
  await expect(page.getByText("No hay movimientos que coincidan con los filtros actuales.", { exact: true })).toBeVisible();
  const clear = page.getByRole("button", { name: "Limpiar", exact: true });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect.poll(() => requestedSearches.some((search) => !new URLSearchParams(search).has("kind"))).toBe(true);
});

test("Previsión convierte el vacío en acciones reales sin inventar movimientos", () => {
  const source = readFileSync(resolve(process.cwd(), "app/forecast/forecast-client.tsx"), "utf8");

  expect(source).toContain("No hay cargos ni ingresos previstos en este periodo.");
  expect(source).toContain("No se inventan movimientos. Añade uno manual o confirma recurrencias reales para generar fechas futuras.");
  expect(source).toContain('href="/recurrences"');
  expect(source).toContain("<h2>Añadir previsión</h2>");
  expect(source).toContain('busy === "manual" ? "Guardando…" : "Añadir al calendario"');
});

test("Los estados vacíos siguen siendo presentación y reutilizan módulos propietarios", () => {
  const forecast = readFileSync(resolve(process.cwd(), "app/forecast/forecast-client.tsx"), "utf8");
  const transactions = readFileSync(resolve(process.cwd(), "app/transactions/transactions-client.tsx"), "utf8");
  const analysis = readFileSync(resolve(process.cwd(), "app/analysis/analysis-client.tsx"), "utf8");

  expect(transactions).toContain("function clearFilters()");
  expect(transactions).toContain("void fetchPage(EMPTY_FILTERS, null, false)");
  expect(forecast).toContain("createManual");
  expect(forecast).toContain("refreshRecurring");
  expect(analysis).toContain("Sin gasto elegible");
});
