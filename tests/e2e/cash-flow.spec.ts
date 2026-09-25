import { expect, test } from "@playwright/test";

test("Cash Flow navega por meses y abre el detalle diario sin inventar cifras", async ({ page }) => {
  await page.goto("/cash-flow?month=2028-02", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Cash Flow", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen de Cash Flow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estado de las previsiones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Flujo acumulado del mes" })).toBeVisible();
  await expect(page.getByText("Sugeridos", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirmados", { exact: true })).toBeVisible();
  await expect(page.getByText("Realizados", { exact: true })).toBeVisible();
  await expect(page.getByText("Descartados", { exact: true })).toBeVisible();

  const calendar = page.getByRole("group", { name: "Días de febrero de 2028" });
  await expect(calendar.locator("button[aria-pressed]")).toHaveCount(29);
  const lastDay = calendar.getByRole("button", { name: /29 de febrero de 2028/ });
  await lastDay.click();
  await expect(lastDay).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: /Detalle del .*29 de febrero de 2028/ })).toBeVisible();

  await page.getByRole("link", { name: "Mes siguiente: marzo de 2028" }).click();
  await expect(page.getByRole("group", { name: "Días de marzo de 2028" }).locator("button[aria-pressed]")).toHaveCount(31);

  // Sin identidad de gateway la app ofrece huecos explícitos y sus enlaces, nunca un balance inventado.
  if (await page.getByText(/No se muestran importes reales/).isVisible()) {
    await expect(page.getByRole("article").filter({ hasText: "Neto real" }).locator("strong")).toHaveText("—");
    await expect(page.getByRole("link", { name: "Abrir Movimientos" })).toBeVisible();
  }
});

test("Cash Flow mantiene los días utilizables en móvil pequeño", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/cash-flow?month=2026-09", { waitUntil: "domcontentloaded" });
  const calendar = page.getByRole("group", { name: "Días de septiembre de 2026" });
  await expect(calendar.locator("button[aria-pressed]")).toHaveCount(30);
  const firstDay = calendar.getByRole("button", { name: /^martes, 1 de septiembre de 2026:/ });
  await firstDay.click();
  await expect(firstDay).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Estado de las previsiones" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
