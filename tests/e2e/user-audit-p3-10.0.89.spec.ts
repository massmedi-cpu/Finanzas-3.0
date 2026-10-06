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


async function disableFreshnessNoise(page: Parameters<typeof test>[0]["page"]) {
  await page.route("**/api/analysis/source-freshness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: false, latestMovementDate: null, sync: null }),
    });
  });
}

test("QA-16 · Análisis conserva 3 meses al usar comparación personalizada y evita solapamientos", async ({ page }) => {
  await disableFreshnessNoise(page);
  await page.goto("/analysis?month=2026-09&range=3m");

  await page.getByRole("button", { name: "Mostrar filtros avanzados" }).click();
  const advanced = page.getByRole("region", { name: "Elige qué quieres analizar" });
  await expect(advanced.getByRole("button", { name: "3 meses" })).toHaveAttribute("aria-pressed", "true");
  await advanced.getByLabel("Referencia").selectOption("custom");

  const compareFrom = advanced.getByLabel("Desde");
  const compareTo = advanced.getByLabel("Hasta");
  await expect(compareTo).toHaveAttribute("max", "2026-06-30");

  await compareFrom.fill("2026-04-01");
  await compareTo.fill("2026-06-30");
  await advanced.getByRole("button", { name: "Aplicar cambios" }).click();

  await expect(page).toHaveURL(/\/analysis\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("month")).toBe("2026-09");
  expect(url.searchParams.get("range")).toBe("3m");
  expect(url.searchParams.get("compareMode")).toBe("custom");
  expect(url.searchParams.get("compareDateFrom")).toBe("2026-04-01");
  expect(url.searchParams.get("compareDateTo")).toBe("2026-06-30");
  expect(url.searchParams.get("periodMode")).toBeNull();
});

test("QA-17 · cambios de año y fechas personalizadas activan Aplicar cambios", async ({ page }) => {
  await disableFreshnessNoise(page);

  await page.goto("/analysis?periodMode=year&year=2025");
  await page.getByRole("button", { name: "Mostrar filtros avanzados" }).click();
  const yearAdvanced = page.getByRole("region", { name: "Elige qué quieres analizar" });
  await yearAdvanced.getByRole("spinbutton", { name: "Año" }).fill("2024");
  await expect(yearAdvanced.getByRole("button", { name: "Aplicar cambios" })).toBeVisible();

  await page.goto("/analysis?periodMode=custom&dateFrom=2026-08-01&dateTo=2026-08-31");
  await page.getByRole("button", { name: "Mostrar filtros avanzados" }).click();
  const customAdvanced = page.getByRole("region", { name: "Elige qué quieres analizar" });
  await customAdvanced.getByLabel("Hasta").first().fill("2026-08-30");
  await expect(customAdvanced.getByRole("button", { name: "Aplicar cambios" })).toBeVisible();
});
