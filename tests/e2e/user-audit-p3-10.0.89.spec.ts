import { expect, test } from "@playwright/test";

test("QA-10 · Preferencias expone nombre accesible para la página inicial", async ({ page }) => {
  await page.goto("/configuration/preferences");
  const home = page.getByRole("combobox", { name: "Página inicial al abrir" });
  await expect(home).toBeVisible();
  await expect(home).toHaveValue("/");
});

test("QA-07 · Análisis muestra primero la lectura principal y deja filtros avanzados bajo demanda", async ({ page }) => {
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: false, latestMovementDate: null, sync: null }),
    });
  });
  await page.goto("/analysis");
  await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
  const advanced = page.getByRole("button", { name: "Mostrar filtros avanzados" });
  await expect(advanced).toBeVisible();
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Mes para análisis avanzado")).toHaveCount(0);
  await advanced.click();
  await expect(page.getByText("Mes para análisis avanzado")).toBeVisible();
});
