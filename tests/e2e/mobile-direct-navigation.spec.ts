import { expect, test } from "@playwright/test";

test("móvil ofrece Inicio, Movimientos, Análisis y Revisar a un toque y el resto en Más", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "mobile_shell_isolated" }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const dock = page.getByRole("navigation", { name: "Navegación móvil" });
  await expect(dock).toBeVisible();
  for (const name of ["Inicio", "Movs.", "Análisis", "Revisar"]) {
    const item = dock.getByRole("link", { name, exact: true });
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await dock.getByRole("button", { name: "Más", exact: true }).click();
  const more = page.getByRole("navigation", { name: "Más secciones" });
  await expect(more.getByRole("link", { name: "Documentos", exact: true })).toHaveAttribute("href", "/documents");
  await expect(more.getByRole("link", { name: "Previsión", exact: true })).toHaveAttribute("href", "/forecast");
  await expect(more.getByRole("link", { name: "Configuración", exact: true })).toHaveAttribute("href", "/configuration");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});